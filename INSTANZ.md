# Eigene Hub-Instanzen

Eine Instanz ist ein komplett eigener Velonify Hub für einen Kunden, gebaut aus demselben Code wie unser Hub (Profil `creator`). Bauplan der ersten Instanz im Vault unter `Hub-Intern/`.

## Aufbau

- **Google-Projekt** `velonify-<kennung>` in unserer Organisation, Abrechnung über unser Konto.
- **Datenbank:** eigene Cloud-SQL-Instanz `hub` (Postgres 16, kleinste Stufe, Frankfurt) mit der Datenbank `hub`, IAM-Anmeldung wie bei `velonify-db`, keine Passwörter. Gleiche Migrationen wie `crm` (`db/migrationen`), keine Plattform-Tabellen.
- **crm-api** als eigene Function im Projekt der Instanz, mit eigenem Dienstkonto und den Variablen aus dem Vertrag unten. Keine Slack-, Gmail-, Spiegel-, Magnet-, Mandanten- oder Plattform-Variablen.
- **Anmeldung:** eigener OAuth-Client der Instanz (Zielgruppe *Extern*, *In Produktion*, nur `openid email profile`).
- **Frontend:** GitHub Pages unter `<kennung>.velonify.de` aus dem eigenen Repo `Velonify/velonify-hub-<kennung>`. Das Repo enthält nur den Workflow.
- **Updates per Knopf:** Der Workflow „Instanz aktualisieren“ (Vorlage `scripts/instanz/instanz.yml`) nimmt einen Ref aus `velonify-crm` (Tag, Branch oder Commit) und spielt ihn in dieser Reihenfolge aus: Migrationen → crm-api → Frontend. Er folgt nie automatisch `main`. Bei Google meldet er sich über Workload Identity Federation an, es gibt also keinen JSON-Schlüssel.

**Vertrag**

| Wo | Variablen |
|---|---|
| Frontend-Build | `VITE_PROFIL=creator`, `VITE_GOOGLE_CLIENT_ID` (Client der Instanz), `VITE_CRM_API_URL` (crm-api der Instanz) |
| crm-api | `INSTANZ_PROFIL=creator`, `DB_NAME=hub`, `DB_INSTANZ`, `DB_NUTZER`, `GOOGLE_CLIENT_ID`, `ADMINS` (Velonify-Support, hat immer Zugang), `ALLOWED_ORIGINS=https://<kennung>.velonify.de`, `HUB_VERSION=<commit-sha>` bei jedem Deploy, dazu `TZ=Europe/Berlin` |

**Dienstkonten im Projekt der Instanz**

| Konto | Wofür | Rechte |
|---|---|---|
| `crm-api` | Laufzeit der Function | `cloudsql.client`, `cloudsql.instanceUser`; in der DB lesen, anlegen, ändern (kein DELETE außer `listen`) |
| `hub-migration` | Migrationen aus GitHub Actions | `cloudsql.client`, `cloudsql.instanceUser`; in der DB Mitglied von `crm_owner` |
| `hub-deploy` | crm-api aus GitHub Actions deployen | `cloudfunctions.developer`, `run.admin` (nur für `--no-invoker-iam-check`), darf `crm-api` und `hub-build` verwenden |
| `hub-build` | Cloud Build für die Function | `cloudbuild.builds.builder` |

`hub-migration` und `hub-deploy` lassen sich nur aus dem Repo `Velonify/velonify-hub-<kennung>` auf `main` verwenden.

## Eine neue Instanz einrichten

Lukas führt alles selbst aus, im Terminal (zsh oder bash) mit `gcloud` (als lukas@velonify.de) und `gh`. Die Variablen einmal oben setzen, alle weiteren Blöcke nutzen sie. Die Kennung besteht aus Kleinbuchstaben und Ziffern, z. B. `beispiel`.

### 0. Variablen

