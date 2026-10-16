# crm-mcp

Remote-MCP-Server für das Velonify-CRM. Claude (claude.ai, Desktop, Handy, Claude Code) liest und schreibt das CRM mit dem Google-Konto der angemeldeten Person, über dieselbe `CrmService`-Logik wie der Hub (`src/data`, wird beim Bauen mitgebündelt).

## Aufbau

- **Werkzeuge**: Der Server kann alles, was eine Person im Hub kann (117 Werkzeuge). Grundlagen und CRM, Lead-Magnete und To-dos in `src/werkzeuge.ts`, die übrigen Bereiche je Gruppe in `src/gruppen/`: `eingang.ts` (Anfragen, LinkedIn, CSV-Import, Lead-Finder), `kunden.ts` (Client-Hub, Kundenportal, Karten bearbeiten, Board-Spalten), `angebote.ts` (Angebots-Rechner, Contact Generator), `audit.ts` (Shop-Audit, Shop-Roast-Reports, Kalender, Erwähnungen, Einrichtung, Spiele), `social.ts` (Social Media). Gemeinsames steht in `src/hilfen.ts`, Tests nutzen `src/testhilfe.ts` (Demo-Backend mit Demo-Diensten). Was der Server den Modellen zu den Werkzeugen sagt, steht in `ANLEITUNG` (`src/werkzeuge.ts`). Gelöscht wird nichts außer Kalender-Terminen; archivieren lässt sich rückgängig machen. Nicht nachgebaut sind reine Browser-Aktionen (Kopieren, Gmail-Entwurf öffnen, „Als Kunde ansehen“) und technische Einrichtung (Schema, Datenübernahme, Rohdaten-Editor).
- **Dienste**: Contact Generator, Shop-Audit, Lead-Finder und LinkedIn-Abruf laufen wie im Hub über die Cloud Functions `contact-generator` und `shop-audit`, mit dem Google-Token der Person. Die Functions nehmen das Token nur an, wenn die Client-ID dieses Servers in ihrem `GOOGLE_CLIENT_ID` steht (kommagetrennt neben der Hub-Client-ID). Ohne `CONTACT_GENERATOR_URL` bzw. `SHOP_AUDIT_URL` antworten diese Werkzeuge mit einem Hinweis.
- **Anmeldung** (`src/oauth.ts`, `src/google.ts`): Der Server ist sein eigener OAuth-Server (Client ID Metadata Documents von claude.ai sowie Dynamic Client Registration, PKCE S256). Die eigentliche Anmeldung läuft über Google, nur mit @velonify.de. Das Google-Refresh-Token steckt AES-256-GCM-verschlüsselt in den eigenen Codes und Tokens (`src/siegel.ts`), deshalb ohne Datenbank. Zugangstoken gelten 1 Stunde. Nach 90 Tagen ist eine neue Anmeldung fällig. Wer den Zugriff unter myaccount.google.com → Sicherheit → Drittanbieter-Apps entzieht, ist beim nächsten Erneuern draußen.
- **Transport**: Streamable HTTP, zustandslos, unter `/mcp`. Metadaten unter `/.well-known/oauth-protected-resource/mcp` und `/.well-known/oauth-authorization-server`.

## Einrichtung (einmalig)

Die Adresse ist die deterministische Cloud-Run-URL `https://crm-mcp-<PROJEKTNUMMER>.europe-west3.run.app`.

1. **OAuth-Client** in der Google Cloud Console (APIs & Dienste → Anmeldedaten → OAuth-Client-ID erstellen): Typ *Webanwendung*, Name „CRM MCP“, autorisierte Weiterleitungs-URI `<URL>/google-callback`.
2. **Secrets**:
   ```bash
   openssl rand -base64 32 | tr -d '\n' | gcloud secrets create crm-mcp-schluessel --data-file=-
   printf %s '<CLIENT-SECRET>' | gcloud secrets create crm-mcp-google-secret --data-file=-
   ```
3. **Dienstkonto** mit Lesezugriff auf beide Secrets:
   ```bash
   gcloud iam service-accounts create crm-mcp --display-name="CRM MCP"
   for s in crm-mcp-schluessel crm-mcp-google-secret; do
     gcloud secrets add-iam-policy-binding $s --member=serviceAccount:crm-mcp@<PROJEKT>.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
   done
   ```

## Deploy

