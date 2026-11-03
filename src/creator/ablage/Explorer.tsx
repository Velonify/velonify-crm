import { useCallback, useEffect, useState } from 'react';
import { ErrorBox, Loading } from '../../components/ui';
import { useCreatorApi, useInstanz } from '../api';
import type { AblageEintrag, ExplorerAntwort } from './typen';

const groesse = (b: number | null) => (b === null ? '' : b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${Math.round(b / 1024)} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`);
const wann = (iso: string) => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

/**
 * Explorer of the shared Ablage in Google Drive (served by crm-api with its service account). With `auswahl` it picks
 * files, e.g. as attachments of a content item; without it, it is the Ablage page.
 */
export function Explorer({ auswahl }: { auswahl?: (e: AblageEintrag) => void }) {
  const api = useCreatorApi();
  const partner = useInstanz().rolle === 'partner';
  const [ordner, setOrdner] = useState('');
  const [daten, setDaten] = useState<ExplorerAntwort | null>(null);
  const [fehler, setFehler] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState('');
  const [ausgeschnitten, setAusgeschnitten] = useState<AblageEintrag | null>(null);

  const laden = useCallback(async () => {
    setFehler(null);
    try { setDaten(await api.post<ExplorerAntwort>('/c/ablage/explorer', ordner ? { ordner } : {})); }
    catch (e) { setFehler(e); }
  }, [api, ordner]);
  useEffect(() => { void laden(); }, [laden]);

  async function aktion(pfad: string, body: unknown, text: string) {
    setBusy(true); setFehler(null); setMeldung('');
    try { await api.post(pfad, body); await laden(); setMeldung(text); return true; }
    catch (e) { setFehler(e); return false; } finally { setBusy(false); }
  }
  const neuerOrdner = () => { const name = window.prompt('Name des neuen Ordners'); if (name?.trim() && daten) void aktion('/c/ablage/explorer/neu', { eltern: daten.ordner.id, name }, `Ordner „${name.trim()}“ angelegt.`); };
  const umbenennen = (e: AblageEintrag) => { const name = window.prompt('Neuer Name', e.name); if (name?.trim() && name.trim() !== e.name) void aktion('/c/ablage/explorer/umbenennen', { id: e.id, name }, 'Umbenannt.'); };
  const einfuegen = async () => { if (ausgeschnitten && daten && (await aktion('/c/ablage/explorer/verschieben', { id: ausgeschnitten.id, ziel: daten.ordner.id }, `„${ausgeschnitten.name}“ verschoben.`))) setAusgeschnitten(null); };

  if (!daten) return fehler != null ? <ErrorBox error={fehler} onRetry={() => void laden()} /> : <Loading />;
  const verwalten = !auswahl && !partner;
  return (
    <div className="ablage-explorer">
      {daten.bereiche.length > 0 && (
        <nav className="ablage-bereiche" aria-label="Bereiche der Ablage">
          {daten.bereiche.filter((b) => !b.schluessel.includes('/') || b.schluessel === 'content/cutter').map((b) => (
            <button key={b.id} type="button" className={`button small${b.id === daten.ordner.id ? ' is-aktiv' : ''}`} onClick={() => setOrdner(b.id)}>{b.name}</button>
          ))}
        </nav>
      )}
      <nav className="ablage-pfad" aria-label="Ordnerpfad">
        {daten.pfad.map((p, i) => (
          <span key={p.id}>{i > 0 && ' / '}{i === daten.pfad.length - 1 ? <strong>{p.name}</strong> : <button type="button" className="link-button" onClick={() => setOrdner(p.id)}>{p.name}</button>}</span>
        ))}
      </nav>
      <div className="ablage-werkzeuge">
        <button type="button" className="button small" disabled={busy} onClick={neuerOrdner}>Neuer Ordner</button>
        <a className="button small" href={daten.ordner.link} target="_blank" rel="noreferrer">Dateien hochladen</a>
        <button type="button" className="button small" disabled={busy} onClick={() => void laden()}>Aktualisieren</button>
        {verwalten && ausgeschnitten && <><button type="button" className="button small primary" disabled={busy} onClick={() => void einfuegen()}>„{ausgeschnitten.name}“ hier einfügen</button><button type="button" className="button small" onClick={() => setAusgeschnitten(null)}>Verschieben abbrechen</button></>}
      </div>
      <p className="small muted">Hochladen öffnet den Ordner in Google Drive: Dateien dort hineinziehen, danach hier „Aktualisieren“. Alles bleibt in eurer Drive.</p>
      {fehler != null && <ErrorBox error={fehler} onRetry={() => void laden()} />}
      {meldung && <p className="small muted" role="status">{meldung}</p>}
      <div className="table-wrap">
        <table className="table compact">
          <thead><tr><th>Name</th><th>Geändert</th><th>Größe</th><th aria-label="Aktionen" /></tr></thead>
          <tbody>
            {daten.eintraege.map((e) => (
              <tr key={e.id}>
                <td>{e.ordner ? <button type="button" className="link-button" onClick={() => setOrdner(e.id)}>📁 {e.name}</button> : <a href={e.link} target="_blank" rel="noreferrer">{e.name}</a>}</td>
                <td className="small">{wann(e.geaendert_am)}{e.geaendert_von && <span className="muted"> · {e.geaendert_von}</span>}</td>
                <td className="small">{groesse(e.groesse)}</td>
                <td className="ablage-aktionen">
                  {auswahl && !e.ordner && <button type="button" className="button small primary" onClick={() => auswahl(e)}>Anhängen</button>}
                  {verwalten && !e.fest && <><button type="button" className="button small" disabled={busy} onClick={() => umbenennen(e)}>Umbenennen</button><button type="button" className="button small" disabled={busy} onClick={() => setAusgeschnitten(e)}>Verschieben</button></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!daten.eintraege.length && <p className="muted">Dieser Ordner ist leer.</p>}
    </div>
  );
}
