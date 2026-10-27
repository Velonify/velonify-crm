import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, FormError, Loading, PageHeader } from '../components/ui';
import { config } from '../config';
import { ApiStore } from '../data/api/apiStore';
import { DatenApi } from '../data/api/datenApi';
import { useCrm } from '../data/CrmContext';
import { aenderungenAus, alsCsv, filtere, hatArchiv, hatKonfliktpruefung, istEditierbar, istTabelle, rueckgaengig, sortiere, TABELLEN_GRUPPEN, type Datensatz } from '../data/datenansicht';
import type { Aenderung } from '../data/postgres/postgresStore';
import { SCHEMA, type EntityTab, type TabName, type TabSchema } from '../data/schema';
import { errorMessage } from '../lib/errors';
import { useLoad } from '../lib/useLoad';
import { GESPERRTE_TABS } from '../data/rollen';
import { useRolle } from '../lib/useRolle';

const ANZEIGE_MAX = 300;
const kurz = (wert: unknown) => {
  const text = wert === null || wert === undefined ? '' : typeof wert === 'boolean' ? (wert ? '✓' : '') : String(wert);
  return text.length > 80 ? `${text.slice(0, 80)} …` : text;
};

function useApis() {
  const { getToken } = useAuth();
  return useMemo(() => ({ daten: new DatenApi(config.crmApiUrl, getToken), store: new ApiStore(config.crmApiUrl, getToken) }), [getToken]);
}

/**
 * Einrichtung → Daten: every table of the database to look at, search, export and correct – what the team used to do
 * directly in the sheet. Edits use the same conflict check as the rest of the hub and land in the change log.
 */