```bash
npm install && npm test && npm run build
gcloud functions deploy crm-mcp --gen2 --region=europe-west3 --runtime=nodejs24 --source=. --entry-point=crmMcp \
  --trigger-http --no-allow-unauthenticated --service-account=crm-mcp@<PROJEKT>.iam.gserviceaccount.com \
  --set-env-vars=TZ=Europe/Berlin,BASIS_URL=<URL>,SPREADSHEET_ID=<SHEET-ID>,GOOGLE_CLIENT_ID=<CLIENT-ID>,TEAM_ZUORDNUNG=<EMAIL>=<TEAMNAME>,CONTACT_GENERATOR_URL=<URL>,SHOP_AUDIT_URL=<URL>,DB_INSTANZ=velonify-apps:europe-west3:velonify-db,DB_NAME=crm,DB_NUTZER=crm-mcp@velonify-crm.iam \
  --set-secrets=GOOGLE_CLIENT_SECRET=crm-mcp-google-secret:latest,CRM_MCP_SCHLUESSEL=crm-mcp-schluessel:latest
gcloud run services update crm-mcp --region=europe-west3 --no-invoker-iam-check
```

**Seit dem Umzug (15.10.2026) liest und schreibt `crm-mcp` in Postgres** (`DB_INSTANZ`, `DB_NAME`, `DB_NUTZER`; Cloud SQL Connector mit IAM-Anmeldung des Dienstkontos). `--set-env-vars` ersetzt alle Variablen: Fehlt `DB_INSTANZ`, fällt die Function aufs alte Sheet zurück, also immer mitgeben. Die Person hinter dem Google-Login steht im Änderungsprotokoll.

`gcp-build` ist absichtlich leer: Cloud Build bekommt das fertige `dist/index.js` und installiert nur das Functions Framework. Die Org-Policy verbietet `allUsers`, deshalb `--no-invoker-iam-check`. Die Function prüft jede Anfrage selbst.

`TEAM_ZUORDNUNG` ordnet Adressen einem Teamnamen aus der Liste `team` zu, wenn Vorname und Adresse nicht passen (mehrere mit `;` getrennt). Ohne Eintrag sucht der Server wie `useIch` im Hub nach Vorname oder Adresse.

**@-Erwähnungen:** „@Name“ in `karte_kommentieren` (und in allem, was über den Service geschrieben wird) legt Einträge für die Glocke im Hub an. Mit `SLACK_BOT_TOKEN=velonify-slack-bot-token:latest` in `--set-secrets` gehen sie zusätzlich als Slack-Direktnachricht raus; Einrichtung der Slack-App siehe `../crm-api/README.md`.

Wird `crm-mcp-schluessel` gewechselt, müssen sich alle neu verbinden.

**Kalender (seit 0.4.0):** Der Server fragt bei Google zusätzlich `calendar.events` an. Bestehende Verbindungen funktionieren weiter, die Kalender-Werkzeuge brauchen aber ein Neuverbinden des Connectors.

**Contact Generator und Shop-Audit freischalten (einmalig):** Beide Functions mit beiden Client-IDs deployen, z. B. `--update-env-vars=^@^GOOGLE_CLIENT_ID=<HUB-CLIENT-ID>,<MCP-CLIENT-ID>` (das `^@^` setzt ein anderes Trennzeichen, damit das Komma im Wert bleibt).

## In Slack (Claude Tag)

Im Slack-Workspace von Velonify läuft die offizielle Claude-App. Jede Person aus dem Team verbindet diesen Server als persönlichen Connector, für den täglichen Lauf ist er zusätzlich als Admin-Connector mit einem festen Velonify-Konto verbunden. Einrichtung und Text der Routine: Vault `Hub-Intern/Claude in Slack - Einrichtung.md`.

## In Claude verbinden

- **claude.ai / Desktop / Handy**: Einstellungen → Connectors → Eigenen Connector hinzufügen → `<URL>/mcp`. Client-ID und Secret leer lassen.
- **Claude Code**: `claude mcp add --transport http velonify-crm <URL>/mcp`, danach `/mcp` → Anmelden.

## Lokal

```bash
npm run build
GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… CRM_MCP_SCHLUESSEL=… SPREADSHEET_ID=… BASIS_URL=http://localhost:8089 npx functions-framework --target=crmMcp --port=8089
```

Für den Google-Login lokal muss `http://localhost:8089/google-callback` beim OAuth-Client eingetragen sein.
