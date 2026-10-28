-- Modul Organisation des Profils „Creator“ (Bauplan Abschnitt 11, Punkte 2, 3, 6, 27, 29). Die Fristen selbst stehen in
-- der gemeinsamen Tabelle fristen (015); hier nur, was der Kalender und die Ablage zusätzlich brauchen.

-- Wiederkehrende Fristen (Buchhaltung, GK-Formalien, feste Abgaben). Jeder Termin der Serie steht als eigene Zeile in
-- fristen (quelle = 'serie', bezug_id = '<serie>:<ursprüngliches Datum>') und ist dort einzeln erledigbar.
CREATE TABLE fristen_serien (
  id text PRIMARY KEY,
  titel text NOT NULL,
  art text NOT NULL DEFAULT 'sonstiges',
  rhythmus text NOT NULL CHECK (rhythmus IN ('monatlich', 'quartalsweise', 'jaehrlich')),
  -- erster Termin; die Folgetermine fallen auf denselben Tag im Monat (am Monatsende auf den letzten Tag)
  start date NOT NULL,
  -- letzter möglicher Termin, leer = ohne Ende
  ende date,
  uhrzeit text,
  zustaendig text,
  notiz text,
  link text,
  -- bis wohin die Termine in fristen stehen; der Takt kalender-serien schiebt das jeden Tag weiter
  generiert_bis date,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  erstellt_von text,
  geaendert_am timestamptz,
  geaendert_von text
);

-- Termine einer Serie, die jemand einzeln geändert oder ausgelassen hat: Änderungen an der Serie lassen sie in Ruhe.
CREATE TABLE fristen_abweichungen (
  frist_id text PRIMARY KEY,
  serie_id text NOT NULL,
  geaendert_am timestamptz NOT NULL DEFAULT now(),
  geaendert_von text
);

-- Kalender-Abo (ICS) je Person: geheimer Link, den Google, Apple oder Outlook regelmäßig abrufen.
CREATE TABLE kalender_abos (
  email text PRIMARY KEY CHECK (email = lower(email)),
  token text NOT NULL UNIQUE,
  -- alle Fristen oder nur die, für die die Person zuständig ist
  umfang text NOT NULL DEFAULT 'alle' CHECK (umfang IN ('alle', 'meine')),
  -- Teamname der Person für „meine“, bei jedem Öffnen im Hub aufgefrischt
  person text NOT NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  abgerufen_am timestamptz
);

-- Feste Ablagestruktur in Google Drive: welcher Drive-Ordner zu welchem Platz der Vorlage gehört (Schlüssel wie
-- 'haupt', 'content/rohmaterial', 'buchhaltung/belege/2026', 'kooperationen/<name>'). Die Ordner selbst liegen in Drive.
CREATE TABLE ablage_ordner (
  schluessel text PRIMARY KEY,
  name text NOT NULL,
  drive_id text NOT NULL,
  -- angelegt (vom Hub erzeugt) oder verknuepft (bestehender Ordner, über den Google Picker gewählt)
  art text NOT NULL DEFAULT 'angelegt' CHECK (art IN ('angelegt', 'verknuepft')),
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  erstellt_von text
);

-- Team-Passwortmanager (bewusst nicht selbst gebaut): gewählte Empfehlung und abgehakte Schritte der Einrichtung.
CREATE TABLE passwortmanager (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- 1password oder bitwarden
  wahl text,
  -- Schritt-Id → { von, am }
  haken jsonb NOT NULL DEFAULT '{}',
  geaendert_am timestamptz,
  geaendert_von text
);
