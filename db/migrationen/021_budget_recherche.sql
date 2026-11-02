-- Anpassungen nach dem ersten Feedback der Creator-Instanz (Vault: Hub-Intern/Matsu-Instanz - Anpassungen Noel 11-2026.md).
-- Im Velonify-Hub bleiben die Tabellen leer.

-- Budget: Ausgaben (Steuern, Spesen, Tickets …) gegen die Einnahmen, je Monat gerechnet.
CREATE TABLE ausgaben (
  id text PRIMARY KEY,
  -- frei, Vorschläge im Hub (Steuern, Spesen, Tickets, Equipment, Software, Reisen)
  kategorie text NOT NULL,
  -- erster Tag des Monats, zu dem die Ausgabe gehört
  monat date NOT NULL,
  -- Tag der Zahlung (für den Tageskurs), sonst Monatsende
  datum date,
  beschreibung text,
  betrag numeric(14, 2) NOT NULL CHECK (betrag >= 0),
  waehrung text NOT NULL DEFAULT 'EUR' CHECK (waehrung IN ('EUR', 'JPY')),
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  erstellt_von text,
  geaendert_am timestamptz,
  geaendert_von text
);
CREATE INDEX ausgaben_monat_idx ON ausgaben (monat) WHERE NOT archiviert;

-- Content → Recherche: mehrere Dokumente mit Textformatierung. Inhalt als Block-Liste (JSON), nie als HTML.
CREATE TABLE recherche_dokumente (
  id text PRIMARY KEY,
  titel text NOT NULL,
  bloecke jsonb NOT NULL DEFAULT '[]',
  archiviert boolean NOT NULL DEFAULT false,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  erstellt_von text,
  geaendert_am timestamptz,
  geaendert_von text
);

-- Content → Notiz: angehängte Dokumente aus Google Drive (Name, Adresse, Drive-Id), nie die Dateien selbst.
ALTER TABLE inhalte ADD COLUMN dokumente jsonb NOT NULL DEFAULT '[]';
