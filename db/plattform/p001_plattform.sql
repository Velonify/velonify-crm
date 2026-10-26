-- Plattform: Mandanten des Hubs (Tester und zahlende Kunden), nur in der Datenbank crm.
-- Jeder Mandant arbeitet in seiner eigenen Datenbank hub_<id>; hier steht nur, wer er ist, wer hinein darf,
-- was eingeschaltet ist und was er verbraucht hat. Die Datenansicht des Hubs zeigt diese Tabellen nicht (nicht in SCHEMA).

CREATE TABLE plattform_mandanten (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9_]{2,30}$'),
  name text NOT NULL,
  -- test, aktiv, nur_lesen, gesperrt; ein abgelaufener Test wird beim Zugriff wie nur_lesen behandelt
  status text NOT NULL DEFAULT 'test',
  -- test, basis, pro, agentur
  paket text NOT NULL DEFAULT 'test',
  test_start date,
  test_ende date,
  -- Werkzeug-Id → an/aus; fehlt ein Werkzeug, gilt der Standard des Pakets
  funktionen jsonb NOT NULL DEFAULT '{}',
  lead_kontingent integer NOT NULL DEFAULT 40,
  -- gesamt (Test) oder monat (Abo)
  lead_zeitraum text NOT NULL DEFAULT 'gesamt',
  ki_kontingent integer NOT NULL DEFAULT 150,
  notiz text,
  bedingungen_am timestamptz,
  bedingungen_von text,
  buchung_paket text,
  buchung_am timestamptz,
  buchung_von text,
  angelegt_am timestamptz NOT NULL DEFAULT now(),
  geaendert_am timestamptz NOT NULL DEFAULT now(),
  geaendert_von text
);

-- Wer sich anmelden darf: eine Google-Adresse gehört zu genau einem Mandanten. Entfernen heißt aktiv = false.
CREATE TABLE plattform_zugaenge (
  email text PRIMARY KEY CHECK (email = lower(email)),
  mandant_id text NOT NULL REFERENCES plattform_mandanten (id),
  name text,
  -- inhaber oder mitarbeiter
  rolle text NOT NULL DEFAULT 'mitarbeiter',
  aktiv boolean NOT NULL DEFAULT true,
  letzter_login timestamptz,
  angelegt_am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plattform_zugaenge_mandant_idx ON plattform_zugaenge (mandant_id);

-- Lead-Markt: geprüfte Shopify-Shops aus dem Lead-Finder (Shop-Audit, Route marktfuellen). `vorschau` sieht jeder
-- Mandant (ohne Name, Domain, Kontakt), `daten` erst nach dem Freischalten. Köder-Leads sind erfundene Shops mit
-- Adressen, die bei Velonify ankommen; sie erscheinen nur beim Mandanten in `koeder_fuer`.
CREATE TABLE plattform_lead_markt (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  domain text NOT NULL UNIQUE,
  vorschau jsonb NOT NULL,
  daten jsonb NOT NULL,
  geprueft_am timestamptz,
  koeder_fuer text REFERENCES plattform_mandanten (id),
  aktiv boolean NOT NULL DEFAULT true,
  angelegt_am timestamptz NOT NULL DEFAULT now()
);

-- Leads aus dem Lead-Markt, die ein Mandant freigeschaltet hat. Eine Domain gehört höchstens einem Mandanten;
-- Köder-Leads (erfundene Shops) gibt es pro Mandant und zählen nicht zum Kontingent.
CREATE TABLE plattform_lead_freigaben (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mandant_id text NOT NULL REFERENCES plattform_mandanten (id),
  markt_id bigint REFERENCES plattform_lead_markt (id),
  domain text NOT NULL,
  firma_id text,
  koeder boolean NOT NULL DEFAULT false,
  von text,
  am timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX plattform_lead_freigaben_domain_idx ON plattform_lead_freigaben (domain) WHERE NOT koeder;
CREATE INDEX plattform_lead_freigaben_mandant_idx ON plattform_lead_freigaben (mandant_id, am);

-- Nutzung: Anmeldungen, geöffnete Werkzeuge, Freischaltungen, KI-Aufrufe, gesperrte Versuche. Grundlage für
-- Gesundheitswert, Kontingente und Warnungen im Admin-Werkzeug.
CREATE TABLE plattform_nutzung (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mandant_id text NOT NULL REFERENCES plattform_mandanten (id),
  email text,
  art text NOT NULL,
  detail text,
  am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plattform_nutzung_mandant_idx ON plattform_nutzung (mandant_id, art, am);

-- Antworten auf die Feedback-Fragen (Tag 3, 14, 25) und den Feedback-Knopf.
CREATE TABLE plattform_feedback (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mandant_id text NOT NULL REFERENCES plattform_mandanten (id),
  email text,
  -- frei, tag3, tag14, tag25
  anlass text NOT NULL,
  wert integer,
  text text,
  am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plattform_feedback_mandant_idx ON plattform_feedback (mandant_id, am);
