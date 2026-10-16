-- Monatsbericht: Je Kunde ein Schalter am Tracking (kunden_tracking.monatsbericht) und je Monat ein Bericht. Das
-- Kundenportal legt am Monatsanfang den Entwurf an und rechnet ihn neu, solange er Entwurf ist; Kommentar und Freigabe
-- schreibt das Team im Hub (crm-api über die Standardrechte).
ALTER TABLE kunden_tracking
  ADD COLUMN IF NOT EXISTS monatsbericht boolean NOT NULL DEFAULT false;

CREATE TABLE kunden_berichte (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  firma_id text,
  monat text,
  status text,
  kommentar text,
  daten text,
  freigegeben_am text,
  freigegeben_von text,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE UNIQUE INDEX kunden_berichte_firma_monat_idx ON kunden_berichte (firma_id, monat);
CREATE TRIGGER kunden_berichte_protokoll AFTER INSERT OR UPDATE ON kunden_berichte
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kundenportal@velonify-crm.iam') THEN
    GRANT SELECT, INSERT ON kunden_berichte TO "kundenportal@velonify-crm.iam";
    GRANT UPDATE (daten, geaendert_am, geaendert_von) ON kunden_berichte TO "kundenportal@velonify-crm.iam";
  END IF;
END $$;
