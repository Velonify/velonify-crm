-- Eigene Instanzen (eigenes Google-Cloud-Projekt, eigene Datenbank, eigenes crm-api, z. B. <kennung>.velonify.de),
-- gesteuert aus dem Werkzeug „Plattform“ → Instanzen. Nur in der Datenbank crm. Hier steht nur, wo die Instanz läuft;
-- das Steuer-Token je Instanz liegt im Secret (INSTANZ_STEUER_TOKENS), nie in der Datenbank.
CREATE TABLE plattform_instanzen (
  kennung text PRIMARY KEY CHECK (kennung ~ '^[a-z0-9-]{2,30}$'),
  name text NOT NULL,
  -- z. B. beispiel.velonify.de
  domain text,
  -- crm-api der Instanz, z. B. https://europe-west3-velonify-beispiel.cloudfunctions.net/crm-api
  api_url text NOT NULL CHECK (api_url ~ '^https://'),
  -- GitHub-Repo mit dem Workflow instanz.yml, z. B. Velonify/velonify-hub-beispiel
  repo text NOT NULL CHECK (repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  notiz text,
  aktiv boolean NOT NULL DEFAULT true,
  angelegt_am timestamptz NOT NULL DEFAULT now(),
  geaendert_am timestamptz NOT NULL DEFAULT now(),
  geaendert_von text
);

-- Was Velonify an einer Instanz getan hat: Updates (Tag, Commit, vorheriger Stand), Bausteine, Neuigkeiten.
CREATE TABLE plattform_instanz_protokoll (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kennung text NOT NULL REFERENCES plattform_instanzen (kennung),
  -- update, bausteine, neuigkeit
  art text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  von text NOT NULL,
  am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plattform_instanz_protokoll_idx ON plattform_instanz_protokoll (kennung, am DESC);