```bash
KENNUNG=beispiel
PROJEKT=velonify-${KENNUNG}
REGION=europe-west3
REPO=Velonify/velonify-hub-${KENNUNG}
DOMAIN=${KENNUNG}.velonify.de
DB_INSTANZ=${PROJEKT}:${REGION}:hub
CRM_API_URL=https://${REGION}-${PROJEKT}.cloudfunctions.net/crm-api
# IAM-Zugang zur Datenbank für Notfälle und Cloud SQL Studio
TEAM=(lukas@velonify.de julian@velonify.de)
# Velonify-Support im Hub der Instanz, hat immer Zugang (Komma, keine Leerzeichen)
ADMINS=lukas@velonify.de,julian@velonify.de
```

In zsh immer `${…}` vor einem Doppelpunkt schreiben (zsh liest `$REGION:h` sonst als Modifikator). Die Blöcke unten halten sich daran.

### 1. Projekt, Abrechnung, APIs

```bash
# Gleicher Ort in der Organisation wie velonify-crm (Organisation oder Ordner)
PARENT_TYP=$(gcloud projects describe velonify-crm --format='value(parent.type)')
PARENT_ID=$(gcloud projects describe velonify-crm --format='value(parent.id)')
gcloud projects create ${PROJEKT} --name="Velonify Hub ${KENNUNG}" --${PARENT_TYP}=${PARENT_ID}

# Dasselbe Abrechnungskonto wie velonify-apps
ABRECHNUNG=$(gcloud billing projects describe velonify-apps --format='value(billingAccountName)' | sed 's|billingAccounts/||')
gcloud billing projects link ${PROJEKT} --billing-account=${ABRECHNUNG}

gcloud services enable sqladmin.googleapis.com cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com logging.googleapis.com \
  secretmanager.googleapis.com --project=${PROJEKT}
```

Secret Manager wird erst später gebraucht (Steuer-Token, Kanal-Tokens), kostet aber nichts.

Optional ein Budget-Alarm (Schätzung im Bauplan: 25–60 € im Monat; die Währung muss die des Abrechnungskontos sein):

```bash
gcloud services enable billingbudgets.googleapis.com --project=${PROJEKT}
gcloud billing budgets create --billing-account=${ABRECHNUNG} --display-name="${PROJEKT}" --budget-amount=60EUR \
  --filter-projects=projects/${PROJEKT} --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
```

### 2. Dienstkonten und Rechte

```bash
gcloud iam service-accounts create crm-api --display-name="crm-api (Laufzeit)" --project=${PROJEKT}
gcloud iam service-accounts create hub-migration --display-name="GitHub Actions: Migrationen" --project=${PROJEKT}
gcloud iam service-accounts create hub-deploy --display-name="GitHub Actions: crm-api deployen" --project=${PROJEKT}
gcloud iam service-accounts create hub-build --display-name="Cloud Build für crm-api" --project=${PROJEKT}
SA=${PROJEKT}.iam.gserviceaccount.com

# Anmeldung an Cloud SQL per IAM: crm-api, Migration und das Team
MITGLIEDER=(serviceAccount:crm-api@${SA} serviceAccount:hub-migration@${SA})
for u in "${TEAM[@]}"; do MITGLIEDER+=(user:${u}); done
for m in "${MITGLIEDER[@]}"; do
  for r in roles/cloudsql.client roles/cloudsql.instanceUser; do
    gcloud projects add-iam-policy-binding ${PROJEKT} --member=${m} --role=${r} --condition=None --quiet --format=none
  done
done

# Deploy: Functions deployen, Cloud Run ohne Aufruf-Prüfung (wie im README von crm-api), crm-api und hub-build verwenden
gcloud projects add-iam-policy-binding ${PROJEKT} --member=serviceAccount:hub-deploy@${SA} --role=roles/cloudfunctions.developer --condition=None --quiet --format=none
gcloud projects add-iam-policy-binding ${PROJEKT} --member=serviceAccount:hub-deploy@${SA} --role=roles/run.admin --condition=None --quiet --format=none
for sa in crm-api hub-build; do
  gcloud iam service-accounts add-iam-policy-binding ${sa}@${SA} --project=${PROJEKT} \
    --member=serviceAccount:hub-deploy@${SA} --role=roles/iam.serviceAccountUser --format=none
done

# Eigenes Build-Konto: Im neuen Projekt hat das Standardkonto von Compute keine Rechte mehr
gcloud projects add-iam-policy-binding ${PROJEKT} --member=serviceAccount:hub-build@${SA} --role=roles/cloudbuild.builds.builder --condition=None --quiet --format=none
```

