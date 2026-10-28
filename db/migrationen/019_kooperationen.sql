-- Modul „Kooperationen und Einnahmen“ des Profils „Creator“ (Bauplan Abschnitt 11, Punkte 21–28).
-- Akquise, Verhandlung und Abschluss macht die Deal-Agentur; der Hub bildet den Stand nur ab. Rechnungen stellt die
-- Buchhaltung, hier steht nur, ob eine Rechnung gestellt und bezahlt ist. Im Velonify-Hub bleiben die Tabellen leer.

-- Kooperationen: interne Übersicht (Partner, Stand, Betrag, Zahlung) und Pipeline (Stand, Zuständigkeit, Wiedervorlage).
CREATE TABLE kooperationen (
  id text PRIMARY KEY,
  partner text NOT NULL,
  marke text,
  -- Name der Kampagne, sonst Marke oder Partner
  titel text,
  ansprechpartner text,
  email text,
  -- über die Deal-Agentur abgeschlossen (ja/nein)
  ueber_agentur boolean NOT NULL DEFAULT false,
  -- tiktok, instagram, youtube, twitch
  kanaele text[] NOT NULL DEFAULT '{}',
  leistung text,
  zeitraum_von date,
  zeitraum_bis date,
  betrag numeric(14, 2),
  -- EUR oder JPY
  waehrung text NOT NULL DEFAULT 'EUR' CHECK (waehrung IN ('EUR', 'JPY')),
  -- anfrage, verhandlung, vertrag, briefing, umsetzung, freigabe, reporting, rechnung, abgeschlossen, abgesagt
  stand text NOT NULL DEFAULT 'anfrage',
  -- offen, rechnung_gestellt, bezahlt
  zahlung text NOT NULL DEFAULT 'offen',
  rechnung_am date,
  -- Zahlungsziel der Rechnung (erscheint im Kalender)
  faellig_am date,
  bezahlt_am date,
  zustaendig text,
  wiedervorlage date,
  wiedervorlage_notiz text,
  briefing text,
  drive_ordner text,
  -- Inhalte dieser Kooperation müssen als Werbung gekennzeichnet werden
  werbung boolean NOT NULL DEFAULT true,
  notiz text,
  anfrage_id text,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  erstellt_von text,
  geaendert_am timestamptz,
  geaendert_von text
);
CREATE INDEX kooperationen_stand_idx ON kooperationen (stand) WHERE NOT archiviert;

-- Anfragen aus dem öffentlichen Formular, bis jemand sie in die Pipeline übernimmt oder ablehnt.
CREATE TABLE kooperation_anfragen (
  id text PRIMARY KEY,
  firma text NOT NULL,
  ansprechpartner text NOT NULL,
  email text NOT NULL,
  marke text,
  kanaele text[] NOT NULL DEFAULT '{}',
  zeitraum_von date,
  zeitraum_bis date,
  budget text,
  nachricht text NOT NULL,
  -- neu, uebernommen, abgelehnt
  status text NOT NULL DEFAULT 'neu',
  kooperation_id text,
  ablehnungsgrund text,
  -- SHA-256 der Absender-Adresse (nie die Adresse selbst), nur für die Begrenzung je Absender
  herkunft text,
  eingegangen_am timestamptz NOT NULL DEFAULT now(),
  bearbeitet_von text,
  bearbeitet_am timestamptz
);
CREATE INDEX kooperation_anfragen_status_idx ON kooperation_anfragen (status, eingegangen_am DESC);
CREATE INDEX kooperation_anfragen_herkunft_idx ON kooperation_anfragen (herkunft, eingegangen_am);

