# Gemeinsamer Code der Functions

Was mehrere Functions brauchen, liegt einmal hier statt als Kopie in jeder Function:

- `auth.ts`: Google-Login prüfen (nur @velonify.de) und einfache Rate-Limits. Nutzen alle fünf Functions.
- `siegel.ts`: versiegelte Werte (AES-256-GCM). `crm-mcp` und `kundenportal` legen darin ihre eigenen Arten und den Namen ihres Schlüssels fest.
- `google.ts`: Tokens des Dienstkontos und aus Refresh-Tokens, Mails über die Gmail-API. Nutzen `crm-api` und `kundenportal`.

Die Tests laufen mit `npm test` in `functions/contact-generator`.

**Deploy:** Jede Function bündelt ihren Code samt `gemeinsam/` mit esbuild nach `dist/index.js`. Deshalb vor jedem `gcloud functions deploy` in der Function `npm ci && npm test && npm run build` ausführen. `gcp-build` ist absichtlich leer, Cloud Build installiert nur die npm-Pakete aus `package.json`.
