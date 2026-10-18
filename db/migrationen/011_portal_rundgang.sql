-- Rundgang und „Neu im Portal“: Das Portal merkt sich pro Zugang, wann der Kontakt den Rundgang gesehen (oder
-- übersprungen) hat und welche Neuerungen schon gezeigt wurden – auf dem Server, damit es nicht auf jedem Gerät neu
-- startet. Der Hub kann den Rundgang zurücksetzen.
ALTER TABLE portal_zugaenge
  ADD COLUMN IF NOT EXISTS rundgang_am text,
  ADD COLUMN IF NOT EXISTS neuerungen_gesehen text;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kundenportal@velonify-crm.iam') THEN
    GRANT UPDATE (rundgang_am, neuerungen_gesehen) ON portal_zugaenge TO "kundenportal@velonify-crm.iam";
  END IF;
END $$;
