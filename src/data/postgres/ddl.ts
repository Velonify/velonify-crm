import { SCHEMA, type TabSchema } from '../schema';

/**
 * Postgres tables generated from SCHEMA: one table per tab with the same column names. Phase 1 of the move keeps the
 * sheet's semantics exactly – text stays text (dates, timestamps and JSON included), so every value round-trips
 * unchanged and the conflict check on `geaendert_am` keeps comparing the same strings. Only booleans and numbers get
 * real types. Stricter types and foreign keys come in later migrations, once the data is clean.
 *
 * `nr` keeps the row order of the sheet (rows were appended in creation order), it is never exposed to the app.
 */
export const TABELLEN: readonly TabSchema[] = Object.values(SCHEMA);

export function spaltenTyp(schema: TabSchema, spalte: string): string {
  if (schema.boolean?.includes(spalte)) return 'boolean NOT NULL DEFAULT false';
  if (schema.numeric?.includes(spalte)) return 'double precision';
  return 'text';
}

function tabelleSql(schema: TabSchema): string {
  const spalten = schema.columns.map((spalte) => {
    if (spalte === 'id') return '  id text PRIMARY KEY';
    if (schema.name === 'einstellungen' && spalte === 'schluessel') return '  schluessel text PRIMARY KEY';
    if (schema.name === 'listen') return `  ${spalte} text NOT NULL`;
    return `  ${spalte} ${spaltenTyp(schema, spalte)}`;
  });
  const zeilen = ['  nr bigint GENERATED ALWAYS AS IDENTITY UNIQUE', ...spalten];
  if (schema.name === 'listen') zeilen.push('  PRIMARY KEY (liste, wert)');
  const teile = [`CREATE TABLE ${schema.name} (\n${zeilen.join(',\n')}\n);`];
  for (const spalte of schema.columns) {
    if (spalte.endsWith('_id') && spalte !== 'id') teile.push(`CREATE INDEX ${schema.name}_${spalte}_idx ON ${schema.name} (${spalte});`);
  }
  teile.push(
    `CREATE TRIGGER ${schema.name}_protokoll AFTER INSERT OR UPDATE ON ${schema.name}\n` +
      `  FOR EACH ROW EXECUTE FUNCTION protokolliere();`,
  );
  return teile.join('\n');
}

const PROTOKOLL = `-- Änderungsprotokoll: ersetzt den Versionsverlauf des Sheets. Die API setzt app.person je Anfrage,
-- das Kopierskript setzt app.ohne_protokoll, damit die erste Übernahme nicht als Änderung zählt.
CREATE TABLE aenderungen (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tabelle text NOT NULL,
  datensatz_id text,
  aktion text NOT NULL,
  vorher jsonb,
  nachher jsonb,
  von text,
  am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX aenderungen_datensatz_idx ON aenderungen (tabelle, datensatz_id);

CREATE FUNCTION protokolliere() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  neu jsonb := to_jsonb(NEW);
  alt jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
BEGIN
  IF current_setting('app.ohne_protokoll', true) = '1' THEN RETURN NULL; END IF;
  IF alt IS NOT NULL AND alt = neu THEN RETURN NULL; END IF;
  INSERT INTO aenderungen (tabelle, datensatz_id, aktion, vorher, nachher, von)
  VALUES (TG_TABLE_NAME, COALESCE(neu->>'id', neu->>'schluessel', neu->>'liste'), lower(TG_OP), alt, neu,
          NULLIF(current_setting('app.person', true), ''));
  RETURN NULL;
END $$;`;

/** The complete first migration. `db/migrationen/001_schema.sql` must equal this (checked by a test). */
export function schemaSql(): string {
  return [
    '-- Erzeugt aus src/data/schema.ts mit `npm run db:schema`. Nicht von Hand ändern, neue Spalten in eine neue Migration.',
    PROTOKOLL,
    ...TABELLEN.map(tabelleSql),
  ].join('\n\n') + '\n';
}
