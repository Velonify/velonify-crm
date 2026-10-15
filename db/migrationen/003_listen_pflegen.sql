-- Die Auswahllisten (Team, Verlustgründe) werden in der Datenansicht gepflegt: Ersetzen heißt löschen und neu
-- anlegen. Nur für diese Tabelle darf die API löschen, alles andere wird weiter nur archiviert.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm-api@velonify-crm.iam') THEN
    GRANT DELETE ON listen TO "crm-api@velonify-crm.iam";
  END IF;
END $$;
