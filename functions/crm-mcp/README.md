# crm-mcp

Remote-MCP-Server für das Velonify-CRM. Claude (claude.ai, Desktop, Handy, Claude Code) liest und schreibt das CRM mit dem Google-Konto der angemeldeten Person, über dieselbe `CrmService`-Logik wie der Hub (`src/data`, wird beim Bauen mitgebündelt).

## Aufbau

- **Werkzeuge** (`src/werkzeuge.ts`): `ueberblick`, `suchen`, `firma_anzeigen`, `pipeline`, `mein_tag` (lesen) sowie `lead_anlegen`, `firma_aendern`, `kontakt_speichern`, `deal_speichern`, `phase_aendern`, `vernetzung_ergebnis`, `notiz_hinzufuegen`, `wiedervorlage_setzen`, `wiedervorlage_erledigt`, `archivieren` (schreiben). Für die Lead-Magnete: `magnete`, `magnet_leads` (lesen) sowie `magnet_speichern`, `magnet_lead_uebernehmen`, `magnet_lead_verwerfen` (schreiben); `archivieren` nimmt auch einen Magneten. Gelöscht wird nichts, archivieren lässt sich rückgängig machen.
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
  --set-env-vars=TZ=Europe/Berlin,BASIS_URL=<URL>,SPREADSHEET_ID=<SHEET-ID>,GOOGLE_CLIENT_ID=<CLIENT-ID>,TEAM_ZUORDNUNG=<EMAIL>=<TEAMNAME> \
  --set-secrets=GOOGLE_CLIENT_SECRET=crm-mcp-google-secret:latest,CRM_MCP_SCHLUESSEL=crm-mcp-schluessel:latest
gcloud run services update crm-mcp --region=europe-west3 --no-invoker-iam-check
```

`gcp-build` ist absichtlich leer: Cloud Build bekommt das fertige `dist/index.js` und installiert nur das Functions Framework. Die Org-Policy verbietet `allUsers`, deshalb `--no-invoker-iam-check`. Die Function prüft jede Anfrage selbst.

`TEAM_ZUORDNUNG` ordnet Adressen einem Teamnamen aus der Liste `team` zu, wenn Vorname und Adresse nicht passen (mehrere mit `;` getrennt). Ohne Eintrag sucht der Server wie `useIch` im Hub nach Vorname oder Adresse.

Wird `crm-mcp-schluessel` gewechselt, müssen sich alle neu verbinden.

## In Claude verbinden

- **claude.ai / Desktop / Handy**: Einstellungen → Connectors → Eigenen Connector hinzufügen → `<URL>/mcp`. Client-ID und Secret leer lassen.
- **Claude Code**: `claude mcp add --transport http velonify-crm <URL>/mcp`, danach `/mcp` → Anmelden.

## Lokal

```bash
npm run build
GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… CRM_MCP_SCHLUESSEL=… SPREADSHEET_ID=… BASIS_URL=http://localhost:8089 npx functions-framework --target=crmMcp --port=8089
```

Für den Google-Login lokal muss `http://localhost:8089/google-callback` beim OAuth-Client eingetragen sein.
