# crm-api

Die API zwischen Hub und Postgres. Seit dem Umzug vom Google Sheet liegen die Daten des Hubs in der Datenbank `crm` auf der Cloud-SQL-Instanz `velonify-db` (Projekt `velonify-apps`). Konzept: `Hub-Intern/CRM - Umzug Cloud SQL.md` im Vault.

## Aufbau

- **Hub** (`src/data/api/apiStore.ts`): `GET /daten/<gruppe>`, `POST /einfuegen`, `POST /aendern`, `POST /einstellungen`, 1:1 zur `Store`-Schnittstelle. Anmeldung mit dem Google-Token, das der Hub ohnehin hat (`tokeninfo`, nur @velonify.de, wie im Contact Generator). Konflikte über `geaendert_am` kommen als 409 zurück.
- **Übernahme aus dem Sheet** (`/admin/uebernahme`, `/admin/zaehlen`, nur Lukas und Julian): Die Karte *Einrichtung → Übernahme aus dem Sheet* liest das Sheet im Browser und schickt es hierher, wahlweise nach `crm_test` (Probelauf) oder `crm`.
- **Website** (`/extern/eingang`, `/extern/magnete`, Token im Query-String): ersetzt die Apps Scripts `eingang` und `magnete` mit demselben Antwortformat (HTTP 200, Ergebnis in `status`). Die Netlify-Functions der Website brauchen dafür nur neue Adressen in `CRM_EINGANG_URL` und `CRM_MAGNETE_URL`. Magnet-Mails gehen über die Gmail-API (Refresh-Token von lukas@, nur `gmail.send`).
- **Datenbank** (`../../db/verbindung.ts`): Cloud SQL Connector mit IAM-Anmeldung als `crm-api@velonify-crm.iam`, keine Passwörter. Pool mit 3 Verbindungen, die Rolle darf höchstens 5.
- **Änderungsprotokoll**: Jede Schreibanfrage setzt `app.person`, ein Trigger schreibt alte und neue Werte nach `aenderungen`.

## Einrichtung (einmalig)

Instanz, Datenbanken, Dienstkonto `crm-api` und die Datenbankrechte gibt es seit dem 15.10.2026 (Vault: `velonify-db - Rechte.sql`). Dazu kommt:

```bash
# Migrationen (als crm_owner, mit dem eigenen IAM-Benutzer)
npm run db:migrieren -- crm_test
npm run db:migrieren -- crm

# Gmail-API und die Secrets der Website-Routen
gcloud services enable gmail.googleapis.com --project=velonify-crm
for s in crm-api-eingang-token crm-api-magnete-token; do
  openssl rand -hex 24 | tr -d '\n' | gcloud secrets create $s --data-file=- --project=velonify-crm
done
# Gmail-Zugang für die Magnet-Mails (OAuth-Client „CRM MCP“ braucht die Weiterleitung http://localhost:8765/gmail-callback)
GOOGLE_CLIENT_SECRET=$(gcloud secrets versions access latest --secret=crm-mcp-google-secret --project=velonify-crm) \
  node scripts/gmail-token.mjs <CLIENT-ID-CRM-MCP>

for s in crm-api-eingang-token crm-api-magnete-token crm-api-gmail-token crm-mcp-google-secret; do
  gcloud secrets add-iam-policy-binding $s --project=velonify-crm \
    --member=serviceAccount:crm-api@velonify-crm.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
done
```

## Deploy

```bash
npm install && npm test && npm run build
gcloud functions deploy crm-api --gen2 --region=europe-west3 --runtime=nodejs24 --source=. --entry-point=crmApi \
  --trigger-http --no-allow-unauthenticated --service-account=crm-api@velonify-crm.iam.gserviceaccount.com \
  --memory=512Mi --max-instances=3 --min-instances=0 --project=velonify-crm \
  --set-env-vars=TZ=Europe/Berlin,DB_INSTANZ=velonify-apps:europe-west3:velonify-db,DB_NUTZER=crm-api@velonify-crm.iam,DB_NAME=crm,GOOGLE_CLIENT_ID=<CLIENT-ID-HUB>,GMAIL_CLIENT_ID=<CLIENT-ID-CRM-MCP> \
  --set-secrets=EINGANG_TOKEN=crm-api-eingang-token:latest,MAGNETE_TOKEN=crm-api-magnete-token:latest,GMAIL_REFRESH_TOKEN=crm-api-gmail-token:latest,GMAIL_CLIENT_SECRET=crm-mcp-google-secret:latest
gcloud run services update crm-api --region=europe-west3 --no-invoker-iam-check --project=velonify-crm
```

`gcp-build` ist absichtlich leer: Cloud Build bekommt das fertige `dist/index.js` und installiert nur Functions Framework, `pg` und den Connector. Die Org-Policy verbietet `allUsers`, deshalb `--no-invoker-iam-check`; die Function prüft jede Anfrage selbst.

Optionale Variablen: `ALLOWED_ORIGINS` (Standard crm.velonify.de, velonify.github.io, localhost), `ADMINS` (Übernahme), `MAIL_ABSENDER` (Standard „Lukas von Velonify <lukas@velonify.de>“), `MAIL_ANTWORT_AN`, `SIGNATUR_NAME`, `BASIS_URL`.

## Lokal

```bash
npm run build
DB_INSTANZ=velonify-apps:europe-west3:velonify-db DB_NUTZER=lukas@velonify.de DB_NAME=crm_test GOOGLE_CLIENT_ID=<CLIENT-ID-HUB> \
  npx functions-framework --target=crmApi --port=8090
```

Mit dem eigenen IAM-Benutzer (gcloud ADC). Im Hub dann `VITE_CRM_API_URL=http://localhost:8090` in `.env.local`.
