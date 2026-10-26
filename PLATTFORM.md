# Velonify Hub für Mandanten (Tester und Kunden)

Derselbe Hub, gebaut mit `VITE_MANDANTEN=1`, läuft unter **app.velonify.de** für eingeladene Teams. Konzept und Preise: Vault `Hub-Intern/SaaS - Tester-Zugang & Konvertierung.md`.

## Aufbau

- **Anmeldung:** jedes Google-Konto, aber nur Adressen auf der Whitelist (`plattform_zugaenge`). Eigener OAuth-Client im eigenen Google-Projekt mit Zielgruppe *Extern* und nur `openid email profile` – das braucht keine Google-Prüfung. Drive, Sheets und Kalender gibt es für Mandanten deshalb nicht.
- **Daten:** jeder Mandant in einer eigenen Datenbank `hub_<id>` auf `velonify-db`, gleiche Migrationen wie `crm`. Die Plattform-Tabellen (`db/plattform`) liegen nur in `crm`.
- **crm-api** erkennt Mandanten am OAuth-Client (`MANDANTEN_CLIENT_ID`) und schickt sie in ihre Datenbank. Gesperrt für sie: Datenansicht (`/tabelle`), `/admin`, `/plattform`. Nach dem Test 7 Tage nur lesen, dann gesperrt.
- **Lead-Markt:** Shopify-Shops aus HTTP Archive (`markt_pool` in BigQuery), live geprüft vom Shop-Audit (`/leads/marktfuellen`), gespeichert in `plattform_lead_markt`. Mandanten sehen 25 Vorschauen pro Seite ohne Name, Domain und Kontakt; „Freischalten“ zählt gegen das Kontingent und legt Firma, Kontakt und Deal in ihrer Datenbank an. Jede Domain geht an genau einen Mandanten, Domains aus unserem CRM nie.
- **KI:** Contact Generator und Shop-Audit erreichen Mandanten nur über crm-api (`/ki/contact`, `/ki/audit`), die das Werkzeug prüft, das KI-Kontingent zählt und mit `PLATTFORM_TOKEN` weiterreicht.
- **Admin-Werkzeug „Plattform“** im Velonify-Hub (nur `ADMINS` / `VITE_ADMINS`): Mandanten, Zugänge, Laufzeit, Funktionsschalter, Kontingente, Nutzung, Feedback, Köder-Leads, Lead-Markt auffüllen.
- **Meldungen an Slack** (`PLATTFORM_MELDEN_AN`, Standard Lugge): Testbedingungen bestätigt, Feedback, Buchungsanfrage, Köder-Lead freigeschaltet.

## Einrichtung (einmalig)

### 1. Google-Projekt und OAuth-Client für Mandanten

1. Neues Projekt `velonify-hub-app` (Organisation velonify.de).
2. **Google Auth Platform → Branding:** App-Name „Velonify Hub“, Support-Mail, Logo optional, Datenschutzerklärung `https://velonify.de/datenschutz/`. **Zielgruppe: Extern**, Status **In Produktion**. Scopes nur `openid`, `…/auth/userinfo.email`, `…/auth/userinfo.profile` – dafür ist keine Prüfung nötig.
3. **Clients → Client erstellen:** Webanwendung „Velonify Hub (Mandanten)“, JavaScript-Quellen `https://app.velonify.de` und `http://localhost:5212`.
4. Client-ID notieren → `MANDANTEN_CLIENT_ID`.

### 2. Datenbank

In Cloud SQL Studio als lukas@velonify.de, Datenbank `postgres`: mehr Verbindungen für crm-api (je Mandant bis zu 2 zusätzlich):

```sql
ALTER ROLE "crm-api@velonify-crm.iam" CONNECTION LIMIT 9;
```

Plattform-Tabellen in `crm_test` und `crm`:

```bash
npm run db:migrieren -- crm_test
npm run db:migrieren -- crm
```

Pro Mandant: Datenbank anlegen und migrieren – die genauen Befehle stehen im Admin-Werkzeug auf der Seite des Mandanten (unten, „Einrichtung der Datenbank“).

### 3. Secrets und Deploy

```bash
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create plattform-token --data-file=- --project=velonify-crm
# Leseberechtigung für die Dienstkonten der drei Functions (wie sie gerade deployt sind)
for f in crm-api shop-audit contact-generator; do
  sa=$(gcloud functions describe $f --region=europe-west3 --project=velonify-crm --format="value(serviceConfig.serviceAccountEmail)")
  gcloud secrets add-iam-policy-binding plattform-token --project=velonify-crm \
    --member=serviceAccount:$sa --role=roles/secretmanager.secretAccessor
done
```

