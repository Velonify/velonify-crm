# kundenportal

Backend des Velonify-Kundenportals. Das Frontend liegt im Repo [Velonify/velonify-kundenportal](https://github.com/Velonify/velonify-kundenportal) und läuft unter https://kunden.velonify.de (lokal auf http://localhost:5199). Kunden melden sich per Link an, sehen nur, was im Velonify Hub für sie freigegeben ist, und können mitmachen: Freigaben beantworten, kommentieren, Anfragen stellen und Dateien hochladen.

Die Regeln stehen in `src/data/portalApi.ts` (was der Kunde sieht) und `src/data/portalAktionen.ts` (was er ändern darf); beides wird beim Bauen mitgebündelt. Zugang nur für Kontakte mit aktivem Portal-Zugang bei Firmen mit Status „Kunde“, Karten, News und Links nur mit „Für den Kunden sichtbar“, Dateien nur direkt aus `07_Client-Share` und aus `07_Client-Share/Vom Kunden`. Schreibende Aufrufe prüfen jedes Mal serverseitig, dass die Karte auf dem (nicht archivierten) Board der eigenen Firma liegt, für den Kunden sichtbar und nicht archiviert ist.

## Aufbau

- **`POST /anmelden`** `{ email }` – schickt einen Anmeldelink von hallo@velonify.de. Antwortet immer gleich, damit niemand herausfinden kann, wer einen Zugang hat. Höchstens 3 Links je Adresse in 15 Minuten.
- **`POST /einloesen`** `{ token }` – tauscht den Link gegen eine Sitzung (30 Tage). Der Link gilt 15 Minuten und nur einmal: er enthält den letzten Login, und das Einlösen schreibt einen neuen (`portal_zugaenge.zuletzt_am`).
- **`GET /daten`** – alles für das Portal in einem Abruf (`Kundensicht`). Jeder Abruf prüft den Zugang neu, Abschalten im Hub wirkt also sofort.
- **`GET /datei/<id>`** – lädt eine Datei aus `07_Client-Share` oder `07_Client-Share/Vom Kunden`, Google-Dokumente als PDF.

Mitmachen (alle mit der Sitzung als `Authorization: Bearer …`, höchstens 60 Änderungen je Kontakt in 10 Minuten; Fehler kommen wie überall als `{ fehler }`):

- **`POST /freigabe`** `{ karte_id, entscheidung: 'freigegeben' | 'aenderung', notiz? }` – nur solange die Freigabe der Karte „offen“ ist (sonst 409). Bei `aenderung` ist die Notiz Pflicht; eine Notiz landet zusätzlich als Kommentar an der Karte. Antwort: die Karte (`PortalKarte`).
- **`POST /kommentar`** `{ karte_id, text }` – Kommentar an einer sichtbaren Karte. Antwort: die Karte.
- **`POST /anfrage`** `{ titel, details?, dringend?, datei_ids? }` – neue Karte in der ersten Spalte des Kunden-Boards (Quelle „kunde“, für den Kunden sichtbar, Label „Dringend“, zuständig sind die Zuständigen der Firma) und eine interne Kunden-News „Neue Anfrage: …“ für das Team. Anhänge nur aus „Vom Kunden“. Ohne Board: 409. Antwort: die neue Karte.
- **`POST /hochladen`** – Datei roh im Body, `Content-Type` = Dateityp, Dateiname URI-kodiert in `X-Dateiname`. Landet in `07_Client-Share/Vom Kunden` (wird bei Bedarf angelegt). Höchstens 25 MB (413 mit Hinweis auf WeTransfer). JSON-Dateien besser als `application/octet-stream` schicken und den echten Typ in `X-Dateityp` angeben, sonst parst das Functions Framework den Body. Antwort: `PortalDatei`.

Titel höchstens 200, Texte höchstens 5.000 Zeichen.

Links und Sitzungen sind mit AES-256-GCM versiegelt (`src/siegel.ts`), es gibt keine Sitzungstabelle. Wird `kundenportal-schluessel` gewechselt, müssen sich alle Kunden neu anmelden.

Die Function liest und schreibt seit dem Umzug in Postgres (Datenbank `crm` auf `velonify-db`, IAM-Anmeldung ihres Dienstkontos, keine Passwörter); Drive liest sie mit demselben Dienstkonto (Token vom Metadatenserver, keine Schlüsseldatei). Ohne `DB_INSTANZ` fiele sie aufs alte Sheet zurück. Mails gehen über die Gmail-API mit einem Refresh-Token des Postfachs hallo@velonify.de (nur `gmail.send`).

## Mehrere Kunden je Person

Betreut eine Person mehrere Kunden, wird sie im Hub bei jedem Kunden als Kontakt mit derselben E-Mail-Adresse angelegt und bekommt dort jeweils einen Zugang. Der Anmeldelink öffnet den Kunden, der zuletzt benutzt wurde. `Kundensicht.firmen` listet alle Kunden mit aktivem Zugang. `POST /wechseln { firma_id }` gibt eine Sitzung für einen anderen Kunden derselben Adresse zurück und prüft dabei den Zugang dort. Ist ein Zugang im Hub ausgeschaltet, verschwindet der Kunde sofort aus der Liste.

## Team-Zugang

Im Hub auf der Kundenseite → Reiter „Portal“ → **Portal öffnen**. Der Hub schickt sein Google-Token an `POST /vorschau` `{ firma_id }`. Die Function prüft es wie crm-api (OAuth-Client des Hubs in `GOOGLE_CLIENT_ID`, nur verifizierte @velonify.de-Konten) und gibt eine Team-Sitzung für 8 Stunden zurück. Das Portal öffnet sie über `#/vorschau/<sitzung>`. Im Team-Zugang:
- sieht man alles wie ein Kontakt der Firma und hat dieselben Knöpfe (Anfrage, Freigabe, Kommentar, Hochladen),
- wird alles unter der eigenen @velonify.de-Adresse gespeichert, erscheint also als Velonify (z. B. „Lukas“), nie als Kunde; Anfragen tragen im Hub-Hinweis „Lukas (Velonify)“,
- gibt es keinen Kunden-Umschalter,
- verlängert sich die Sitzung nicht.

Der Hub braucht dafür die Repo-Variable `KUNDENPORTAL_API_URL`, die Function `GOOGLE_CLIENT_ID` (Client-ID des Hubs). `https://crm.velonify.de` ist als Origin immer erlaubt (`HUB_URL` ändert das).

## Updates und Benachrichtigungen

Jeder Kontakt stellt im Portal unter **Benachrichtigungen** ein (Hub: Kundenseite → Portal → Zugänge):
- **Updates** (Zusammenfassung): täglich (werktags), wöchentlich (montags), monatlich (am 1.) jeweils ab 8 Uhr, oder aus. Standard: wöchentlich. Ohne Inhalt wird nichts geschickt.
- **Sofort-Benachrichtigungen** (immer an): Freigabe nötig, Antwort vom Team, Meilenstein erreicht, neue Datei in 07_Client-Share, sichtbare Neuigkeit. Eigene Aktionen des Kontakts lösen nichts aus.
- **Weg** je Art: E-Mail, Slack (Channel der Firma) oder beides. Slack geht pro Kunde und Lauf nur einmal raus; klappt Slack nicht, kommt eine E-Mail.

`POST /versand` erledigt einen Lauf und wird von Cloud Scheduler alle 15 Minuten aufgerufen (Header `X-Versand-Schluessel`). Jeder Zugang merkt sich `hinweise_bis` und `update_am`; der erste Lauf startet nur die Uhr. Fehlgeschlagene Mails werden im nächsten Lauf wiederholt. Für Slack muss die App „Velonify Hub“ im Channel des Kunden sein (`/invite @Velonify Hub`).

Einrichtung:
```bash
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create kundenportal-versand --data-file=- --project=velonify-crm
for s in kundenportal-versand velonify-slack-bot-token; do
  gcloud secrets add-iam-policy-binding $s --member=serviceAccount:kundenportal@velonify-crm.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor --project=velonify-crm
done
# Deploy wie unten, zusätzlich: --update-secrets=VERSAND_SCHLUESSEL=kundenportal-versand:latest,SLACK_BOT_TOKEN=velonify-slack-bot-token:latest
gcloud scheduler jobs create http kundenportal-versand --project=velonify-crm --location=europe-west3 \
  --schedule='*/15 * * * *' --time-zone=Europe/Berlin --http-method=POST \
  --uri=https://europe-west3-velonify-crm.cloudfunctions.net/kundenportal/versand \
  --headers=X-Versand-Schluessel=$(gcloud secrets versions access latest --secret=kundenportal-versand --project=velonify-crm)
```

## Tracking-Hub (Zahlen)

Je Kunde im Hub (Kundenseite → Portal → Tracking): GA4-Property-ID, Search-Console-Property, Seite für PageSpeed und ob der Kunde den Tab „Zahlen“ sieht (Tabelle `kunden_tracking`, Migration 008). `POST /kennzahlen` holt die letzten 28 Tage gegen die 28 davor (Search Console zwei Tage versetzt) und PageSpeed mobil + Desktop und speichert den Stand als JSON in `kunden_tracking.daten`. Aufruf vom Scheduler (Header `X-Versand-Schluessel`, alle Kunden) oder aus dem Hub („Jetzt abrufen“, Google-Token, `{ firma_id }`). Fällt eine Quelle aus, bleiben die Zahlen vom Vortag stehen, der Grund steht in `fehler` und im Hub.

GA4 und Search Console liest das Konto **hallo@velonify.de**: Der Kunde (oder wir) trägt es in GA4 als Betrachter und in der Search Console als Nutzer ein.

Einrichtung:
```bash
gcloud services enable analyticsdata.googleapis.com searchconsole.googleapis.com --project=velonify-crm
# Token holen (OAuth-Client wie für die Mail), als hallo@velonify.de anmelden:
GMAIL_CLIENT_ID=… GMAIL_CLIENT_SECRET=… node scripts/analytics-token.mjs
printf %s '<REFRESH-TOKEN>' | gcloud secrets create kundenportal-analytics-token --data-file=- --project=velonify-crm
for s in kundenportal-analytics-token pagespeed-api-key; do
  gcloud secrets add-iam-policy-binding $s --member=serviceAccount:kundenportal@velonify-crm.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor --project=velonify-crm
done
# Deploy wie unten, zusätzlich: --timeout=300s --update-secrets=ANALYTICS_REFRESH_TOKEN=kundenportal-analytics-token:latest,PAGESPEED_API_KEY=pagespeed-api-key:latest
gcloud scheduler jobs create http kundenportal-kennzahlen --project=velonify-crm --location=europe-west3 \
  --schedule='0 6 * * *' --time-zone=Europe/Berlin --http-method=POST --attempt-deadline=300s \
  --uri=https://europe-west3-velonify-crm.cloudfunctions.net/kundenportal/kennzahlen \
  --headers=X-Versand-Schluessel=$(gcloud secrets versions access latest --secret=kundenportal-versand --project=velonify-crm)
```

## Monatsbericht

Je Kunde im Hub einschalten (Karte „Tracking“ → „Monatsbericht“, Spalte `kunden_tracking.monatsbericht`, Migration 009). Der tägliche Lauf von `POST /kennzahlen` legt in den ersten sieben Tagen eines Monats den Entwurf für den Vormonat an (Tabelle `kunden_berichte`) und rechnet ihn bis dahin jeden Morgen neu, damit die Search Console (rund zwei Tage Verzug) vollständig ist. Inhalt: GA4 und Search Console für den Kalendermonat gegen den Vormonat, die letzte PageSpeed-Messung, die im Monat erledigten freigegebenen Karten, erreichte Meilensteine und was als Nächstes ansteht.

Im Hub (Portal → Monatsberichte) schreibt das Team die Einschätzung und gibt frei; erst dann sieht der Kunde den Bericht unter „Zahlen“ und bekommt mit dem nächsten `/versand` einen Sofort-Hinweis. `POST /bericht` (Google-Token, `{ firma_id, monat? }`) erstellt einen Entwurf für einen abgeschlossenen Monat oder rechnet ihn neu; freigegebene Berichte bleiben unverändert. Das PDF entsteht im Portal über „Als PDF speichern“ (Druckansicht).

## Einrichtung (einmalig)

1. **Dienstkonto**
   ```bash
   gcloud iam service-accounts create kundenportal --display-name="Kundenportal" --project=velonify-crm   # falls noch nicht da
   ```
2. **Zugriff für das Dienstkonto** `kundenportal@velonify-crm.iam.gserviceaccount.com`:
   - Datenbank: Rolle `roles/cloudsql.client` im Projekt `velonify-apps` und `roles/cloudsql.instanceUser`; der IAM-Datenbanknutzer `kundenportal@velonify-crm.iam` und seine Rechte stehen in `velonify-db - Rechte.sql` (Vault).
   - Datenbank-Schreibrechte für das Mitmachen (Karten, Kommentare, Kunden-News anlegen, Freigabe ändern) kommen mit der Migration `db/migrationen/004_rechte_kundenportal_mitmachen.sql` (`npm run db:migrieren` im Repo-Root).
   - Shared Drive mit den Kundenordnern → Mitglieder verwalten → als **Mitbearbeiter** (Contributor) hinzufügen. „Betrachter“ reicht nur zum Lesen; für Uploads und den Ordner „Vom Kunden“ braucht es Mitbearbeiter.
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
  --set-env-vars='^;^TZ=Europe/Berlin;PORTAL_URL=https://kunden.velonify.de;DB_INSTANZ=velonify-apps:europe-west3:velonify-db;DB_NAME=crm;DB_NUTZER=kundenportal@velonify-crm.iam;GMAIL_CLIENT_ID=<CLIENT-ID>;WEITERE_ORIGINS=http://localhost:5198,http://localhost:5199' \
  --set-secrets=PORTAL_SCHLUESSEL=kundenportal-schluessel:latest,GMAIL_CLIENT_SECRET=kundenportal-gmail-secret:latest,GMAIL_REFRESH_TOKEN=kundenportal-gmail-token:latest
gcloud run services update kundenportal --region=europe-west3 --no-invoker-iam-check
```

`gcp-build` ist absichtlich leer: Cloud Build bekommt das fertige `dist/index.js`. Die Org-Policy verbietet `allUsers`, deshalb `--no-invoker-iam-check`. Die Function prüft jede Anfrage selbst. `WEITERE_ORIGINS` erlaubt zusätzliche Browser-Adressen (lokale Entwicklung; das neue Frontend läuft lokal auf Port 5199), mit Komma getrennt – deshalb trennt `^;^` am Anfang von `--set-env-vars` die Variablen mit Semikolon statt Komma. Für die neuen Endpunkte braucht es sonst keine neuen Variablen oder Secrets. `MAIL_ABSENDER` ändert den Absender (Standard „Velonify <hallo@velonify.de>“).
