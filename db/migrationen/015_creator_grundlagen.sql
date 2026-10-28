-- Gemeinsame Tabellen des Profils „Creator“ (eigene Instanzen, Bauplan: Vault Hub-Intern/Matsu-Instanz - Bauplan.md).
-- Mehrere Module lesen und schreiben sie; jedes Modul legt seine eigenen weiteren Tabellen in einer eigenen Migration an.
-- Im Velonify-Hub bleiben sie leer.

-- Jeder Aufruf von Claude in der Instanz, für die Nutzung im Velonify-Hub (Steuerung) und die Kosten.
CREATE TABLE instanz_ki_nutzung (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  am timestamptz NOT NULL DEFAULT now(),
  email text,
  zweck text NOT NULL,
  modell text NOT NULL,
  tokens_ein integer NOT NULL DEFAULT 0,
  tokens_aus integer NOT NULL DEFAULT 0
);

-- Wer in welchem Bereich entscheidet, antwortet und freigibt (Konzept: „Rollen und Freigaben“). Namen aus der Team-Liste.
CREATE TABLE zustaendigkeiten (
  bereich text PRIMARY KEY,
  entscheidet text,
  antwortet text,
  gibt_frei text,
  geaendert_am timestamptz,
  geaendert_von text
);

-- Freigaben per Klick: ein Objekt (Inhalt, Skript, Briefing, Kooperation, Bericht …) wartet auf die Entscheidung einer Person.
CREATE TABLE freigaben (
  id text PRIMARY KEY,
  objekt_typ text NOT NULL,
  objekt_id text NOT NULL,
  titel text NOT NULL,
  -- Hub-Pfad zum Objekt, z. B. /content/inhalte/I-ABC
  link text,
  bereich text,
  freigeber text NOT NULL,
  -- offen, freigegeben, abgelehnt, zurueckgezogen
  status text NOT NULL DEFAULT 'offen',
  notiz text,
  kommentar text,
  angefragt_von text NOT NULL,
  angefragt_am timestamptz NOT NULL DEFAULT now(),
  entschieden_von text,
  entschieden_am timestamptz
);
CREATE INDEX freigaben_objekt_idx ON freigaben (objekt_typ, objekt_id);
CREATE INDEX freigaben_offen_idx ON freigaben (freigeber) WHERE status = 'offen';

-- Kalender mit Fristen. Module schreiben ihre Termine selbst hinein (quelle + bezug_id, je Bezug eine Zeile),
-- der Kalender liest nur diese Tabelle.
CREATE TABLE fristen (
  id text PRIMARY KEY,
  titel text NOT NULL,
  datum date NOT NULL,
  uhrzeit text,
  -- upload, dreh, kampagne, abgabe, buchhaltung, gk, kooperation, sonstiges
  art text NOT NULL DEFAULT 'sonstiges',
  -- manuell oder das Modul, das sie pflegt (inhalt, kooperation, …)
  quelle text NOT NULL DEFAULT 'manuell',
  bezug_id text,
  link text,
  zustaendig text,
  notiz text,
  erledigt boolean NOT NULL DEFAULT false,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  erstellt_von text,
  geaendert_am timestamptz,
  geaendert_von text
);
CREATE UNIQUE INDEX fristen_bezug_idx ON fristen (quelle, bezug_id) WHERE bezug_id IS NOT NULL;
CREATE INDEX fristen_datum_idx ON fristen (datum);

-- Content-Plan: ein Eintrag je geplantem Video/Beitrag, über alle Kanäle.
CREATE TABLE inhalte (
  id text PRIMARY KEY,
  titel text NOT NULL,
  -- tiktok, instagram, youtube, twitch
  kanal text NOT NULL,
  format text,
  -- idee, skript, dreh, schnitt, upload, live
  status text NOT NULL DEFAULT 'idee',
  geplant_am date,
  zustaendig text,
  kooperation_id text,
  -- nach dem Upload: das echte Video (videos.id)
  video_id text,
  -- team, bericht (Ableitung), assistent (Recherche)
  quelle text NOT NULL DEFAULT 'team',
  quelle_id text,
  notiz text,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  erstellt_von text,
  geaendert_am timestamptz,
  geaendert_von text
);
CREATE INDEX inhalte_status_idx ON inhalte (status) WHERE NOT archiviert;

-- Kanäle der Instanz. Tokens liegen nie hier, nur der Name des Secrets im Secret Manager der Instanz.
CREATE TABLE kanal_konten (
  id text PRIMARY KEY,
  -- tiktok, instagram, youtube, twitch
  plattform text NOT NULL,
  handle text,
  extern_id text,
  -- beispiel, verbunden, fehler, getrennt
  status text NOT NULL DEFAULT 'beispiel',
  token_secret text,
  verbunden_am timestamptz,
  verbunden_von text,
  letzte_abholung timestamptz,
  fehler text,
  beispiel boolean NOT NULL DEFAULT false
);

