# whiteboard-live

Live-Zusammenarbeit der Whiteboards im Velonify Hub (Werkzeug „Whiteboard“, `src/whiteboard/`). Ein kleiner WebSocket-Dienst auf Cloud Run: Er reicht Änderungen, Cursor und Hinweise zwischen allen weiter, die dasselbe Board offen haben. Er speichert nichts und hat keine Datenbank: Gespeichert wird über crm-api (`/whiteboard/<id>/inhalt`), das die Stände Element für Element zusammenführt. Konzept: Vault `Hub-Intern/Whiteboard - Konzept.md`.

## Ablauf

- Der Hub verbindet sich mit `wss://…/live` und schickt als erste Nachricht `{t:'hallo', token, board, name}`. Das Google-Token wird wie in crm-api geprüft (nur @velonify.de); es steht in der Nachricht, nicht in der URL, damit es nicht in den Logs landet.
- Ein Raum je Board, nur im Speicher (`src/raum.ts`). Wer neu dazukommt, bekommt den aktuellen Stand von der Person, die am längsten im Raum ist; ist niemand da, lädt der Hub ihn aus crm-api.
- `--max-instances=1` und `--session-affinity`, damit alle eines Boards im selben Raum landen. Nach einem Neustart verbinden sich die Hubs von selbst neu.
- Tabs im Hintergrund trennen nach 5 Minuten (`src/whiteboard/live.ts` im Hub), damit ein vergessener Tab die Instanz nicht die Nacht über beschäftigt. Cloud Run rechnet, solange eine Verbindung offen ist.

## Einrichtung (einmalig)

```bash
gcloud iam service-accounts create whiteboard-live --display-name="Whiteboard live" --project=velonify-crm
```

Das Dienstkonto braucht keine Rechte: Der Dienst ruft nur Googles `tokeninfo` auf.

## Deploy

```bash
npm install && npm test && npm run build
CLIENT_ID=$(gcloud functions describe crm-api --gen2 --region=europe-west3 --project=velonify-crm --format='value(serviceConfig.environmentVariables.GOOGLE_CLIENT_ID)')
gcloud run deploy whiteboard-live --source=. --region=europe-west3 --project=velonify-crm \
  --service-account=whiteboard-live@velonify-crm.iam.gserviceaccount.com --no-allow-unauthenticated \
  --cpu=1 --memory=256Mi --concurrency=250 --max-instances=1 --min-instances=0 --timeout=3600 --session-affinity \
  --set-env-vars="^;^GOOGLE_CLIENT_ID=$CLIENT_ID;TEAM_ZUORDNUNG=lukas@velonify.de=Lugge"
gcloud run services update whiteboard-live --region=europe-west3 --no-invoker-iam-check --project=velonify-crm
```

Wie bei crm-api verbietet die Org-Policy `allUsers`, deshalb `--no-invoker-iam-check`; der Dienst prüft jede Verbindung selbst. `--timeout=3600` ist die längste Zeit, die eine WebSocket-Verbindung auf Cloud Run offen bleiben darf, danach verbindet der Hub still neu. `gcp-build` ist leer: Cloud Build bekommt das fertige `dist/index.js` und installiert nur `ws`.

Die Adresse des Dienstes braucht der Hub als Build-Variable `WHITEBOARD_LIVE_URL` (GitHub → Settings → Secrets and variables → Actions → Variables; `https://` reicht, der Hub macht `wss://` daraus):

```bash
gh variable set WHITEBOARD_LIVE_URL --repo Velonify/velonify-crm --body "$(gcloud run services describe whiteboard-live --region=europe-west3 --project=velonify-crm --format='value(status.url)')"
```

Optionale Variablen: `ALLOWED_ORIGINS` (Standard crm.velonify.de, velonify.github.io; localhost ist immer erlaubt), `ALLOWED_DOMAIN` (Standard velonify.de). `GET /gesundheit` zeigt, wie viele Räume und Personen gerade verbunden sind.

## Lokal

```bash
npm run build && ANMELDUNG=aus PORT=8095 node dist/index.js
```

`ANMELDUNG=aus` lässt ohne Google-Token herein (nur die Adresse aus der Hallo-Nachricht) und greift nie auf Cloud Run (`K_SERVICE` gesetzt). Im Hub dann `VITE_WHITEBOARD_LIVE_URL=ws://localhost:8095` setzen: Mit dem Demo-Hub (`npm run dev` ohne `.env.local`) lassen sich so zwei Tabs live auf einem Board testen.
