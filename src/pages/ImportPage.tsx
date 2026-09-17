import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, FormError, Loading, PageHeader } from '../components/ui';
import { DEFAULT_DEAL_TITEL, EINSTELLUNG, TIERS } from '../data/constants';
import { useCrm } from '../data/CrmContext';
import type { ImportErgebnis } from '../data/crm';
import { IMPORT_SPALTEN, parseCsv, planeImport, type ImportAktion, type ImportOptionen } from '../data/importCsv';
import { useIch } from '../lib/useIch';

const AKTION_LABEL: Record<ImportAktion, string> = {
  neu: 'Neu',
  ergaenzen: 'Ergänzen',
  dublette: 'Mögliche Dublette',
  unveraendert: 'Vorhanden',
  uebersprungen: 'Übersprungen',
  fehler: 'Fehler',
};

const anzahl = (n: number, eins: string, mehrere: string) => `${n} ${n === 1 ? eins : mehrere}`;

export function ImportPage() {
  const { db, loading, error, refresh, mutate } = useCrm();
  const toast = useToast();
  const [ich] = useIch(db?.listen.team ?? []);
  const [dateiname, setDateiname] = useState('');
  const [rows, setRows] = useState<string[][] | null>(null);
  const [leseFehler, setLeseFehler] = useState('');
  const [optionen, setOptionen] = useState<ImportOptionen>({ tiers: ['A', 'B'], zustaendig: '', dealAnlegen: true, dealTitel: '', dublettenImportieren: false });
  const [filterAktion, setFilterAktion] = useState<ImportAktion | ''>('');
  const [busy, setBusy] = useState(false);
  const [importFehler, setImportFehler] = useState<unknown>();
  const [ergebnis, setErgebnis] = useState<ImportErgebnis | null>(null);
  // Changing the key resets the file input after an import.
  const [inputKey, setInputKey] = useState(0);

  const plan = useMemo(() => (rows && db ? planeImport(rows, db, { ...optionen, zustaendig: optionen.zustaendig }) : null), [rows, db, optionen]);
  const zaehler = useMemo(() => {
    const counts: Record<ImportAktion, number> = { neu: 0, ergaenzen: 0, dublette: 0, unveraendert: 0, uebersprungen: 0, fehler: 0 };
    for (const z of plan?.zeilen ?? []) counts[z.aktion]++;
    return counts;
  }, [plan]);

  if (!db) return <div className="page">{error ? <ErrorBox error={error} onRetry={refresh} /> : loading && <Loading />}</div>;

  const lies = async (file: File | undefined) => {
    setErgebnis(null);
    setImportFehler(undefined);
    setLeseFehler('');
    if (!file) return;
    if (file.size > 5_000_000) return setLeseFehler('Die Datei ist größer als 5 MB – bitte in kleinere Teile aufteilen.');
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) return setLeseFehler('Die Datei enthält keine Datenzeilen.');
      setRows(parsed);
      setDateiname(file.name);
      setOptionen((o) => ({ ...o, zustaendig: o.zustaendig || ich || '' }));
    } catch {
      setLeseFehler('Die Datei konnte nicht gelesen werden. Ist es eine CSV-Datei?');
    }
  };

  const importieren = async () => {
    if (!plan) return;
    setBusy(true);
    setImportFehler(undefined);
    try {
      const result = await mutate((s) => s.importiere(plan));
      setErgebnis(result);
      setRows(null);
      setDateiname('');
      setInputKey((k) => k + 1);
      toast.show(`Import fertig: ${result.neu} neu, ${result.ergaenzt} ergänzt`);
    } catch (err) {
      setImportFehler(err);
    } finally {
      setBusy(false);
    }
  };

  const toggleTier = (tier: string) =>
    setOptionen((o) => ({ ...o, tiers: o.tiers.includes(tier) ? o.tiers.filter((t) => t !== tier) : [...o.tiers, tier] }));

  const schreibend = zaehler.neu + zaehler.ergaenzen;
  const sichtbar = (plan?.zeilen ?? []).filter((z) => !filterAktion || z.aktion === filterAktion);

  return (
    <div className="page">
      <PageHeader eyebrow="Leads" title="Leads importieren" subtitle="CSV aus dem Magento-Lead-Qualifier oder eine eigene Liste mit mindestens der Spalte „domain“." />

      {ergebnis && (
        <div className="hint-box success">
          <strong>Import abgeschlossen:</strong> {anzahl(ergebnis.neu, 'neue Firma', 'neue Firmen')}, {ergebnis.ergaenzt} ergänzt,{' '}
          {anzahl(ergebnis.kontakte, 'Kontakt', 'Kontakte')}, {anzahl(ergebnis.deals, 'Deal', 'Deals')}.{' '}
          <Link to="/crm/firmen?status=lead">Zu den Leads</Link> · <Link to="/crm/pipeline">Zur Pipeline</Link>
        </div>
      )}

      <Card title="1. Datei wählen">
        <label className="file-drop">
          <input key={inputKey} type="file" accept=".csv,text/csv" onChange={(e) => void lies(e.target.files?.[0])} />
          <span className="file-drop-label">{dateiname && rows ? `${dateiname} – ${anzahl(rows.length - 1, 'Zeile', 'Zeilen')}` : 'CSV-Datei auswählen …'}</span>
        </label>
        {leseFehler && <p className="alert error">{leseFehler}</p>}
        <details className="muted small">
          <summary>Welche Spalten werden gelesen?</summary>
          <p>
            Genau das Format, das der Magento-Lead-Qualifier ausgibt:{' '}
            {IMPORT_SPALTEN.map((spalte, i) => (
              <span key={spalte}>
                {i > 0 && ', '}
                <code>{spalte}</code>
                {spalte === 'domain' && ' (Pflicht)'}
              </span>
            ))}
            . Zusätzlich gelesen: <code>ansprechpartner_rolle</code>, <code>letztes_deploy</code> (landet bei Technik) und <code>score_gruende</code> (als Notiz). Andere Spalten werden ignoriert,
            Trennzeichen Komma oder Semikolon.
          </p>
          <p>Vorhandene Firmen (gleiche Domain) werden nie überschrieben – nur leere Felder werden ergänzt.</p>
        </details>
      </Card>

      {plan && plan.fehlendeSpalten.length > 0 && <p className="alert error">In der Datei fehlt die Spalte „{plan.fehlendeSpalten.join('“, „')}“.</p>}

      {plan && plan.fehlendeSpalten.length === 0 && (
        <>
          <Card title="2. Einstellungen">
            <div className="import-options">
              <fieldset className="plain">
                <legend className="field-label">Welche Tiers importieren?</legend>
                <div className="chips">
                  {[...TIERS, 'sonstige'].map((tier) => (
                    <label key={tier} className="checkbox">
                      <input type="checkbox" checked={optionen.tiers.includes(tier)} onChange={() => toggleTier(tier)} />
                      {tier === 'sonstige' ? 'Unbekannte Tiers' : `Tier ${tier}`}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="field">
                <span className="field-label">Zuständig für neue Leads</span>
                <select value={optionen.zustaendig} onChange={(e) => setOptionen((o) => ({ ...o, zustaendig: e.target.value }))}>
                  <option value="">–</option>
                  {db.listen.team.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field">
                <label className="checkbox">
                  <input type="checkbox" checked={optionen.dealAnlegen} onChange={(e) => setOptionen((o) => ({ ...o, dealAnlegen: e.target.checked }))} />
                  Für jede neue Firma einen Deal in „Neu“ anlegen
                </label>
                {optionen.dealAnlegen && (
                  <input
                    value={optionen.dealTitel}
                    onChange={(e) => setOptionen((o) => ({ ...o, dealTitel: e.target.value }))}
                    placeholder={`Titel: ${db.einstellungen[EINSTELLUNG.dealTitel] || DEFAULT_DEAL_TITEL}`}
                    aria-label="Deal-Titel"
                  />
                )}
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(optionen.dublettenImportieren)}
                    onChange={(e) => setOptionen((o) => ({ ...o, dublettenImportieren: e.target.checked }))}
                  />
                  Mögliche Dubletten trotzdem importieren
                </label>
              </div>
            </div>
          </Card>

          <Card
            title="3. Vorschau"
            actions={
              <button type="button" className="button primary" onClick={importieren} disabled={busy || schreibend === 0}>
                {busy ? 'Importiert …' : schreibend === 0 ? 'Nichts zu importieren' : `${schreibend} Firmen importieren`}
              </button>
            }
          >
            <div className="chips import-summary">
              {(Object.keys(AKTION_LABEL) as ImportAktion[]).map((aktion) => (
                <button
                  key={aktion}
                  type="button"
                  className={`chip aktion-${aktion}${filterAktion === aktion ? ' is-active' : ''}`}
                  onClick={() => setFilterAktion((f) => (f === aktion ? '' : aktion))}
                  disabled={zaehler[aktion] === 0}
                >
                  {AKTION_LABEL[aktion]}: {zaehler[aktion]}
                </button>
              ))}
            </div>
            <FormError error={importFehler} />
            <div className="table-wrap flat">
              <table className="table compact">
                <thead>
                  <tr>
                    <th className="num">Zeile</th>
                    <th>Aktion</th>
                    <th>Firma</th>
                    <th className="hide-sm">Tier</th>
                    <th>Hinweis</th>
                  </tr>
                </thead>
                <tbody>
                  {sichtbar.slice(0, 500).map((z) => (
                    <tr key={z.zeile}>
                      <td className="num muted">{z.zeile}</td>
                      <td>
                        <span className={`badge aktion-${z.aktion}`}>{AKTION_LABEL[z.aktion]}</span>
                      </td>
                      <td>
                        {z.firmaId ? <Link to={`/crm/firmen/${z.firmaId}`}>{z.name}</Link> : z.name || <span className="muted">–</span>}
                        <div className="row-sub">{z.domain}</div>
                      </td>
                      <td className="hide-sm">{z.tier || '–'}</td>
                      <td className={z.dubletteVon ? 'warn-text' : 'muted'}>
                        {z.hinweis}
                        {z.dubletteVon?.firmaId && (
                          <>
                            {' '}
                            <Link to={`/crm/firmen/${z.dubletteVon.firmaId}`}>Ansehen</Link>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sichtbar.length > 500 && <p className="muted small">Vorschau zeigt die ersten 500 Zeilen – importiert werden alle.</p>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