Meldet ein Befehl direkt nach dem Anlegen „does not exist“, ein paar Sekunden warten und ihn wiederholen.

`run.admin` braucht `hub-deploy` nur für `gcloud run services update --no-invoker-iam-check` nach jedem Deploy (die Org-Policy verbietet `allUsers`). Das Projekt enthält nur diese Instanz.

### 3. Cloud SQL

Wie `velonify-db`: Postgres 16, Enterprise, `db-f1-micro`, 10 GB SSD mit Auto-Vergrößerung, IAM-Anmeldung, nur über Connector/Auth-Proxy, nur verschlüsselt, Backups täglich 01:00 UTC (7 Stück), Wartung sonntags 03:00, Löschschutz. Das Anlegen dauert etwa 10 Minuten.

```bash
gcloud sql instances create hub --project=${PROJEKT} --region=${REGION} \
  --database-version=POSTGRES_16 --edition=enterprise --tier=db-f1-micro --availability-type=zonal \
  --storage-type=SSD --storage-size=10 --storage-auto-increase \
  --database-flags=cloudsql.iam_authentication=on \
  --connector-enforcement=REQUIRED --ssl-mode=ENCRYPTED_ONLY \
  --backup-start-time=01:00 --retained-backups-count=7 \
  --maintenance-window-day=SUN --maintenance-window-hour=3 \
  --deletion-protection

gcloud sql databases create hub --instance=hub --project=${PROJEKT}

# IAM-Datenbankbenutzer (Dienstkonten ohne ".gserviceaccount.com")
for sa in crm-api hub-migration; do
  gcloud sql users create ${sa}@${PROJEKT}.iam --instance=hub --type=cloud_iam_service_account --project=${PROJEKT}
done
for u in "${TEAM[@]}"; do
  gcloud sql users create ${u} --instance=hub --type=cloud_iam_user --project=${PROJEKT}
done

# Passwort für den eingebauten Benutzer postgres, nur für Schritt 4a (lässt sich jederzeit neu setzen)
gcloud sql users set-password postgres --instance=hub --prompt-for-password --project=${PROJEKT}
```

Ohne `--edition=enterprise` legt Google Postgres 16 als Enterprise Plus an, und das kennt `db-f1-micro` nicht.

### 4. Rollen und Rechte in der Datenbank

Wie in Vault `Hub-Intern/velonify-db - Rechte.sql`, nur mit den Konten der Instanz und ohne crm-mcp und Kundenportal. Ausführen in **Cloud SQL Studio** (Konsole → SQL → `hub` im Projekt der Instanz). Die Befehle unten geben das SQL mit eingesetzten Namen aus; die Ausgabe in Studio einfügen.

**4a.** Als `postgres` (Passwort aus Schritt 3), Datenbank `postgres`: Lukas und Julian bekommen `cloudsqlsuperuser`, danach braucht es `postgres` nicht mehr.

```bash
cat <<SQL
GRANT cloudsqlsuperuser TO $(printf '"%s", ' "${TEAM[@]}" | sed 's/, $//');
SQL
```

**4b.** Als lukas@velonify.de (IAM), Datenbank `postgres`:

```bash
cat <<SQL
-- Eigentümerrolle für Migrationen, darf sich nicht selbst anmelden
CREATE ROLE crm_owner NOLOGIN;
GRANT crm_owner TO $(printf '"%s", ' "${TEAM[@]}" | sed 's/, $//'), "hub-migration@${PROJEKT}.iam";

-- Niemand darf sich standardmäßig verbinden
REVOKE ALL ON DATABASE hub FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE hub TO "crm-api@${PROJEKT}.iam";
GRANT CONNECT ON DATABASE hub TO "hub-migration@${PROJEKT}.iam", $(printf '"%s", ' "${TEAM[@]}" | sed 's/, $//');

-- crm-api hat einen Pool mit 3 Verbindungen; die kleinste Stufe hat etwa 25 für alle zusammen
ALTER ROLE "crm-api@${PROJEKT}.iam" CONNECTION LIMIT 5;
ALTER ROLE "hub-migration@${PROJEKT}.iam" CONNECTION LIMIT 2;
SQL
```

