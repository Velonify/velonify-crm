# crm-api

Die API zwischen Hub und Postgres. Seit dem Umzug vom Google Sheet liegen die Daten des Hubs in der Datenbank `crm` auf der Cloud-SQL-Instanz `velonify-db` (Projekt `velonify-apps`). Konzept: `Hub-Intern/CRM - Umzug Cloud SQL.md` im Vault.

## Aufbau

- **Hub** (`src/data/api/apiStore.ts`): `GET /daten/<gruppe>`, `POST /einfuegen`, `POST /aendern`, `POST /einstellungen`, 1:1 zur `Store`-Schnittstelle. Anmeldung mit dem Google-Token, das der Hub ohnehin hat (`tokeninfo`, nur @velonify.de, wie im Contact Generator). Konflikte über `geaendert_am` kommen als 409 zurück.
- **Übernahme aus dem Sheet** (`/admin/uebernahme`, `/admin/zaehlen`, nur Lukas und Julian): Die Karte *Einrichtung → Übernahme aus dem Sheet* liest das Sheet im Browser und schickt es hierher, wahlweise nach `crm_test` (Probelauf) oder `crm`.
- **Datenansicht** (`GET /tabelle/<tab>`, `GET /verlauf/<tab>/<id>`, `POST /listen`): *Einrichtung → Daten* im Hub, für das ganze Team. Einträge ändern läuft über `/aendern` mit Konfliktprüfung, „Zurücknehmen“ schreibt die alten Werte aus `aenderungen` zurück. Löschen darf die API nur in `listen` (Migration 003).
- **Lese-Spiegel** (`POST /extern/spiegel?token=…`): Cloud Scheduler startet ihn jede Nacht. Er schreibt alle Tabellen in ein Sheet, das das Team nur lesen kann (`SPIEGEL_SHEET_ID`), mit dem Dienstkonto der Function.
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

### Lese-Spiegel (einmalig)

1. Neues Google Sheet „CRM-Spiegel (nur lesen)“ anlegen, im eigenen Drive (nicht in der Shared Drive, damit das Team dort nur Leserechte haben kann). Mit `crm-api@velonify-crm.iam.gserviceaccount.com` als **Bearbeiter** teilen, mit dem Team als **Betrachter**.
2. Schlüssel und nächtlicher Aufruf:

```bash
openssl rand -hex 24 | tr -d '\n' | gcloud secrets create crm-api-spiegel-token --data-file=- --project=velonify-crm
gcloud secrets add-iam-policy-binding crm-api-spiegel-token --project=velonify-crm \
  --member=serviceAccount:crm-api@velonify-crm.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
gcloud scheduler jobs create http crm-spiegel --location=europe-west3 --project=velonify-crm --schedule="30 2 * * *" --time-zone=Europe/Berlin \
  --http-method=POST --uri="https://europe-west3-velonify-crm.cloudfunctions.net/crm-api/extern/spiegel?token=$(gcloud secrets versions access latest --secret=crm-api-spiegel-token --project=velonify-crm)" \
  --attempt-deadline=300s
```

Beim Deploy zusätzlich `SPIEGEL_SHEET_ID=<ID aus der Sheet-URL>` in `--set-env-vars`.

### Slack-Benachrichtigung für @-Erwähnungen (optional)

Wer im Hub oder über den CRM-MCP mit „@Name“ markiert wird, bekommt immer einen Eintrag unter der Glocke. Mit dem Token einer eigenen Slack-App schicken crm-api und crm-mcp zusätzlich eine Direktnachricht.

1. Unter api.slack.com/apps im Velonify-Workspace eine App „Velonify Hub“ anlegen (From scratch). Unter *OAuth & Permissions* die Bot-Scopes `chat:write`, `users:read` und `users:read.email` eintragen und *Install to Workspace* klicken. Unter *App Home* den Messages Tab einschalten, damit die Direktnachrichten dort lesbar sind.
2. Den *Bot User OAuth Token* (`xoxb-…`) als Secret speichern und beiden Dienstkonten Lesezugriff geben:

