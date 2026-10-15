-- Kunden können im Portal mitmachen: Freigaben beantworten, kommentieren und Anfragen stellen.
-- Das Portal legt Karten, Kommentare und interne Kunden-News an und ändert an Karten nur die Freigabe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kundenportal@velonify-crm.iam') THEN
    GRANT INSERT ON aufgaben, aufgaben_kommentare, kunden_news TO "kundenportal@velonify-crm.iam";
    GRANT UPDATE (freigabe, freigabe_am, freigabe_von, geaendert_am, geaendert_von) ON aufgaben TO "kundenportal@velonify-crm.iam";
  END IF;
END $$;