-- Tageswerte je Kanal.
CREATE TABLE kanal_werte (
  konto_id text NOT NULL,
  datum date NOT NULL,
  follower integer,
  aufrufe bigint,
  reichweite bigint,
  interaktionen bigint,
  beispiel boolean NOT NULL DEFAULT false,
  PRIMARY KEY (konto_id, datum)
);

-- Videos, Reels, Beiträge und Streams aller Kanäle.
CREATE TABLE videos (
  id text PRIMARY KEY,
  konto_id text NOT NULL,
  plattform text NOT NULL,
  extern_id text NOT NULL,
  url text,
  titel text,
  beschreibung text,
  veroeffentlicht_am timestamptz,
  dauer_s integer,
  vorschaubild text,
  -- video, reel, short, beitrag, stream
  typ text,
  inhalt_id text,
  beispiel boolean NOT NULL DEFAULT false,
  abgerufen_am timestamptz,
  UNIQUE (plattform, extern_id)
);
CREATE INDEX videos_konto_idx ON videos (konto_id, veroeffentlicht_am DESC);

-- Tages-Schnappschuss je Video.
CREATE TABLE video_werte (
  video_id text NOT NULL,
  datum date NOT NULL,
  aufrufe bigint,
  likes bigint,
  kommentare bigint,
  shares bigint,
  saves bigint,
  reichweite bigint,
  wiedergabezeit_s bigint,
  durchschnitt_s numeric,
  -- api oder studio (TikTok-Studio-Export)
  quelle text NOT NULL DEFAULT 'api',
  beispiel boolean NOT NULL DEFAULT false,
  PRIMARY KEY (video_id, datum, quelle)
);

-- Merkmale je Video: Thema, Format, Hook. Claude schlägt vor, das Team bestätigt.
CREATE TABLE video_merkmale (
  video_id text PRIMARY KEY,
  thema text,
  format text,
  hook text,
  -- ki oder team
  quelle text NOT NULL DEFAULT 'ki',
  bestaetigt boolean NOT NULL DEFAULT false,
  begruendung text,
  geaendert_am timestamptz,
  geaendert_von text
);

-- Pflegbare Auswahl für Thema, Format und Hook.
CREATE TABLE merkmal_listen (
  art text NOT NULL,
  wert text NOT NULL,
  sortierung integer NOT NULL DEFAULT 0,
  PRIMARY KEY (art, wert)
);

-- Kommentare unter den eigenen Videos (über die Schnittstellen), Rohstoff für Recherche und Berichte.
CREATE TABLE kommentare (
  id text PRIMARY KEY,
  video_id text NOT NULL,
  plattform text NOT NULL,
  text text NOT NULL,
  likes integer,
  am timestamptz,
  beispiel boolean NOT NULL DEFAULT false
);
CREATE INDEX kommentare_video_idx ON kommentare (video_id);

-- Wochen- und Monatsberichte (auch Partner-Reportings nutzen eigene Tabellen im Modul Kooperationen).
CREATE TABLE berichte (
  id text PRIMARY KEY,
  -- woche oder monat
  typ text NOT NULL,
  von date NOT NULL,
  bis date NOT NULL,
  -- JSON: Kennzahlen, Tops/Flops, Merkmal-Vergleich, Text von Claude
  inhalt jsonb NOT NULL DEFAULT '{}',
  -- 3–5 Vorschläge für den Content-Plan: [{titel, kanal, format, begruendung, inhalt_id?}]
  ableitungen jsonb NOT NULL DEFAULT '[]',
  einschaetzung text,
  -- entwurf, freigegeben
  status text NOT NULL DEFAULT 'entwurf',
  beispiel boolean NOT NULL DEFAULT false,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  freigegeben_von text,
  freigegeben_am timestamptz,
  UNIQUE (typ, von)
);

-- Vergleichbare Creator für das Benchmarking (öffentliche Zahlen) und ihre Werte über die Zeit.
CREATE TABLE benchmark_kanaele (
  id text PRIMARY KEY,
  name text NOT NULL,
  plattform text NOT NULL,
  handle text NOT NULL,
  extern_id text,
  notiz text,
  aktiv boolean NOT NULL DEFAULT true,
  UNIQUE (plattform, handle)
);
CREATE TABLE benchmark_werte (
  kanal_id text NOT NULL,
  datum date NOT NULL,
  follower bigint,
  beitraege integer,
  aufrufe_schnitt bigint,
  interaktionen_schnitt numeric,
  -- api oder manuell
  quelle text NOT NULL DEFAULT 'api',
  PRIMARY KEY (kanal_id, datum)
);
