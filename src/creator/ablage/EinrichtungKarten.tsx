import { useCallback, useEffect, useState } from 'react';
import { Card, Field, FormError, Loading } from '../../components/ui';
import { useAuth } from '../../auth/AuthContext';
import { darfEinrichten } from '../../data/instanz';
import { useCreatorApi, useInstanz } from '../api';
import { useAblageDrive, waehleDriveOrdner } from './drive';
import { ABLAGE_VORLAGE, HAUPTORDNER, PASSWORTMANAGER, PASSWORT_SCHRITTE, schrittText, type AblageOrdner, type PasswortmanagerStand } from './typen';
import '../kalender/kalender.css';

export function DriveEinrichtung() {
  const api = useCreatorApi(); const drive = useAblageDrive(); const { getToken } = useAuth();
  const [ordner, setOrdner] = useState<AblageOrdner[]>([]);
  const [laedt, setLaedt] = useState(true); const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<unknown>(null); const [status, setStatus] = useState('');
  const laden = useCallback(async () => {
    try { const d = await api.get<{ ordner: AblageOrdner[] }>('/c/ablage'); setOrdner(d.ordner); }
    catch (e) { setFehler(e); } finally { setLaedt(false); }
  }, [api]);
  useEffect(() => { void laden(); }, [laden]);
  async function verbinden(schluessel: string) {
    setBusy(true); setFehler(null); setStatus('');
    try { const id = await waehleDriveOrdner(await getToken()); if (id) { await drive.verknuepfen(schluessel, id); await laden(); setStatus('Ordner verknüpft.'); } }
    catch (e) { setFehler(e); } finally { setBusy(false); }
  }
  async function anlegen() {
    setBusy(true); setFehler(null);
    try { await drive.vorlageAnlegen(name => setStatus(`Ordner wird vorbereitet: ${name}`)); setStatus('Ablagestruktur ist eingerichtet. Bestehende Ordner wurden wiederverwendet.'); }
    catch (e) { setFehler(e); setStatus('Die Einrichtung wurde unterbrochen. Erneut starten setzt sie ohne doppelte Ordner fort.'); }
    finally { await laden(); setBusy(false); }
  }
  const haupt = ordner.find(o => o.schluessel === HAUPTORDNER);
  return <Card title="Ablage in Google Drive"><p>Wähle einen Hauptordner. Der Hub legt darin die gemeinsame Struktur an. Bestehende Ordner für Rohmaterial oder Schnitt kannst du stattdessen direkt verknüpfen.</p><p className="muted">Der Zugriff gilt für die mit dem Hub angelegten oder ausgewählten Dateien. Die Freigaben für das Team verwaltest du in Google Drive.</p><FormError error={fehler} />{status && <p role="status">{status}</p>}{laedt ? <Loading /> : <><div className="kalender-nav">{haupt && <a href={haupt.url} target="_blank" rel="noreferrer">{haupt.name}</a>}<button className="button" disabled={busy} onClick={() => void verbinden(HAUPTORDNER)}>{haupt ? 'Hauptordner auswählen' : 'Hauptordner verbinden'}</button><button className="button primary" disabled={busy || !haupt} onClick={() => void anlegen()}>{busy ? 'Bitte warten …' : 'Ordnerstruktur anlegen'}</button></div><ul className="liste-schlicht">{ABLAGE_VORLAGE.map(v => { const o = ordner.find(x => x.schluessel === v.schluessel); return <li key={v.schluessel}><div><strong>{v.name}</strong><p className="muted">{v.beschreibung}</p>{o?.bereit ? <a href={o.url} target="_blank" rel="noreferrer">Ordner öffnen</a> : <span className="muted">{o ? 'Anlage noch nicht abgeschlossen' : 'Noch nicht eingerichtet'}</span>}</div><button className="button small" disabled={busy || !haupt} onClick={() => void verbinden(v.schluessel)}>Bestehenden Ordner wählen</button></li>; })}</ul></>}</Card>;
}

export function PasswortmanagerEinrichtung() {
  const api = useCreatorApi(); const instanz = useInstanz();
  const praefix = instanz.bausteine.includes('ablage') ? '/c/ablage' : '/c/kalender';
  const [stand, setStand] = useState<PasswortmanagerStand | null>(null);
  const [fehler, setFehler] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { void api.get<{ stand: PasswortmanagerStand }>(`${praefix}/passwortmanager`).then(r => setStand(r.stand)).catch(setFehler); }, [api, praefix]);
  async function speichern(body: unknown) {
    setBusy(true); setFehler(null);
    try { setStand((await api.post<{ stand: PasswortmanagerStand }>(`${praefix}/passwortmanager`, body)).stand); }
    catch (e) { setFehler(e); } finally { setBusy(false); }
  }
  return <Card title="Team-Passwortmanager"><p>Gemeinsame Zugänge gehören in einen Team-Tresor. Im Hub speichert ihr nur den Fortschritt dieser Einrichtung.</p><ul>{PASSWORTMANAGER.map(p => <li key={p.id}><a href={p.url} target="_blank" rel="noreferrer">{p.name}</a>: {p.vorteile}</li>)}</ul><FormError error={fehler} />{stand ? <><Field label="Gewählter Passwortmanager"><select value={stand.wahl ?? ''} disabled={busy} onChange={e => void speichern({ wahl: e.target.value || null })}><option value="">Noch nicht entschieden</option>{PASSWORTMANAGER.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><p className="muted" role="status">{PASSWORT_SCHRITTE.filter(s => stand.haken[s.id]).length} von {PASSWORT_SCHRITTE.length} Schritten erledigt.</p><ul className="liste-schlicht">{PASSWORT_SCHRITTE.map(s => <li key={s.id}><label><input type="checkbox" checked={Boolean(stand.haken[s.id])} disabled={busy} onChange={e => void speichern({ schritt: s.id, erledigt: e.target.checked })} />{schrittText(s, stand.wahl)}</label>{stand.haken[s.id] && <small className="muted">Erledigt von {stand.haken[s.id].von}</small>}</li>)}</ul></> : !fehler && <Loading />}</Card>;
}

export function OrganisationEinrichtung() {
  const instanz = useInstanz();
  if (!darfEinrichten(instanz.rolle)) return null;
  return <>{instanz.bausteine.includes('ablage') && <DriveEinrichtung />}{(instanz.bausteine.includes('ablage') || instanz.bausteine.includes('kalender')) && <PasswortmanagerEinrichtung />}</>;
}
