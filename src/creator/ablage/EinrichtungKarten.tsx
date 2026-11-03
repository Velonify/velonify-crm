import { useCallback, useEffect, useState } from 'react';
import { Card, Field, FormError, Loading } from '../../components/ui';
import { darfEinrichten } from '../../data/instanz';
import { useCreatorApi, useInstanz } from '../api';
import { ABLAGE_VORLAGE, HAUPTORDNER, PASSWORTMANAGER, PASSWORT_SCHRITTE, schrittText, type AblageOrdner, type PasswortmanagerStand } from './typen';
import '../kalender/kalender.css';

export function DriveEinrichtung() {
  const api = useCreatorApi();
  const [ordner, setOrdner] = useState<AblageOrdner[]>([]); const [konto, setKonto] = useState('');
  const [laedt, setLaedt] = useState(true); const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<unknown>(null); const [status, setStatus] = useState(''); const [link, setLink] = useState('');
  const laden = useCallback(async () => {
    try { const [d, k] = await Promise.all([api.get<{ ordner: AblageOrdner[] }>('/c/ablage'), api.get<{ konto: string }>('/c/ablage/explorer/konto')]); setOrdner(d.ordner); setKonto(k.konto); }
    catch (e) { setFehler(e); } finally { setLaedt(false); }
  }, [api]);
  useEffect(() => { void laden(); }, [laden]);
  async function einrichten(body: Record<string, unknown>, text: string) {
    setBusy(true); setFehler(null); setStatus(body.struktur ? 'Ordner werden angelegt …' : '');
    try { setOrdner((await api.post<{ ordner: AblageOrdner[] }>('/c/ablage/explorer/einrichten', body)).ordner); setStatus(text); setLink(''); }
    catch (e) { setFehler(e); setStatus(''); } finally { setBusy(false); }
  }
  const haupt = ordner.find(o => o.schluessel === HAUPTORDNER);
  return <Card title="Ablage in Google Drive"><p>Die Ablage liegt in eurer eigenen Google Drive. Der Hub greift über ein technisches Konto darauf zu, das nur den geteilten Ordner sieht. Dateien liegen nie bei Velonify.</p><ol><li>In Google Drive den Hauptordner anlegen oder wählen, zum Beispiel „Matsu Ablage“.</li><li>Ordner teilen mit {konto ? <code>{konto}</code> : 'dem technischen Konto des Hubs'} als <strong>Bearbeiter</strong> (Benachrichtigung kann aus bleiben).</li><li>Link des Ordners kopieren und hier einfügen.</li></ol><FormError error={fehler} />{status && <p role="status">{status}</p>}{laedt ? <Loading /> : <><div className="kalender-nav">{haupt && <a href={haupt.url} target="_blank" rel="noreferrer">{haupt.name}</a>}<Field label={haupt ? 'Anderen Hauptordner verbinden' : 'Link des Hauptordners'}><input value={link} placeholder="https://drive.google.com/drive/folders/…" onChange={e => setLink(e.target.value)} /></Field><button className="button" disabled={busy || !link.trim()} onClick={() => void einrichten({ link }, 'Hauptordner verbunden.')}>Verbinden</button><button className="button primary" disabled={busy || !haupt} onClick={() => void einrichten({ struktur: true }, 'Ablagestruktur ist eingerichtet. Bestehende Ordner wurden wiederverwendet.')}>{busy ? 'Bitte warten …' : 'Ordnerstruktur anlegen'}</button></div><ul className="liste-schlicht">{ABLAGE_VORLAGE.map(v => { const o = ordner.find(x => x.schluessel === v.schluessel); return <li key={v.schluessel}><div><strong>{v.name}</strong><p className="muted">{v.beschreibung}</p>{o?.bereit ? <a href={o.url} target="_blank" rel="noreferrer">Ordner öffnen</a> : <span className="muted">Noch nicht eingerichtet</span>}</div></li>; })}</ul></>}</Card>;
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
