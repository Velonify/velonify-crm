-- Steuerung aus dem Velonify Hub und Home der eigenen Instanzen (Bauplan: Vault Hub-Intern/Matsu-Instanz - Bauplan.md,
-- Abschnitte 3 und 9). Im Velonify-Hub bleiben die Tabellen leer.

-- „Neu im Hub“: Velonify legt die Einträge über /steuerung/neuigkeit an, das Home der Instanz zeigt sie.
CREATE TABLE instanz_neuigkeiten (
  id text PRIMARY KEY,
  titel text NOT NULL,
  text text NOT NULL,
  -- Hub-Pfad (z. B. /analytics/berichte) oder https-Adresse
  link text,
  -- Werkzeug, zu dem die Neuigkeit gehört; dann sehen sie nur Personen mit diesem Werkzeug
  werkzeug text,
  am timestamptz NOT NULL DEFAULT now(),
  von text,
  archiviert boolean NOT NULL DEFAULT false
);
CREATE INDEX instanz_neuigkeiten_am_idx ON instanz_neuigkeiten (am DESC) WHERE NOT archiviert;

-- Rundgang und „Neu im Hub“ je Person, auf dem Server, damit es nicht auf jedem Gerät neu startet. Je Adresse, weil
-- Velonifys Support nicht in instanz_zugaenge steht. Keine Zeile oder rundgang_am leer: Der Rundgang startet.
CREATE TABLE instanz_rundgang (
  email text PRIMARY KEY CHECK (email = lower(email)),
  rundgang_am timestamptz,
  neuigkeiten_gesehen_am timestamptz
);