**4c.** Als lukas@velonify.de (IAM), Datenbank `hub`:

```bash
cat <<SQL
ALTER SCHEMA public OWNER TO crm_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO "crm-api@${PROJEKT}.iam";

-- Tabellen, die crm_owner künftig anlegt: lesen und schreiben, aber kein DELETE (archivieren statt löschen)
ALTER DEFAULT PRIVILEGES FOR ROLE crm_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO "crm-api@${PROJEKT}.iam";
ALTER DEFAULT PRIVILEGES FOR ROLE crm_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO "crm-api@${PROJEKT}.iam";
SQL
```

Nach dem ersten Lauf des Workflows kommt noch 4d dazu (Schritt 9).

### 5. Workload Identity Federation für GitHub Actions

Nur Läufe aus `Velonify/velonify-hub-<kennung>` auf `main` dürfen `hub-migration` und `hub-deploy` verwenden. `workflow_dispatch` läuft immer auf dem Standard-Branch, also `main`.

```bash
NR=$(gcloud projects describe ${PROJEKT} --format='value(projectNumber)')
GH_ORG_ID=$(gh api orgs/Velonify --jq .id)

gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions" --project=${PROJEKT}
gcloud iam workload-identity-pools providers create-oidc github --location=global --workload-identity-pool=github --project=${PROJEKT} \
  --display-name="${REPO#Velonify/}" --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '${REPO}' && assertion.repository_owner_id == '${GH_ORG_ID}' && assertion.ref == 'refs/heads/main'"

for sa in hub-migration hub-deploy; do
  gcloud iam service-accounts add-iam-policy-binding ${sa}@${SA} --project=${PROJEKT} --role=roles/iam.workloadIdentityUser \
    --member="principalSet://iam.googleapis.com/projects/${NR}/locations/global/workloadIdentityPools/github/attribute.repository/${REPO}" --format=none
done
WIF_PROVIDER=projects/${NR}/locations/global/workloadIdentityPools/github/providers/github
```

### 6. OAuth-Client (Konsole)

Im Projekt `velonify-<kennung>` unter **Google Auth Platform**:

1. **Branding:** App-Name „Velonify Hub“, Support-Mail (eine Velonify-Adresse), Startseite `https://<kennung>.velonify.de`, Datenschutzerklärung `https://velonify.de/datenschutz/` (bis die Instanz eine eigene Seite hat), autorisierte Domain `velonify.de`. Logo weglassen, sonst prüft Google das Branding.
2. **Zielgruppe:** *Extern*, dann **App veröffentlichen** → Status *In Produktion*. Testnutzer braucht es dann nicht.
3. **Datenzugriff:** nur `openid`, `…/auth/userinfo.email`, `…/auth/userinfo.profile`. Dafür ist keine Prüfung nötig. `drive.file` kommt mit der Ablage später dazu (nicht sensibel, auch ohne Prüfung).
4. **Clients → Client erstellen:** Webanwendung „Velonify Hub (<kennung>)“, autorisierte JavaScript-Quelle `https://<kennung>.velonify.de`. Weiterleitungs-URIs braucht der Hub nicht.
5. Client-ID kopieren:

```bash
GOOGLE_CLIENT_ID=<Client-ID aus der Konsole>
```

### 7. Repo, Pages und Repo-Variablen

Das Repo ist öffentlich, weil GitHub Pages im Free-Plan der Organisation nur aus öffentlichen Repos veröffentlicht (wie `velonify-hub-app`). Damit sind auch die Logs der Läufe öffentlich; der Workflow gibt deshalb keine Variablen aus.

