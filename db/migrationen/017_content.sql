-- Modul Content des Profils „Creator“ (Bauplan: Vault Hub-Intern/Matsu-Instanz - Bauplan.md, Punkte 7–11 und 30).
-- Der Content-Plan selbst steht in inhalte (015); hier liegen Recherche, Skripte, Thumbnail-Briefings und Upload-Hygiene.
-- Im Velonify-Hub bleiben die Tabellen leer.

-- Einstellungen des Moduls, z. B. der Impressum-Link für die Upload-Hygiene.
CREATE TABLE content_einstellungen (
  schluessel text PRIMARY KEY,
  wert text,
  geaendert_am timestamptz,
  geaendert_von text
);

-- Ton-Profil der Creatorin für Skripte, Titel, Hooks und Captions (eine Zeile mit id 'standard').
CREATE TABLE content_ton (
  id text PRIMARY KEY,
  beschreibung text,
  -- Beispiele echter Sätze, Hooks oder Captions, eins je Zeile
  beispiele text,
  -- was nie vorkommen darf
  no_gos text,
  geaendert_am timestamptz,
  geaendert_von text
);

-- Recherche-Assistent: ein Lauf je Woche (Takt) oder per Knopf.
CREATE TABLE content_recherche_laeufe (
  id text PRIMARY KEY,
  -- Montag der Woche
  woche date NOT NULL,
  -- takt oder die Person, die „Jetzt erstellen“ gedrückt hat
  ausgeloest_von text NOT NULL,
  -- Welche Quellen eingeflossen sind: {trends, kommentare, eigene, benchmark, hinweise[]}
  quellen jsonb NOT NULL DEFAULT '{}',
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_recherche_laeufe_woche_idx ON content_recherche_laeufe (woche DESC);

-- Themenvorschläge eines Laufs.
CREATE TABLE content_vorschlaege (
  id text PRIMARY KEY,
  lauf_id text NOT NULL REFERENCES content_recherche_laeufe (id),
  titel text NOT NULL,
  kanal text,
  format text,
  begruendung text,
  -- [{art: trend|kommentar|eigenes|benchmark, text}]
  quellen jsonb NOT NULL DEFAULT '[]',
  -- offen, uebernommen, verworfen
  status text NOT NULL DEFAULT 'offen',
  inhalt_id text,
  entschieden_von text,
  entschieden_am timestamptz,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_vorschlaege_lauf_idx ON content_vorschlaege (lauf_id);
CREATE INDEX content_vorschlaege_offen_idx ON content_vorschlaege (erstellt_am DESC) WHERE status = 'offen';

-- Skript, Titel und Hooks je Inhalt, in Versionen. Jede Fassung (Claude oder Team) ist eine neue Version;
-- die Freigabe hängt an der Version (freigaben.objekt_typ = 'skript', objekt_id = id).
CREATE TABLE content_skripte (
  id text PRIMARY KEY,
  inhalt_id text NOT NULL,
  version integer NOT NULL,
  skript text NOT NULL DEFAULT '',
  -- 3–5 Vorschläge je Liste
  titel jsonb NOT NULL DEFAULT '[]',
  hooks jsonb NOT NULL DEFAULT '[]',
  titel_wahl text,
  hook_wahl text,
  -- ki oder team
  quelle text NOT NULL DEFAULT 'ki',
  anweisung text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  erstellt_von text,
  UNIQUE (inhalt_id, version)
);

-- Thumbnail-Briefing je Inhalt: Bild, Text, Gesicht, dazu Farben, Komposition und Referenzen aus den eigenen Videos.
CREATE TABLE content_thumbnails (
  id text PRIMARY KEY,
  inhalt_id text NOT NULL UNIQUE,
  bild text,
  text text,
  gesicht text,
  farben text,
  komposition text,
  -- videos.id der eigenen besten Vorschaubilder als Referenz
  referenzen jsonb NOT NULL DEFAULT '[]',
  hinweise text,
  -- ki oder team
  quelle text NOT NULL DEFAULT 'ki',
  -- Karte auf einem To-Do-Board, wenn als Aufgabe gegeben
  aufgabe_id text,
  aufgabe_board_id text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  erstellt_von text,
  geaendert_am timestamptz,
  geaendert_von text
);

-- Upload-Hygiene je Inhalt und Plattform: Texte, Werbekennzeichnung und die Checkliste vor dem Upload.
CREATE TABLE content_uploads (
  id text PRIMARY KEY,
  inhalt_id text NOT NULL,
  -- tiktok, instagram, youtube, twitch
  plattform text NOT NULL,
  titel text,
  caption text,
  -- ohne #, durch Komma getrennt
  hashtags text,
  beschreibung text,
  -- deutsche Suchbegriffe, durch Komma getrennt
  suchbegriffe text,
  -- z. B. „Werbung | Marke“; Pflicht, solange eine Kooperation mit Werbung verknüpft ist
  kennzeichnung text,
  -- Punkte, die das Team selbst abhakt: {schalter: true, thumbnail: true, …}
  abgehakt jsonb NOT NULL DEFAULT '{}',
  quelle text NOT NULL DEFAULT 'team',
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  erstellt_von text,
  geaendert_am timestamptz,
  geaendert_von text,
  UNIQUE (inhalt_id, plattform)
);

-- Schneller Zusatz: bessere Captions für die letzten TikTok-Videos.
CREATE TABLE content_caption_vorschlaege (
  id text PRIMARY KEY,
  video_id text NOT NULL,
  bisher text,
  caption text NOT NULL,
  hashtags text,
  suchbegriffe text,
  begruendung text,
  -- offen, uebernommen (in TikTok geändert), verworfen
  status text NOT NULL DEFAULT 'offen',
  entschieden_von text,
  entschieden_am timestamptz,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_caption_vorschlaege_video_idx ON content_caption_vorschlaege (video_id);

-- Scheduled retries must not create a second batch for the same week.
CREATE UNIQUE INDEX content_recherche_takt_woche_idx ON content_recherche_laeufe (woche) WHERE ausgeloest_von = 'takt';
