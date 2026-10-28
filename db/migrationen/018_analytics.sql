-- Modul Kanäle und Analytics (Profil „Creator“, Bauplan Abschnitt 5 und 11, Punkte 12–20).
-- Die Kerntabellen stehen in 015; hier nur Ergänzungen und die Tabellen, die nur dieses Modul braucht.
-- Im Velonify-Hub bleiben sie leer.

-- OAuth: kurzlebiger state je Verbindungsversuch, an die Person gebunden, die auf „Verbinden“ geklickt hat.
CREATE TABLE analytics_oauth (
  state text PRIMARY KEY,
  -- youtube, instagram, tiktok, twitch, facebook (Instagram Business Discovery fürs Benchmarking)
  plattform text NOT NULL,
  email text NOT NULL,
  person text NOT NULL,
  -- Konto, das neu verbunden wird (erneut anmelden), sonst leer
  konto_id text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  verbraucht_am timestamptz
);

ALTER TABLE kanal_konten
  ADD COLUMN name text,
  ADD COLUMN bild text,
  ADD COLUMN url text,
  -- Ablauf des Zugriffs-Tokens und des Refresh-Tokens (nur Zeitpunkte, die Tokens selbst liegen im Secret Manager)
  ADD COLUMN token_bis timestamptz,
  ADD COLUMN refresh_bis timestamptz,
  ADD COLUMN scopes text,
  ADD COLUMN letzter_versuch timestamptz,
  -- Zahlen des letzten Abrufs, z. B. {"videos": 12, "neu": 2, "kommentare": 40}
  ADD COLUMN abruf_stand jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN erstellt_am timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX kanal_konten_extern_idx ON kanal_konten (plattform, extern_id) WHERE extern_id IS NOT NULL AND NOT beispiel;

ALTER TABLE kanal_werte
  ADD COLUMN likes bigint,
  ADD COLUMN beitraege integer,
  ADD COLUMN wiedergabezeit_s bigint,
  ADD COLUMN follower_neu integer;

ALTER TABLE video_werte
  ADD COLUMN abos_neu integer,
  -- Anteil der Aufrufe, die bis zum Ende geschaut wurden (0–1), aus dem TikTok-Studio-Export
  ADD COLUMN komplett_rate numeric,
  ADD COLUMN follower_neu integer;

ALTER TABLE berichte
  ADD COLUMN einschaetzung_von text,
  ADD COLUMN einschaetzung_am timestamptz,
  ADD COLUMN erstellt_von text;

ALTER TABLE benchmark_kanaele
  ADD COLUMN bild text,
  ADD COLUMN url text,
  ADD COLUMN letzter_abruf timestamptz,
  ADD COLUMN fehler text,
  ADD COLUMN erstellt_am timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN erstellt_von text;
ALTER TABLE benchmark_werte
  ADD COLUMN notiz text,
  ADD COLUMN erfasst_von text;

-- Instagram Business Discovery gibt es nur über Facebook Login. Dieser Zugang dient allein dem Benchmarking
-- (öffentliche Zahlen anderer Business-/Creator-Konten über das eigene Konto), Token im Secret Manager.
CREATE TABLE analytics_zugaenge (
  id text PRIMARY KEY,
  -- instagram_discovery
  art text NOT NULL UNIQUE,
  extern_id text NOT NULL,
  handle text,
  token_secret text NOT NULL,
  token_bis timestamptz,
  verbunden_am timestamptz NOT NULL DEFAULT now(),
  verbunden_von text,
  fehler text
);

-- Twitch: Stream-Marker und Clips der Zuschauer je VOD (videos.typ = 'stream'), Rohstoff für die Clip-Vorschläge.
CREATE TABLE twitch_marker (
  id text PRIMARY KEY,
  video_id text NOT NULL,
  position_s integer NOT NULL,
  beschreibung text,
  am timestamptz
);
CREATE INDEX twitch_marker_video_idx ON twitch_marker (video_id);

CREATE TABLE twitch_clips (
  id text PRIMARY KEY,
  video_id text,
  vod_offset_s integer,
  dauer_s numeric,
  titel text,
  aufrufe integer,
  url text,
  ersteller text,
  am timestamptz
);
CREATE INDEX twitch_clips_video_idx ON twitch_clips (video_id);

-- Vorschläge für Clip-Stellen nach dem Stream; „Als Aufgabe an den Schnitt“ legt eine Karte an.
CREATE TABLE clip_vorschlaege (
  id text PRIMARY KEY,
  video_id text NOT NULL,
  start_s integer NOT NULL,
  ende_s integer NOT NULL,
  titel text NOT NULL,
  begruendung text,
  -- tiktok, instagram, youtube: wofür der Clip gedacht ist
  ziel text,
  -- Belege: Marker, Clips der Zuschauer
  signale jsonb NOT NULL DEFAULT '[]',
  -- vorschlag, aufgabe, verworfen
  status text NOT NULL DEFAULT 'vorschlag',
  aufgabe_id text,
  board_id text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  geaendert_am timestamptz,
  geaendert_von text
);
CREATE INDEX clip_vorschlaege_video_idx ON clip_vorschlaege (video_id);

-- TikTok-Studio-Importe: was wann eingespielt wurde.
CREATE TABLE studio_importe (
  id text PRIMARY KEY,
  datei text,
  stichtag date NOT NULL,
  zeilen integer NOT NULL,
  zugeordnet integer NOT NULL,
  zuordnung jsonb NOT NULL DEFAULT '{}',
  am timestamptz NOT NULL DEFAULT now(),
  von text
);