-- Live-Mediakit: eine Seite, Texte und welche Kennzahlen öffentlich sind. Die Zahlen kommen live aus den Kanal-Tabellen.
CREATE TABLE mediakit (
  id text PRIMARY KEY DEFAULT 'standard' CHECK (id = 'standard'),
  veroeffentlicht boolean NOT NULL DEFAULT false,
  name text,
  untertitel text,
  ueber text,
  zielgruppe text,
  themen text,
  -- [{ "name": "…", "text": "…" }], Logos als Text
  referenzen jsonb NOT NULL DEFAULT '[]',
  kontakt_email text,
  -- welche Kennzahlen: follower, aufrufe, interaktion, top
  kennzahlen text[] NOT NULL DEFAULT '{follower,aufrufe,interaktion,top}',
  -- gezeigte Plattformen; leer = alle
  kanaele text[] NOT NULL DEFAULT '{}',
  zeitraum_tage integer NOT NULL DEFAULT 90,
  geaendert_am timestamptz,
  geaendert_von text
);

-- Partner-Reporting: Bericht nach einer Kampagne aus den Zahlen der verknüpften Videos, mit geheimem Link.
CREATE TABLE kooperation_reportings (
  id text PRIMARY KEY,
  kooperation_id text NOT NULL,
  -- geheimer Schlüssel für #/oeffentlich/bericht/<schluessel>
  schluessel text NOT NULL UNIQUE,
  titel text NOT NULL,
  zeitraum_von date,
  zeitraum_bis date,
  video_ids text[] NOT NULL DEFAULT '{}',
  -- Schnappschuss: { summen: {…}, videos: [{…}], stand }
  kennzahlen jsonb NOT NULL DEFAULT '{}',
  text text NOT NULL DEFAULT '',
  -- true, solange Beispielzahlen drinstecken: dann wird nie geteilt
  beispiel boolean NOT NULL DEFAULT false,
  link_aktiv boolean NOT NULL DEFAULT false,
  geteilt_am timestamptz,
  geteilt_von text,
  geoeffnet_am timestamptz,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  erstellt_von text,
  geaendert_am timestamptz NOT NULL DEFAULT now(),
  geaendert_von text
);
CREATE INDEX kooperation_reportings_kooperation_idx ON kooperation_reportings (kooperation_id);

-- Einnahmen außer Kooperationen (die kommen automatisch aus „kooperationen“): AdSense, Twitch, Affiliate; per Hand oder CSV.
CREATE TABLE einnahmen (
  id text PRIMARY KEY,
  -- adsense, twitch, affiliate
  quelle text NOT NULL,
  -- erster Tag des Monats, zu dem die Einnahme gehört
  monat date NOT NULL,
  -- Tag des Geldeingangs (für den Tageskurs), sonst Monatsende
  datum date,
  beschreibung text,
  betrag numeric(14, 2) NOT NULL,
  waehrung text NOT NULL DEFAULT 'EUR' CHECK (waehrung IN ('EUR', 'JPY')),
  -- erwartet, bezahlt
  status text NOT NULL DEFAULT 'bezahlt',
  -- manuell oder csv
  herkunft text NOT NULL DEFAULT 'manuell',
  -- Fingerabdruck einer CSV-Zeile, damit ein zweiter Import nichts doppelt anlegt
  import_schluessel text UNIQUE,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  erstellt_von text,
  geaendert_am timestamptz,
  geaendert_von text
);
CREATE INDEX einnahmen_monat_idx ON einnahmen (monat) WHERE NOT archiviert;

-- Referenzkurse der EZB (1 EUR = x JPY), täglich über den Takt „kurse“.
CREATE TABLE wechselkurse (
  datum date PRIMARY KEY,
  eur_jpy numeric(12, 4) NOT NULL,
  quelle text NOT NULL DEFAULT 'ezb',
  abgerufen_am timestamptz NOT NULL DEFAULT now()
);

-- Einstellungen des Moduls: Name der Deal-Agentur, Rücklagenquote in Prozent, Hauptwährung der Anzeige.
CREATE TABLE kooperation_einstellungen (
  schluessel text PRIMARY KEY,
  wert text NOT NULL,
  geaendert_am timestamptz NOT NULL DEFAULT now(),
  geaendert_von text
);
