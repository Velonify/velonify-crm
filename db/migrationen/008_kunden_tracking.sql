-- Tracking-Hub: Je Kunde, woher die Zahlen kommen (GA4-Property, Search-Console-Property, Seite für PageSpeed), und der
-- letzte Stand, den das Kundenportal täglich mit analytics@velonify.de abruft. Das Portal liest alles und schreibt nur
-- den Stand; eingerichtet wird im Hub (crm-api über die Standardrechte).
CREATE TABLE kunden_tracking (
  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  firma_id text,
  ga4_property text,
  gsc_site text,
  pagespeed_url text,
  sichtbar_kunde boolean NOT NULL DEFAULT false,
  stand_am text,
  fehler text,
  daten text,
  erstellt_am text,
  erstellt_von text,
  geaendert_am text,
  geaendert_von text
);
CREATE INDEX kunden_tracking_firma_id_idx ON kunden_tracking (firma_id);
CREATE TRIGGER kunden_tracking_protokoll AFTER INSERT OR UPDATE ON kunden_tracking
  FOR EACH ROW EXECUTE FUNCTION protokolliere();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kundenportal@velonify-crm.iam') THEN
    GRANT SELECT ON kunden_tracking TO "kundenportal@velonify-crm.iam";
    GRANT UPDATE (stand_am, fehler, daten) ON kunden_tracking TO "kundenportal@velonify-crm.iam";
  END IF;
END $$;
