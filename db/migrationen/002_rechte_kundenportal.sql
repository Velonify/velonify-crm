-- Das Kundenportal liest nur, was es für die Kundensicht braucht, und vermerkt die letzte Anmeldung.
-- Bedingt, weil es die IAM-Rolle nur auf der Cloud-SQL-Instanz gibt (nicht in den Tests).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kundenportal@velonify-crm.iam') THEN
    GRANT SELECT ON firmen, kontakte, deals, aktivitaeten, wiedervorlagen, listen, einstellungen,
      kunden_links, kunden_news, kunden_meilensteine, boards, aufgaben, aufgaben_kommentare,
      portal_zugaenge, portal_werkzeuge TO "kundenportal@velonify-crm.iam";
    GRANT UPDATE (zuletzt_am) ON portal_zugaenge TO "kundenportal@velonify-crm.iam";
  END IF;
END $$;
