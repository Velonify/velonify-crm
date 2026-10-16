-- @-Erwähnungen: Wer in Kommentaren, Karten oder Notizen mit „@Name“ markiert wird, bekommt einen Eintrag unter der
-- Glocke im Hub. crm-api und crm-mcp dürfen über die Standardrechte von crm_owner lesen, anlegen und als gelesen markieren.
CREATE TABLE erwaehnungen (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  person text,
  von text,
  datum text,
  art text,
  quelle_id text,
  aufgabe_id text,
  firma_id text,
  titel text,
  auszug text,
  link text,
  gelesen_am text
);
CREATE INDEX erwaehnungen_person_idx ON erwaehnungen (person);
CREATE INDEX erwaehnungen_quelle_id_idx ON erwaehnungen (quelle_id);
CREATE INDEX erwaehnungen_aufgabe_id_idx ON erwaehnungen (aufgabe_id);
CREATE INDEX erwaehnungen_firma_id_idx ON erwaehnungen (firma_id);
CREATE TRIGGER erwaehnungen_protokoll AFTER INSERT OR UPDATE ON erwaehnungen
  FOR EACH ROW EXECUTE FUNCTION protokolliere();
