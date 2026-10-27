-- Whiteboard (Miro-Ersatz): Boards, Kommentar-Pins und der Inhalt der Leinwand. Konzept: Vault `Hub-Intern/Whiteboard - Konzept.md`.
-- Kopf und Kommentare laufen wie jede Tabelle über /einfuegen und /aendern (mit Protokoll). Der Inhalt hat eigene Routen
-- und kein Protokoll: Er ändert sich bei jedem Strich und ist dafür zu groß. Bilder liegen im Bucket, hier nur ihre Pfade.
CREATE TABLE whiteboards (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  titel text,
  firma_id text,
  vorlage text,
  sichtbar_kunde boolean NOT NULL DEFAULT false,
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX whiteboards_firma_id_idx ON whiteboards (firma_id);
CREATE TRIGGER whiteboards_protokoll AFTER INSERT OR UPDATE ON whiteboards
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

CREATE TABLE whiteboard_kommentare (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  board_id text,
  antwort_auf text,
  element_id text,
  x double precision,
  y double precision,
  text text,
  von text,
  erledigt boolean NOT NULL DEFAULT false,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX whiteboard_kommentare_board_id_idx ON whiteboard_kommentare (board_id);
CREATE TRIGGER whiteboard_kommentare_protokoll AFTER INSERT OR UPDATE ON whiteboard_kommentare
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

-- elemente: alle Excalidraw-Elemente, auch gelöschte (isDeleted), damit das Zusammenführen weiß, was weg ist.
-- dateien: fileId → { mimeType, pfad, groesse, erstellt }. vorschau: kleines Bild (data-URL) für die Übersicht.
CREATE TABLE whiteboard_inhalte (
  board_id text PRIMARY KEY REFERENCES whiteboards (id),
  elemente jsonb NOT NULL DEFAULT '[]',
  dateien jsonb NOT NULL DEFAULT '{}',
  vorschau text,
  stand bigint NOT NULL DEFAULT 0,
  gespeichert_am timestamptz NOT NULL DEFAULT now(),
  gespeichert_von text
);

-- Das Kundenportal zeigt freigegebene Boards nur an (Stufe 1), es schreibt nichts.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kundenportal@velonify-crm.iam') THEN
    GRANT SELECT ON whiteboards, whiteboard_inhalte TO "kundenportal@velonify-crm.iam";
  END IF;
END $$;
