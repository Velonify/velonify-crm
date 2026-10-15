-- Erzeugt aus src/data/schema.ts mit `npm run db:schema`. Nicht von Hand ändern, neue Spalten in eine neue Migration.

-- Änderungsprotokoll: ersetzt den Versionsverlauf des Sheets. Die API setzt app.person je Anfrage,
-- das Kopierskript setzt app.ohne_protokoll, damit die erste Übernahme nicht als Änderung zählt.
CREATE TABLE aenderungen (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tabelle text NOT NULL,
  datensatz_id text,
  aktion text NOT NULL,
  vorher jsonb,
  nachher jsonb,
  von text,
  am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX aenderungen_datensatz_idx ON aenderungen (tabelle, datensatz_id);

CREATE FUNCTION protokolliere() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  neu jsonb := to_jsonb(NEW);
  alt jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
BEGIN
  IF current_setting('app.ohne_protokoll', true) = '1' THEN RETURN NULL; END IF;
  IF alt IS NOT NULL AND alt = neu THEN RETURN NULL; END IF;
  INSERT INTO aenderungen (tabelle, datensatz_id, aktion, vorher, nachher, von)
  VALUES (TG_TABLE_NAME, COALESCE(neu->>'id', neu->>'schluessel', neu->>'liste'), lower(TG_OP), alt, neu,
          NULLIF(current_setting('app.person', true), ''));
  RETURN NULL;
END $$;

CREATE TABLE firmen (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  name text,
  domain text,
  kuerzel text,
  status text,
  tier text,
  score double precision,
  plattform text,
  version text,
  eol text,
  ort text,
  register text,
  ust_id text,
  email_allgemein text,
  telefon_allgemein text,
  tech_info text,
  quelle text,
  zustaendig text,
  drive_ordner_id text,
  slack_channel text,
  trello_url text,
  notiz text,
  archiviert boolean NOT NULL DEFAULT false,
  branche text,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX firmen_ust_id_idx ON firmen (ust_id);
CREATE INDEX firmen_drive_ordner_id_idx ON firmen (drive_ordner_id);
CREATE TRIGGER firmen_protokoll AFTER INSERT OR UPDATE ON firmen
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE kontakte (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  firma_id text,
  vorname text,
  nachname text,
  rolle text,
  email text,
  telefon text,
  linkedin text,
  hauptkontakt boolean NOT NULL DEFAULT false,
  notiz text,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX kontakte_firma_id_idx ON kontakte (firma_id);
CREATE TRIGGER kontakte_protokoll AFTER INSERT OR UPDATE ON kontakte
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE deals (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  firma_id text,
  kontakt_id text,
  titel text,
  phase text,
  wert_eur double precision,
  wahrscheinlichkeit double precision,
  zustaendig text,
  naechster_schritt text,
  naechster_schritt_am text,
  verlustgrund text,
  abgeschlossen_am text,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX deals_firma_id_idx ON deals (firma_id);
CREATE INDEX deals_kontakt_id_idx ON deals (kontakt_id);
CREATE TRIGGER deals_protokoll AFTER INSERT OR UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE aktivitaeten (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  firma_id text,
  kontakt_id text,
  deal_id text,
  typ text,
  datum text,
  text text,
  von text,
  kalender_termin_id text
);
CREATE INDEX aktivitaeten_firma_id_idx ON aktivitaeten (firma_id);
CREATE INDEX aktivitaeten_kontakt_id_idx ON aktivitaeten (kontakt_id);
CREATE INDEX aktivitaeten_deal_id_idx ON aktivitaeten (deal_id);
CREATE INDEX aktivitaeten_kalender_termin_id_idx ON aktivitaeten (kalender_termin_id);
CREATE TRIGGER aktivitaeten_protokoll AFTER INSERT OR UPDATE ON aktivitaeten
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE wiedervorlagen (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  firma_id text,
  deal_id text,
  titel text,
  faellig_am text,
  zustaendig text,
  erledigt_am text,
  erledigt_von text,
  erstellt_von text,
  erstellt_am text
);
CREATE INDEX wiedervorlagen_firma_id_idx ON wiedervorlagen (firma_id);
CREATE INDEX wiedervorlagen_deal_id_idx ON wiedervorlagen (deal_id);
CREATE TRIGGER wiedervorlagen_protokoll AFTER INSERT OR UPDATE ON wiedervorlagen
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE leistungskategorien (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  titel_de text,
  titel_en text,
  umfang_de text,
  umfang_en text,
  abrechnung text,
  sortierung double precision,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE TRIGGER leistungskategorien_protokoll AFTER INSERT OR UPDATE ON leistungskategorien
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE leistungen (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  kategorie_id text,
  titel_de text,
  titel_en text,
  text_de text,
  text_en text,
  sortierung double precision,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX leistungen_kategorie_id_idx ON leistungen (kategorie_id);
CREATE TRIGGER leistungen_protokoll AFTER INSERT OR UPDATE ON leistungen
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE angebote (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  nummer text,
  version double precision,
  sprache text,
  firma_id text,
  deal_id text,
  kontakt_id text,
  titel text,
  status text,
  auswahl text,
  sheet_id text,
  pdf_id text,
  summe_einmalig_eur double precision,
  summe_monatlich_eur double precision,
  summe_optional_eur double precision,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX angebote_firma_id_idx ON angebote (firma_id);
CREATE INDEX angebote_deal_id_idx ON angebote (deal_id);
CREATE INDEX angebote_kontakt_id_idx ON angebote (kontakt_id);
CREATE INDEX angebote_sheet_id_idx ON angebote (sheet_id);
CREATE INDEX angebote_pdf_id_idx ON angebote (pdf_id);
CREATE TRIGGER angebote_protokoll AFTER INSERT OR UPDATE ON angebote
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE outreach_leistungen (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  titel text,
  beschreibung text,
  anlass text,
  nutzen text,
  beleg text,
  sortierung double precision,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE TRIGGER outreach_leistungen_protokoll AFTER INSERT OR UPDATE ON outreach_leistungen
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE anschreiben (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  firma_id text,
  kontakt_id text,
  deal_id text,
  kanal text,
  leistung_id text,
  leistung text,
  sprache text,
  anrede text,
  aufhaenger text,
  betreff text,
  text text,
  status text,
  gesendet_am text,
  von text,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX anschreiben_firma_id_idx ON anschreiben (firma_id);
CREATE INDEX anschreiben_kontakt_id_idx ON anschreiben (kontakt_id);
CREATE INDEX anschreiben_deal_id_idx ON anschreiben (deal_id);
CREATE INDEX anschreiben_leistung_id_idx ON anschreiben (leistung_id);
CREATE TRIGGER anschreiben_protokoll AFTER INSERT OR UPDATE ON anschreiben
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE audits (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  firma_id text,
  domain text,
  geprueft_am text,
  von text,
  status text,
  plattform text,
  version text,
  eol text,
  score_mobil double precision,
  score_desktop double precision,
  lcp_mobil_ms double precision,
  cls double precision,
  inp_ms double precision,
  messquelle text,
  merkmale text,
  befunde text,
  nicht_geprueft text,
  zusammenfassung text,
  aufhaenger text,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX audits_firma_id_idx ON audits (firma_id);
CREATE TRIGGER audits_protokoll AFTER INSERT OR UPDATE ON audits
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE wordle (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  datum text,
  spieler text,
  versuche double precision,
  geloest boolean NOT NULL DEFAULT false,
  muster text,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE TRIGGER wordle_protokoll AFTER INSERT OR UPDATE ON wordle
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE monstera (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  datum text,
  typ text,
  von text,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE TRIGGER monstera_protokoll AFTER INSERT OR UPDATE ON monstera
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE eingang (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  eingegangen_am text,
  quelle text,
  sprache text,
  name text,
  email text,
  shop text,
  themen text,
  nachricht text,
  status text,
  firma_id text,
  kontakt_id text,
  erledigt_am text,
  erledigt_von text,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX eingang_firma_id_idx ON eingang (firma_id);
CREATE INDEX eingang_kontakt_id_idx ON eingang (kontakt_id);
CREATE TRIGGER eingang_protokoll AFTER INSERT OR UPDATE ON eingang
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE social_plan (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  datum text,
  uhrzeit text,
  kanal text,
  format text,
  saeule double precision,
  thema text,
  inhalt_id text,
  status text,
  hinweis text,
  zustaendig text,
  erledigt_am text,
  erledigt_von text,
  sortierung double precision,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX social_plan_inhalt_id_idx ON social_plan (inhalt_id);
CREATE TRIGGER social_plan_protokoll AFTER INSERT OR UPDATE ON social_plan
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE social_inhalte (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  kennung text,
  art text,
  serie text,
  saeule double precision,
  titel text,
  ziel text,
  hook text,
  slides text,
  caption text,
  cta text,
  hashtags text,
  alt_text text,
  ton text,
  material text,
  hinweis text,
  status text,
  sortierung double precision,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE TRIGGER social_inhalte_protokoll AFTER INSERT OR UPDATE ON social_inhalte
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE social_hooks (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  saeule double precision,
  text text,
  status text,
  inhalt_id text,
  sortierung double precision,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX social_hooks_inhalt_id_idx ON social_hooks (inhalt_id);
CREATE TRIGGER social_hooks_protokoll AFTER INSERT OR UPDATE ON social_hooks
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE social_aufgaben (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  bereich text,
  titel text,
  beschreibung text,
  dringlichkeit text,
  faellig_am text,
  zustaendig text,
  erledigt_am text,
  erledigt_von text,
  sortierung double precision,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE TRIGGER social_aufgaben_protokoll AFTER INSERT OR UPDATE ON social_aufgaben
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE social_texte (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  schluessel text,
  titel text,
  text text,
  sortierung double precision,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE TRIGGER social_texte_protokoll AFTER INSERT OR UPDATE ON social_texte
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE social_werte (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  art text,
  datum text,
  inhalt_id text,
  reichweite double precision,
  speicherungen double precision,
  geteilt double precision,
  profilaufrufe double precision,
  link_klicks double precision,
  kommentare double precision,
  story_antworten double precision,
  umfrage_antworten double precision,
  neue_follower double precision,
  follower_zielgruppe double precision,
  sitzungen double precision,
  formulare double precision,
  erstgespraeche double precision,
  angebote_wert_eur double precision,
  notiz text,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX social_werte_inhalt_id_idx ON social_werte (inhalt_id);
CREATE TRIGGER social_werte_protokoll AFTER INSERT OR UPDATE ON social_werte
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE social_dms (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  datum text,
  kanal text,
  stichwort text,
  inhalt_id text,
  name text,
  shop text,
  nachricht text,
  qualifiziert boolean NOT NULL DEFAULT false,
  eingang_id text,
  beantwortet_von text,
  notiz text,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX social_dms_inhalt_id_idx ON social_dms (inhalt_id);
CREATE INDEX social_dms_eingang_id_idx ON social_dms (eingang_id);
CREATE TRIGGER social_dms_protokoll AFTER INSERT OR UPDATE ON social_dms
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE magnete (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  slug text,
  titel text,
  beschreibung text,
  stichwort text,
  datei_url text,
  mail_betreff text,
  mail_text text,
  aktiv boolean NOT NULL DEFAULT false,
  sortierung double precision,
  archiviert boolean NOT NULL DEFAULT false,
  untertitel text,
  inhalt text,
  knopf text,
  typ text,
  plaetze double precision,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE TRIGGER magnete_protokoll AFTER INSERT OR UPDATE ON magnete
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE magnet_leads (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  magnet text,
  eingegangen_am text,
  vorname text,
  email text,
  shop text,
  shopsystem text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  token text,
  mail_gesendet_am text,
  download_am text,
  downloads double precision,
  newsletter_einwilligung boolean NOT NULL DEFAULT false,
  newsletter_text text,
  newsletter_bestaetigt_am text,
  newsletter_abgemeldet_am text,
  status text,
  firma_id text,
  kontakt_id text,
  erledigt_am text,
  erledigt_von text,
  warteliste boolean NOT NULL DEFAULT false,
  audit_id text,
  report text,
  report_von text,
  report_freigegeben_am text,
  report_gesendet_am text,
  report_geoeffnet_am text,
  report_aufrufe double precision,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX magnet_leads_firma_id_idx ON magnet_leads (firma_id);
CREATE INDEX magnet_leads_kontakt_id_idx ON magnet_leads (kontakt_id);
CREATE INDEX magnet_leads_audit_id_idx ON magnet_leads (audit_id);
CREATE TRIGGER magnet_leads_protokoll AFTER INSERT OR UPDATE ON magnet_leads
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE kunden_links (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  firma_id text,
  art text,
  titel text,
  url text,
  beschreibung text,
  angeheftet boolean NOT NULL DEFAULT false,
  sichtbar_kunde boolean NOT NULL DEFAULT false,
  sortierung double precision,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX kunden_links_firma_id_idx ON kunden_links (firma_id);
CREATE TRIGGER kunden_links_protokoll AFTER INSERT OR UPDATE ON kunden_links
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE kunden_news (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  firma_id text,
  art text,
  titel text,
  text text,
  datum text,
  angeheftet boolean NOT NULL DEFAULT false,
  sichtbar_kunde boolean NOT NULL DEFAULT false,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX kunden_news_firma_id_idx ON kunden_news (firma_id);
CREATE TRIGGER kunden_news_protokoll AFTER INSERT OR UPDATE ON kunden_news
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE boards (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  firma_id text,
  titel text,
  spalten text,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX boards_firma_id_idx ON boards (firma_id);
CREATE TRIGGER boards_protokoll AFTER INSERT OR UPDATE ON boards
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE aufgaben (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  board_id text,
  spalte_id text,
  titel text,
  beschreibung text,
  zustaendig text,
  faellig_am text,
  labels text,
  checkliste text,
  sortierung double precision,
  quelle text,
  quelle_link text,
  sichtbar_kunde boolean NOT NULL DEFAULT false,
  erledigt_am text,
  erledigt_von text,
  archiviert boolean NOT NULL DEFAULT false,
  freigabe text,
  freigabe_am text,
  freigabe_von text,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX aufgaben_board_id_idx ON aufgaben (board_id);
CREATE INDEX aufgaben_spalte_id_idx ON aufgaben (spalte_id);
CREATE TRIGGER aufgaben_protokoll AFTER INSERT OR UPDATE ON aufgaben
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE aufgaben_kommentare (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  aufgabe_id text,
  text text,
  von text,
  datum text
);
CREATE INDEX aufgaben_kommentare_aufgabe_id_idx ON aufgaben_kommentare (aufgabe_id);
CREATE TRIGGER aufgaben_kommentare_protokoll AFTER INSERT OR UPDATE ON aufgaben_kommentare
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE portal_zugaenge (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  firma_id text,
  kontakt_id text,
  aktiv boolean NOT NULL DEFAULT false,
  zuletzt_am text,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX portal_zugaenge_firma_id_idx ON portal_zugaenge (firma_id);
CREATE INDEX portal_zugaenge_kontakt_id_idx ON portal_zugaenge (kontakt_id);
CREATE TRIGGER portal_zugaenge_protokoll AFTER INSERT OR UPDATE ON portal_zugaenge
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE portal_werkzeuge (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  firma_id text,
  werkzeug text,
  aktiv boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX portal_werkzeuge_firma_id_idx ON portal_werkzeuge (firma_id);
CREATE TRIGGER portal_werkzeuge_protokoll AFTER INSERT OR UPDATE ON portal_werkzeuge
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE kunden_meilensteine (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  firma_id text,
  titel text,
  datum text,
  status text,
  sortierung double precision,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX kunden_meilensteine_firma_id_idx ON kunden_meilensteine (firma_id);
CREATE TRIGGER kunden_meilensteine_protokoll AFTER INSERT OR UPDATE ON kunden_meilensteine
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE listen (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  liste text NOT NULL,
  wert text NOT NULL,
  PRIMARY KEY (liste, wert)
);
CREATE TRIGGER listen_protokoll AFTER INSERT OR UPDATE ON listen
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE einstellungen (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  schluessel text PRIMARY KEY,
  wert text
);
CREATE TRIGGER einstellungen_protokoll AFTER INSERT OR UPDATE ON einstellungen
  FOR EACH ROW EXECUTE FUNCTION protokolliere();
