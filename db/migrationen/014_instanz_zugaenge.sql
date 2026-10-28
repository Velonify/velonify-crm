-- Eigene Instanzen (ein eigener Hub unter <kennung>.velonify.de mit eigenem Projekt, eigener Datenbank und eigenem crm-api):
-- wer sich anmelden darf und mit welcher Rolle. Im Velonify-Hub bleibt die Tabelle leer, dort gilt die Anmeldung mit
-- @velonify.de. Entfernen heißt aktiv = false. Name, Schalter und der Velonify-Zugang stehen in einstellungen (instanz_*).
CREATE TABLE instanz_zugaenge (
  email text PRIMARY KEY CHECK (email = lower(email)),
  name text,
  -- admin: alles inkl. Einrichtung; team: alles außer Einrichtung; schnitt: wie team, aber ohne Beträge
  rolle text NOT NULL DEFAULT 'team' CHECK (rolle IN ('admin', 'team', 'schnitt')),
  aktiv boolean NOT NULL DEFAULT true,
  letzter_login timestamptz,
  angelegt_am timestamptz NOT NULL DEFAULT now(),
  angelegt_von text,
  geaendert_am timestamptz,
  geaendert_von text
);