export function DatenPage() {
  const { siehtGeld } = useRolle();
  const { tab } = useParams();
  const navigate = useNavigate();
  if (!config.crmApiUrl) {
    return (
      <div className="page narrow">
        <PageHeader eyebrow="System" title="Daten" subtitle="Die Datenansicht gibt es, sobald die Daten in Postgres liegen." />
      </div>
    );
  }
  return (
    <div className="page">
      <PageHeader eyebrow="System" title="Daten" subtitle="Alle Tabellen der CRM-Datenbank ansehen, durchsuchen, exportieren und korrigieren." />
      <div className="daten-wahl">
        <label className="field inline">
          <span className="field-label">Tabelle</span>
          <select value={istTabelle(tab) ? tab : ''} onChange={(e) => navigate(`/einrichtung/daten/${e.target.value}`)}>
            {!istTabelle(tab) && <option value="">Bitte wählen</option>}
            {TABELLEN_GRUPPEN.map((g) => (
              <optgroup key={g.titel} label={g.titel}>
                {g.tabs.filter((t) => siehtGeld || !GESPERRTE_TABS.includes(t)).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      {istTabelle(tab) ? <TabellenAnsicht key={tab} tab={tab} /> : <p className="muted">Oben eine Tabelle wählen.</p>}
    </div>
  );
}

function TabellenAnsicht({ tab }: { tab: TabName }) {
  const apis = useApis();
  const daten = useLoad(() => apis.daten.tabelle(tab), [apis, tab]);
  const [suche, setSuche] = useState('');
  const [archiv, setArchiv] = useState(false);
  const [sortierung, setSortierung] = useState<{ spalte: string | null; ab: boolean }>({ spalte: null, ab: false });
  const [offen, setOffen] = useState<Datensatz | null>(null);
  // Counts saves, so the dialog starts over from the stored record (form and history) after each one.
  const [stand, setStand] = useState(0);
  const navigate = useNavigate();
  const spalten = SCHEMA[tab].columns as readonly string[];

  const sichtbar = useMemo(
    () => sortiere(filtere(tab, daten.data ?? [], suche, archiv), sortierung.spalte, sortierung.ab),
    [tab, daten.data, suche, archiv, sortierung],
  );

  const exportieren = () => {
    const url = URL.createObjectURL(new Blob([alsCsv(spalten, sichtbar)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortiereNach = (spalte: string) => setSortierung((s) => ({ spalte, ab: s.spalte === spalte ? !s.ab : false }));

  if (tab === 'listen') return <ListenKarte zeilen={daten.data} laedt={daten.loading} fehler={daten.error} neuLaden={daten.reload} />;
  if (tab === 'einstellungen') return <EinstellungenKarte zeilen={daten.data} laedt={daten.loading} fehler={daten.error} neuLaden={daten.reload} />;

  return (
    <Card
      title={
        <>
          <code>{tab}</code> {daten.data && <span className="muted">· {sichtbar.length === daten.data.length ? daten.data.length : `${sichtbar.length} von ${daten.data.length}`}</span>}
        </>
      }
      actions={
        <button type="button" className="button small" onClick={exportieren} disabled={!daten.data}>
          CSV
        </button>
      }
    >
      <div className="daten-filter">
        <input type="search" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen in allen Spalten …" aria-label="Suchen" />
        {hatArchiv(tab) && (
          <label className="checkbox">
            <input type="checkbox" checked={archiv} onChange={(e) => setArchiv(e.target.checked)} /> Archivierte zeigen
          </label>
        )}
      </div>
      {daten.loading && !daten.data && <Loading label="Tabelle wird geladen …" />}
      {daten.error && <ErrorBox error={daten.error} onRetry={daten.reload} />}
      {daten.data && (
        <div className="table-wrap daten-wrap">
          <table className="table compact daten-tabelle">
            <thead>
              <tr>
                {spalten.map((s) => (
                  <th key={s} aria-sort={sortierung.spalte === s ? (sortierung.ab ? 'descending' : 'ascending') : undefined}>
                    <button type="button" className="daten-sort" onClick={() => sortiereNach(s)}>
                      {s}
                      {sortierung.spalte === s ? (sortierung.ab ? ' ↓' : ' ↑') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sichtbar.slice(0, ANZEIGE_MAX).map((z) => (
                <tr key={String(z.id)} onClick={() => setOffen(z)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOffen(z)}>
                  {spalten.map((s) => (
                    <td key={s} className={s === 'id' ? 'mono' : undefined}>
                      {kurz(z[s])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sichtbar.length > ANZEIGE_MAX && <p className="muted">Die ersten {ANZEIGE_MAX} Zeilen. Suche eingrenzen oder als CSV exportieren.</p>}
      {tab === 'firmen' && <p className="muted">Tipp: Die Firmenakte öffnet sich aus der Firmenliste im CRM.</p>}
      {offen && (
        <DatensatzDialog
          key={`${String(offen.id)}-${stand}`}
          tab={tab}
          datensatz={offen}
          onClose={() => setOffen(null)}
          onGespeichert={(neu) => {
            setOffen(neu);
            setStand((s) => s + 1);
            daten.reload();
          }}
          zurAkte={tab === 'firmen' ? () => navigate(`/crm/firmen/${offen.id}`) : undefined}
        />
      )}
    </Card>
  );
}

function DatensatzDialog({ tab, datensatz, onClose, onGespeichert, zurAkte }: { tab: TabName; datensatz: Datensatz; onClose(): void; onGespeichert(neu: Datensatz): void; zurAkte?: () => void }) {
  const apis = useApis();
  const { userEmail } = useAuth();
  const { refresh } = useCrm();
  const toast = useToast();
  const schema: TabSchema = SCHEMA[tab];
  const [formular, setFormular] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(schema.columns.map((s) => [s, typeof datensatz[s] === 'boolean' ? (datensatz[s] as boolean) : String(datensatz[s] ?? '')])),
  );
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<unknown>();
  const verlauf = useLoad(() => apis.daten.verlauf(tab, String(datensatz.id)), [apis, tab, datensatz]);

  const schreibe = async (aenderungen: Datensatz, meldung: string) => {
    if (Object.keys(aenderungen).length === 0) return onClose();
    setBusy(true);
    setFehler(undefined);
    try {
      const meta = hatKonfliktpruefung(tab) ? { geaendert_am: new Date().toISOString(), geaendert_von: userEmail() } : {};
      const [neu] = await apis.store.update(tab as EntityTab, [
        { id: String(datensatz.id), changes: { ...aenderungen, ...meta } as never, expectedGeaendertAm: hatKonfliktpruefung(tab) ? String(datensatz.geaendert_am ?? '') : undefined },
      ]);
      toast.show(meldung);
      void refresh();
      onGespeichert(neu as unknown as Datensatz);
    } catch (err) {
      setFehler(err);
    } finally {
      setBusy(false);
    }
  };

  const speichern = async () => {
    try {
      await schreibe(aenderungenAus(tab, datensatz, formular), 'Gespeichert');
    } catch (err) {
      setFehler(err);
    }
  };

  const zuruecknehmen = (a: Aenderung) => {
    const aenderungen = rueckgaengig(tab, a.vorher, a.nachher);
    if (!window.confirm(`Diese Änderung zurücknehmen? Betrifft: ${Object.keys(aenderungen).join(', ')}`)) return;
    void schreibe(aenderungen, 'Änderung zurückgenommen');
  };

  return (
    <Dialog
      title={
        <>
          <code>{tab}</code> · {String(datensatz.id)}
        </>
      }
      onClose={onClose}
      onSubmit={speichern}
      busy={busy}
      wide
      extraActions={
        zurAkte && (
          <button type="button" className="button" onClick={zurAkte}>
            Firmenakte
          </button>
        )
      }
    >
      <div className="grid">
        {schema.columns.map((s) => {
          const fest = !istEditierbar(tab, s);
          if (schema.boolean?.includes(s)) {
            return (
              <label key={s} className="field">
                <span className="field-label">{s}</span>
                <span className="checkbox">
                  <input type="checkbox" checked={formular[s] === true} disabled={fest} onChange={(e) => setFormular((f) => ({ ...f, [s]: e.target.checked }))} /> {formular[s] ? 'ja' : 'nein'}
                </span>
              </label>
            );
          }
          const wert = String(formular[s] ?? '');
          const lang = wert.length > 60 || /text|notiz|nachricht|beschreibung|report|befunde|merkmale|auswahl|inhalt|slides|caption/.test(s);
          return (
            <label key={s} className={`field${lang ? ' wide' : ''}`}>
              <span className="field-label">{s}</span>
              {lang ? (
                <textarea rows={Math.min(10, Math.max(3, Math.ceil(wert.length / 70)))} value={wert} readOnly={fest} onChange={(e) => setFormular((f) => ({ ...f, [s]: e.target.value }))} />
              ) : (
                <input value={wert} readOnly={fest} inputMode={schema.numeric?.includes(s) ? 'decimal' : undefined} onChange={(e) => setFormular((f) => ({ ...f, [s]: e.target.value }))} />
              )}
            </label>
          );
        })}
      </div>
      <FormError error={fehler} />
      <h3>Verlauf</h3>
      {verlauf.loading && <Loading label="Verlauf wird geladen …" />}
      {verlauf.error && <p className="alert error">{errorMessage(verlauf.error)}</p>}
      {verlauf.data && verlauf.data.length === 0 && <p className="muted">Seit dem Umzug nicht geändert.</p>}
      {verlauf.data && verlauf.data.length > 0 && (
        <ul className="daten-verlauf">
          {verlauf.data.map((a) => {
            const spalten = a.aktion === 'update' ? Object.keys(rueckgaengig(tab, a.vorher, a.nachher)) : [];
            return (
              <li key={a.id}>
                <span className="muted">{new Date(a.am).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span> {a.von || 'unbekannt'}:{' '}
                {a.aktion === 'insert' ? 'angelegt' : spalten.length ? spalten.map((s) => `${s} „${kurz(a.vorher?.[s])}“ → „${kurz(a.nachher[s])}“`).join(', ') : 'nur Zeitstempel'}
                {spalten.length > 0 && (
                  <button type="button" className="button small" onClick={() => zuruecknehmen(a)} disabled={busy}>
                    Zurücknehmen
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

function ListenKarte({ zeilen, laedt, fehler, neuLaden }: { zeilen: Datensatz[] | undefined; laedt: boolean; fehler: unknown; neuLaden(): void }) {
  const apis = useApis();
  const { refresh } = useCrm();
  const toast = useToast();
  const listen = useMemo(() => {
    const nach = new Map<string, string[]>();
    for (const z of zeilen ?? []) nach.set(String(z.liste), [...(nach.get(String(z.liste)) ?? []), String(z.wert)]);
    return nach;
  }, [zeilen]);
  const [entwurf, setEntwurf] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState<unknown>();

  const speichern = async (liste: string) => {
    setBusy(liste);
    setErr(undefined);
    try {
      await apis.daten.setzeListe(liste, (entwurf[liste] ?? '').split('\n'));
      toast.show(`Liste „${liste}“ gespeichert`);
      setEntwurf((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== liste)));
      neuLaden();
      void refresh();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy('');
    }
  };

  return (
    <Card title="Auswahllisten">
      <p className="muted">Ein Wert pro Zeile, in der Reihenfolge, in der er in der Auswahl erscheinen soll.</p>
      {laedt && !zeilen && <Loading />}
      {fehler ? <ErrorBox error={fehler} onRetry={neuLaden} /> : null}
      <div className="grid">
        {[...listen].sort(([a], [b]) => a.localeCompare(b)).map(([liste, werte]) => (
          <div key={liste} className="field">
            <span className="field-label">{liste}</span>
            <textarea rows={Math.max(4, werte.length + 1)} value={entwurf[liste] ?? werte.join('\n')} onChange={(e) => setEntwurf((x) => ({ ...x, [liste]: e.target.value }))} />
            <div className="form-actions">
              <button type="button" className="button small primary" disabled={!!busy || entwurf[liste] === undefined} onClick={() => speichern(liste)}>
                {busy === liste ? 'Speichert …' : 'Speichern'}
              </button>
            </div>
          </div>
        ))}
      </div>
      <FormError error={err} />
    </Card>
  );
}

function EinstellungenKarte({ zeilen, laedt, fehler, neuLaden }: { zeilen: Datensatz[] | undefined; laedt: boolean; fehler: unknown; neuLaden(): void }) {
  const apis = useApis();
  const { refresh } = useCrm();
  const toast = useToast();
  const [entwurf, setEntwurf] = useState<Record<string, string>>({});
  const [err, setErr] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const speichern = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      await apis.store.saveEinstellungen(entwurf);
      toast.show('Einstellungen gespeichert');
      setEntwurf({});
      neuLaden();
      void refresh();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Einstellungen">
      <p className="muted">Schlüssel und Werte, die sonst die Einrichtungsseite setzt (Drive-Ordner, Links). Nur ändern, wenn klar ist, wofür der Schlüssel steht.</p>
      {laedt && !zeilen && <Loading />}
      {fehler ? <ErrorBox error={fehler} onRetry={neuLaden} /> : null}
      <div className="grid">
        {(zeilen ?? []).map((z) => {
          const key = String(z.schluessel);
          return (
            <label key={key} className="field wide">
              <span className="field-label">{key}</span>
              <input value={entwurf[key] ?? String(z.wert ?? '')} onChange={(e) => setEntwurf((x) => ({ ...x, [key]: e.target.value }))} />
            </label>
          );
        })}
      </div>
      <FormError error={err} />
      <div className="form-actions">
        <button type="button" className="button primary" disabled={busy || Object.keys(entwurf).length === 0} onClick={speichern}>
          {busy ? 'Speichert …' : 'Speichern'}
        </button>
      </div>
    </Card>
  );
}
