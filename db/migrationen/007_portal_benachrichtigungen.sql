-- Kunden wählen im Portal, wie oft sie eine Zusammenfassung bekommen (Updates) und über welchen Weg Updates und
-- sofortige Benachrichtigungen (neue Datei, Meilenstein, Freigabe, Antwort, Neuigkeit) kommen. Dazu merkt sich jeder
-- Zugang, bis wann schon benachrichtigt wurde. Das Portal schreibt diese Spalten selbst.
ALTER TABLE portal_zugaenge
  ADD COLUMN IF NOT EXISTS updates text,
  ADD COLUMN IF NOT EXISTS kanal_updates text,
  ADD COLUMN IF NOT EXISTS kanal_hinweise text,
  ADD COLUMN IF NOT EXISTS update_am text,
  ADD COLUMN IF NOT EXISTS hinweise_bis text;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kundenportal@velonify-crm.iam') THEN
    GRANT UPDATE (updates, kanal_updates, kanal_hinweise, update_am, hinweise_bis, geaendert_am, geaendert_von) ON portal_zugaenge TO "kundenportal@velonify-crm.iam";
  END IF;
END $$;