```bash
printf %s 'xoxb-…' | gcloud secrets create velonify-slack-bot-token --data-file=- --project=velonify-crm
for sa in crm-api crm-mcp; do
  gcloud secrets add-iam-policy-binding velonify-slack-bot-token --project=velonify-crm \
    --member=serviceAccount:$sa@velonify-crm.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
done
```

3. Beim Deploy von crm-api und crm-mcp `SLACK_BOT_TOKEN=velonify-slack-bot-token:latest` an `--set-secrets` anhängen. Bei crm-api zusätzlich `TEAM_ZUORDNUNG=lukas@velonify.de=Lugge` in `--set-env-vars`, wie beim MCP: Darüber findet die Function den Slack-Nutzer zum Teamnamen „Lugge“. Alle anderen werden über Vorname oder Adresse gefunden.

Ohne `SLACK_BOT_TOKEN` bleibt es bei der Glocke. Kann Slack nicht zustellen, wird das nur geloggt, der Kommentar ist trotzdem gespeichert. `HUB_URL` (Standard https://crm.velonify.de) bestimmt den Link in der Nachricht.

## Deploy

```bash
npm install && npm test && npm run build
gcloud functions deploy crm-api --gen2 --region=europe-west3 --runtime=nodejs24 --source=. --entry-point=crmApi \
  --trigger-http --no-allow-unauthenticated --service-account=crm-api@velonify-crm.iam.gserviceaccount.com \
  --memory=512Mi --cpu=1 --concurrency=40 --max-instances=1 --min-instances=0 --project=velonify-crm \
  --set-env-vars=TZ=Europe/Berlin,DB_INSTANZ=velonify-apps:europe-west3:velonify-db,DB_NUTZER=crm-api@velonify-crm.iam,DB_NAME=crm,GOOGLE_CLIENT_ID=<CLIENT-ID-HUB>,GMAIL_CLIENT_ID=<CLIENT-ID-CRM-MCP>,SPIEGEL_SHEET_ID=<SHEET-ID> \
  --set-secrets=EINGANG_TOKEN=crm-api-eingang-token:latest,MAGNETE_TOKEN=crm-api-magnete-token:latest,SPIEGEL_TOKEN=crm-api-spiegel-token:latest,GMAIL_REFRESH_TOKEN=crm-api-gmail-token:latest,GMAIL_CLIENT_SECRET=crm-mcp-google-secret:latest
gcloud run services update crm-api --region=europe-west3 --no-invoker-iam-check --project=velonify-crm
```

**Eine Instanz, viele Anfragen gleichzeitig** (`--cpu=1 --concurrency=40 --max-instances=1`): Mit der Voreinstellung (eine Anfrage je Instanz) startet Google bei jedem parallelen Laden eine weitere Instanz mit eigenen Verbindungen, und das Konto `crm-api` darf nur 5. So bleibt es bei höchstens 4 (3 für `crm`, 1 für Probeläufe in `crm_test`).

`gcp-build` ist absichtlich leer: Cloud Build bekommt das fertige `dist/index.js` und installiert nur Functions Framework, `pg` und den Connector. Die Org-Policy verbietet `allUsers`, deshalb `--no-invoker-iam-check`; die Function prüft jede Anfrage selbst.

Optionale Variablen: `ALLOWED_ORIGINS` (Standard crm.velonify.de, velonify.github.io, localhost), `ADMINS` (Übernahme), `MAIL_ABSENDER` (Standard „Lukas von Velonify <lukas@velonify.de>“), `MAIL_ANTWORT_AN`, `SIGNATUR_NAME`, `BASIS_URL`.

## Lokal

```bash
npm run build
DB_INSTANZ=velonify-apps:europe-west3:velonify-db DB_NUTZER=lukas@velonify.de DB_NAME=crm_test GOOGLE_CLIENT_ID=<CLIENT-ID-HUB> \
  npx functions-framework --target=crmApi --port=8090
```

Mit dem eigenen IAM-Benutzer (gcloud ADC). Im Hub dann `VITE_CRM_API_URL=http://localhost:8090` in `.env.local`.
