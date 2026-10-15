# kundenportal

Backend des Velonify-Kundenportals (`kunden.velonify.de`). Kunden melden sich per Link an und sehen nur, was im Hub für sie freigegeben ist. Die Regeln dafür stehen in `src/data/portalApi.ts` (wird beim Bauen mitgebündelt): Zugang nur für Kontakte mit aktivem Portal-Zugang bei Firmen mit Status „Kunde“, Karten, News und Links nur mit „Für den Kunden sichtbar“, Dateien nur direkt aus `07_Client-Share`.

## Aufbau

- **`POST /anmelden`** `{ email }` – schickt einen Anmeldelink von hallo@velonify.de. Antwortet immer gleich, damit niemand herausfinden kann, wer einen Zugang hat. Höchstens 3 Links je Adresse in 15 Minuten.
- **`POST /einloesen`** `{ token }` – tauscht den Link gegen eine Sitzung (30 Tage). Der Link gilt 15 Minuten und nur einmal: er enthält den letzten Login, und das Einlösen schreibt einen neuen (`portal_zugaenge.zuletzt_am`).
- **`GET /daten`** – alles für das Portal in einem Abruf (`Kundensicht`). Jeder Abruf prüft den Zugang neu, Abschalten im Hub wirkt also sofort.
- **`GET /datei/<id>`** – lädt eine Datei aus `07_Client-Share`, Google-Dokumente als PDF.

Links und Sitzungen sind mit AES-256-GCM versiegelt (`src/siegel.ts`), es gibt keine Sitzungstabelle. Wird `kundenportal-schluessel` gewechselt, müssen sich alle Kunden neu anmelden.

Die Function liest und schreibt seit dem Umzug in Postgres (Datenbank `crm` auf `velonify-db`, IAM-Anmeldung ihres Dienstkontos, keine Passwörter); Drive liest sie mit demselben Dienstkonto (Token vom Metadatenserver, keine Schlüsseldatei). Ohne `DB_INSTANZ` fiele sie aufs alte Sheet zurück. Mails gehen über die Gmail-API mit einem Refresh-Token des Postfachs hallo@velonify.de (nur `gmail.send`).

## Einrichtung (einmalig)

1. **Dienstkonto**
   ```bash
   gcloud iam service-accounts create kundenportal --display-name="Kundenportal" --project=velonify-crm   # falls noch nicht da
   ```
2. **Zugriff für das Dienstkonto** `kundenportal@velonify-crm.iam.gserviceaccount.com`:
   - Datenbank: Rolle `roles/cloudsql.client` im Projekt `velonify-apps` und `roles/cloudsql.instanceUser`; der IAM-Datenbanknutzer `kundenportal@velonify-crm.iam` und seine Rechte stehen in `velonify-db - Rechte.sql` (Vault).
   - Shared Drive mit den Kundenordnern → Mitglieder verwalten → als **Betrachter** hinzufügen (für Uploads später „Mitbearbeiter“).
3. **Gmail-API** im Projekt aktivieren: `gcloud services enable gmail.googleapis.com`
4. **OAuth-Client für die Mail** in der Cloud Console (APIs & Dienste → Anmeldedaten → OAuth-Client-ID): Typ **Desktop-App**, Name „Kundenportal Mail“. Dann den Refresh-Token holen:
   ```bash
   GMAIL_CLIENT_ID=… GMAIL_CLIENT_SECRET=… node scripts/gmail-token.mjs
   ```
   Beim Anmelden das Postfach wählen, aus dem hallo@velonify.de verschickt: das Konto hallo@ selbst oder das Konto, in dem hallo@ als „Senden als“-Adresse eingerichtet ist.
5. **Secrets**
   ```bash
   openssl rand -base64 32 | tr -d '\n' | gcloud secrets create kundenportal-schluessel --data-file=-
   printf %s '<CLIENT-SECRET>' | gcloud secrets create kundenportal-gmail-secret --data-file=-
   printf %s '<REFRESH-TOKEN>' | gcloud secrets create kundenportal-gmail-token --data-file=-
   for s in kundenportal-schluessel kundenportal-gmail-secret kundenportal-gmail-token; do
     gcloud secrets add-iam-policy-binding $s --member=serviceAccount:kundenportal@<PROJEKT>.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
   done
   ```

## Deploy

```bash
npm install && npm test && npm run build
gcloud functions deploy kundenportal --gen2 --region=europe-west3 --runtime=nodejs24 --source=. --entry-point=kundenportal \
  --trigger-http --no-allow-unauthenticated --service-account=kundenportal@<PROJEKT>.iam.gserviceaccount.com \
  --set-env-vars=TZ=Europe/Berlin,PORTAL_URL=https://kunden.velonify.de,DB_INSTANZ=velonify-apps:europe-west3:velonify-db,DB_NAME=crm,DB_NUTZER=kundenportal@velonify-crm.iam,GMAIL_CLIENT_ID=<CLIENT-ID>,WEITERE_ORIGINS=http://localhost:5198 \
  --set-secrets=PORTAL_SCHLUESSEL=kundenportal-schluessel:latest,GMAIL_CLIENT_SECRET=kundenportal-gmail-secret:latest,GMAIL_REFRESH_TOKEN=kundenportal-gmail-token:latest
gcloud run services update kundenportal --region=europe-west3 --no-invoker-iam-check
```

`gcp-build` ist absichtlich leer: Cloud Build bekommt das fertige `dist/index.js`. Die Org-Policy verbietet `allUsers`, deshalb `--no-invoker-iam-check`. Die Function prüft jede Anfrage selbst. `WEITERE_ORIGINS` erlaubt zusätzliche Browser-Adressen (lokale Entwicklung), `MAIL_ABSENDER` ändert den Absender (Standard „Velonify <hallo@velonify.de>“).