```bash
gh repo create ${REPO} --public --description "Velonify Hub – eigene Instanz (nur Build und Deploy)"
ARBEIT=$(mktemp -d)
gh repo clone ${REPO} ${ARBEIT}
mkdir -p ${ARBEIT}/.github/workflows
cp ~/Developer/velonify-crm/scripts/instanz/instanz.yml ${ARBEIT}/.github/workflows/instanz.yml
git -C ${ARBEIT} add .github/workflows/instanz.yml
git -C ${ARBEIT} commit -m "Workflow: Instanz aktualisieren"
git -C ${ARBEIT} push -u origin HEAD:main

gh variable set GCP_PROJEKT --repo ${REPO} --body "${PROJEKT}"
gh variable set GCP_REGION --repo ${REPO} --body "${REGION}"
gh variable set WIF_PROVIDER --repo ${REPO} --body "${WIF_PROVIDER}"
gh variable set DB_INSTANZ --repo ${REPO} --body "${DB_INSTANZ}"
gh variable set GOOGLE_CLIENT_ID --repo ${REPO} --body "${GOOGLE_CLIENT_ID}"
gh variable set CRM_API_URL --repo ${REPO} --body "${CRM_API_URL}"
gh variable set HUB_DOMAIN --repo ${REPO} --body "${DOMAIN}"
gh variable set ADMINS --repo ${REPO} --body "${ADMINS}"
# Name auf der Login-Seite („<Name> HUB · by Velonify“); im Hub selbst kommt er aus der Einrichtung
gh variable set INSTANZ_NAME --repo ${REPO} --body "<Name>"

# Pages aus GitHub Actions, eigene Domain (vor dem DNS-Eintrag setzen, damit niemand die Subdomain übernehmen kann)
gh api -X POST repos/${REPO}/pages -f build_type=workflow
gh api -X PUT repos/${REPO}/pages -f cname=${DOMAIN}
```

### 8. DNS (Julian, bei Strato)

`<kennung>` als CNAME auf `velonify.github.io`. Sobald GitHub das Zertifikat ausgestellt hat (Settings → Pages zeigt es an, meist nach einigen Minuten):

```bash
gh api -X PUT repos/${REPO}/pages -F https_enforced=true
```

### 9. Erster Lauf

Ref ist ein Stand von `velonify-crm`, der den Instanz-Modus (Profil `creator`, Login per Whitelist) schon enthält. Vorher meldet sich die Instanz wie unser Hub nur mit @velonify.de an.

```bash
gh workflow run instanz.yml --repo ${REPO} -f ref=main
sleep 5; gh run watch --repo ${REPO} $(gh run list --repo ${REPO} --workflow=instanz.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

**4d.** Danach einmal in Cloud SQL Studio, als lukas@velonify.de, Datenbank `hub`. Migration `003_listen_pflegen.sql` gibt das Löschen in `listen` nur unserem Konto `crm-api@velonify-crm.iam`; in der Instanz fehlt es sonst (Auswahllisten in der Datenansicht ersetzen).

```bash
cat <<SQL
SET ROLE crm_owner;
GRANT DELETE ON listen TO "crm-api@${PROJEKT}.iam";
SQL
```

### 10. Login-Test

1. `https://<kennung>.velonify.de` öffnen (bis HTTPS steht, ggf. `https://velonify.github.io/velonify-hub-<kennung>/`; dort schlägt die Anmeldung fehl, weil die Quelle nicht im OAuth-Client steht).
2. Mit einer Adresse aus `ADMINS` anmelden: Der Hub lädt im Profil Creator, in den Entwicklertools keine CORS- oder 401/403-Fehler bei `crm-api`.
3. Mit einem Google-Konto, das weder in `ADMINS` noch auf der Whitelist steht: Anmeldung wird abgewiesen.
4. Stand prüfen:

```bash
gcloud functions describe crm-api --region=${REGION} --project=${PROJEKT} --format='value(serviceConfig.environmentVariables.HUB_VERSION)'
curl -s -o /dev/null -w '%{http_code}\n' ${CRM_API_URL}/daten/crm   # ohne Anmeldung: 401
```

In Cloud SQL Studio (Datenbank `hub`): `SELECT name, am FROM schema_migrationen ORDER BY name;` zeigt alle Dateien aus `db/migrationen`.

## Update ausrollen

Ein getesteter Stand aus `main` bekommt einen Tag, dann startet der Workflow mit diesem Tag. Später übernimmt das der Knopf im Plattform-Werkzeug.

```bash
cd ~/Developer/velonify-crm && git fetch -q
TAG=instanz-$(date +%F)
git tag ${TAG} origin/main && git push origin ${TAG}
gh workflow run instanz.yml --repo Velonify/velonify-hub-${KENNUNG} -f ref=${TAG}
```

