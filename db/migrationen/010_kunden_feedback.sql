-- Zufriedenheit & Feedback: Kunden bewerten im Portal (1–5 Sterne, optional Text) den Monatsbericht, abgeschlossene
-- Meilensteine und erledigte Karten oder schreiben jederzeit frei. Das Portal legt die Zeilen an und merkt sich, wann
-- Kritik in Slack gemeldet wurde; der Hub liest nur.
CREATE TABLE kunden_feedback (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  firma_id text,
  kontakt_id text,
  von text,
  anlass text,
  bezug_id text,
  bezug_titel text,
  sterne double precision,
  text text,
  zitat_ok boolean NOT NULL DEFAULT false,
  gemeldet_am text,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX kunden_feedback_firma_id_idx ON kunden_feedback (firma_id);
CREATE TRIGGER kunden_feedback_protokoll AFTER INSERT OR UPDATE ON kunden_feedback
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kundenportal@velonify-crm.iam') THEN
    GRANT SELECT, INSERT ON kunden_feedback TO "kundenportal@velonify-crm.iam";
    GRANT UPDATE (gemeldet_am) ON kunden_feedback TO "kundenportal@velonify-crm.iam";
  END IF;
END $$;