Danach crm-api, shop-audit und contact-generator wie in ihren READMEs bauen und deployen, zusätzlich:

- **crm-api:** `--set-env-vars` + `MANDANTEN_CLIENT_ID=<aus 1.>,CONTACT_GENERATOR_URL=<URL>,SHOP_AUDIT_URL=<URL>,ALLOWED_ORIGINS=https://crm.velonify.de,https://app.velonify.de,https://velonify.github.io` und `--set-secrets` + `PLATTFORM_TOKEN=plattform-token:latest`
- **shop-audit** und **contact-generator:** `--set-secrets` + `PLATTFORM_TOKEN=plattform-token:latest`, `ALLOWED_ORIGINS` braucht app.velonify.de nicht (Mandanten kommen über crm-api).

Lead-Markt-Pool einmal aufbauen: Hub → Plattform → Lead-Markt → „Pool neu aufbauen“, dann „Auffüllen“. Ohne Hub geht beides auch lokal:

```bash
cd functions/shop-audit
npx tsx scripts/markt-lokal.ts pool
ANTHROPIC_API_KEY=$(gcloud secrets versions access latest --secret=anthropic-api-key --project=velonify-crm) npx tsx scripts/markt-lokal.ts fuellen 40 helpdesk
```

### 4. app.velonify.de

Eigenes Repo `Velonify/velonify-hub-app` (öffentlich, nur der Build) mit diesem Workflow `.github/workflows/app.yml`, Repo-Variablen `MANDANTEN_CLIENT_ID` und `CRM_API_URL`, Pages-Domain `app.velonify.de`, CNAME `app` → `velonify.github.io` bei Strato:

```yaml
name: Mandanten-Hub veröffentlichen
on:
  workflow_dispatch:
  repository_dispatch:
    types: [hub-main]
permissions:
  contents: read
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          repository: Velonify/velonify-crm
          ref: main
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          VITE_MANDANTEN: '1'
          VITE_GOOGLE_CLIENT_ID: ${{ vars.MANDANTEN_CLIENT_ID }}
          VITE_CRM_API_URL: ${{ vars.CRM_API_URL }}
      - run: touch dist/.nojekyll
      - uses: actions/upload-pages-artifact@v4
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

## Einen Tester aufnehmen

1. Hub → Plattform → **Mandant anlegen** (Kennung, Paket Test, Google-Adresse des Inhabers). Der Test läuft ab heute 30 Tage.
2. Datenbank anlegen und migrieren: `npx tsx scripts/mandant-db.ts <kennung>`, dann `npm run db:migrieren -- hub_<kennung>` (oder die SQL-Befehle auf der Seite des Mandanten).
3. Lead-Markt: mindestens dreimal so viele freie Shops wie das Kontingent; optional 1–2 Köder-Leads mit einer eigenen Domain.
4. Link schicken: **https://app.velonify.de** – Anmeldung mit genau dem eingetragenen Google-Konto.

## Lokal ansehen

Ohne Google und Cloud SQL, mit erfundenen Daten (Vault `.claude/launch.json`: `velonify-hub-mandant-api`, `velonify-hub-mandant`, `velonify-hub-admin`):

```bash
npx tsx scripts/mandant-vorschau.ts
VITE_MANDANTEN=1 VITE_CRM_API_URL=http://localhost:8091 VITE_GOOGLE_CLIENT_ID=vorschau npm run dev -- --port 5212
```

Im Browser vor dem Laden die Sitzung setzen (der Token ist in der Vorschau die Adresse):
`sessionStorage.setItem('velonify-crm.session', JSON.stringify({ token: { accessToken: 'leon@vennie.tech', expiresAt: Date.now() + 3600e3 }, user: { email: 'leon@vennie.tech', name: 'Leon' } }))`

## Noch nicht für Mandanten

Kunden-Werkzeug mit Kundenportal (braucht Drive und ein Portal pro Mandant), Kalender und Meet-Termine, Kalkulations-Sheets, LinkedIn-Import (Apify auf Velonifys Konto), MCP für Claude. Bezahlen per Stripe folgt, sobald die Velonify GmbH steht; bis dahin Rechnung und „aktivieren“ im Admin-Werkzeug.