Migrationen lassen sich nicht zurückdrehen. Ein älterer Ref ist nur dann ein Rückweg, wenn die neueren Migrationen rein ergänzend waren.

## Wie der Workflow migriert

Der Job „Migrationen“ checkt `velonify-crm` am Ref aus, führt die Tests aus und meldet sich mit `google-github-actions/auth` über Workload Identity als `hub-migration` an (Identitätsübernahme, die Action legt dafür eine ADC-Datei an). Dann läuft dasselbe Skript wie bei uns: `npm run db:migrieren -- hub` mit `DB_INSTANZ` und `DB_NUTZER=hub-migration@velonify-<kennung>.iam`. Der Cloud SQL Connector in `db/verbindung.ts` holt sich mit diesen Anmeldedaten ein kurzlebiges Zertifikat und ein IAM-Token und verbindet über die öffentliche IP (Port 3307, mTLS), ohne Proxy und ohne freigegebene Netze. Das Skript setzt `SET ROLE crm_owner`, so gehören neue Tabellen `crm_owner`, und die Standardrechte für `crm-api` greifen. Die anderen Jobs bauen genau den Commit, den dieser Job aufgelöst hat; `HUB_VERSION` ist dieser Commit.

## Von Hand (Notfall)

Migration mit dem eigenen IAM-Benutzer (Mitglied von `crm_owner`):

```bash
cd ~/Developer/velonify-crm
DB_INSTANZ=${DB_INSTANZ} npm run db:migrieren -- hub
```

crm-api wie im Workflow, mit dem eigenen Konto:

```bash
cd ~/Developer/velonify-crm/functions/crm-api
npm install && npm test && npm run build
cat > /tmp/crm-api-${KENNUNG}.yaml <<EOF
TZ: "Europe/Berlin"
INSTANZ_PROFIL: "creator"
DB_INSTANZ: "${DB_INSTANZ}"
DB_NUTZER: "crm-api@${PROJEKT}.iam"
DB_NAME: "hub"
GOOGLE_CLIENT_ID: "${GOOGLE_CLIENT_ID}"
ADMINS: "${ADMINS}"
ALLOWED_ORIGINS: "https://${DOMAIN}"
HUB_VERSION: "$(git rev-parse HEAD)"
EOF
gcloud functions deploy crm-api --gen2 --region=${REGION} --runtime=nodejs24 --source=. --entry-point=crmApi \
  --trigger-http --no-allow-unauthenticated --service-account=crm-api@${SA} \
  --build-service-account=projects/${PROJEKT}/serviceAccounts/hub-build@${SA} \
  --memory=512Mi --cpu=1 --concurrency=40 --max-instances=1 --min-instances=0 --timeout=300s --project=${PROJEKT} \
  --env-vars-file=/tmp/crm-api-${KENNUNG}.yaml
gcloud run services update crm-api --region=${REGION} --no-invoker-iam-check --project=${PROJEKT}
```

## Noch nicht geprüft

Diese Anleitung ist noch nie ausgeführt worden. Ungeprüft sind insbesondere:

- alle `gcloud`-Befehle und Flags, vor allem `--edition`, `--ssl-mode`, `--connector-enforcement`, `--build-service-account`, `--env-vars-file` und der Budget-Befehl;
- ob `cloudbuild.builds.builder` für das eigene Build-Konto reicht (sonst zusätzlich `roles/logging.logWriter` und `roles/artifactregistry.writer`);
- ob die Org-Policy (Domain Restricted Sharing) die `principalSet://…`-Bindung aus Schritt 5 zulässt;
- ob `postgres` in Cloud SQL Studio `cloudsqlsuperuser` an IAM-Benutzer vergeben darf (so war es bei `velonify-db` gedacht, der genaue Weg ist nicht notiert);
- ob der Cloud SQL Connector im Runner mit der ADC-Datei der Auth-Action sauber per IAM anmeldet;
- ob `--no-invoker-iam-check` einen erneuten Deploy übersteht (dann bräuchte `hub-deploy` kein `run.admin`).
