import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Route, Routes, useSearchParams } from 'react-router-dom';
import { Card, ErrorBox, Field, FormError, Loading, PageHeader } from '../../components/ui';
import { personen } from '../../data/zustaendig';
import { useCreatorApi, useInstanz } from '../api';
import { FRIST_ARTEN, RHYTHMEN, SERIEN_VORLAGEN, artLabel, istEigeneQuelle, quelleLabel, rhythmusLabel, type Frist, type FristSerie, type KalenderAbo } from './typen';
import './kalender.css';

const heute = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const tag = (d: Date) => d.toISOString().slice(0, 10);
const add = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return tag(x); };
const datumText = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
function zeitraum(fokus: string, ansicht: string) {
  const d = new Date(`${fokus}T12:00:00Z`);
  if (ansicht === 'woche') { const von = add(fokus, -((d.getUTCDay() + 6) % 7)); return { von, bis: add(von, 6) }; }
  const von = `${fokus.slice(0, 7)}-01`;
  return { von, bis: tag(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12))) };
}
interface Entwurf { id?: string; titel: string; datum: string; start: string; ende: string; art: string; rhythmus: string; uhrzeit: string; zustaendig: string; notiz: string; link: string; serie: boolean; }
const leer = (): Entwurf => ({ titel: '', datum: heute(), start: heute(), ende: '', art: 'sonstiges', rhythmus: 'monatlich', uhrzeit: '', zustaendig: '', notiz: '', link: '', serie: false });

function KalenderSeite() {
  const api = useCreatorApi();
  const instanz = useInstanz();
  const partner = instanz.rolle === 'partner';
  const [suche] = useSearchParams();
  const [fokus, setFokus] = useState(heute);
  const [ansicht, setAnsicht] = useState('monat');
  const [art, setArt] = useState('');
  const [person, setPerson] = useState('');
  const [archiv, setArchiv] = useState(false);
  const [offen, setOffen] = useState(false);
  const [fristen, setFristen] = useState<Frist[]>([]);
  const [serien, setSerien] = useState<FristSerie[]>([]);
  const [abo, setAbo] = useState<KalenderAbo | null>(null);
  const [apiUrl, setApiUrl] = useState('');
  const [laedt, setLaedt] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<unknown>(null);
  const [meldung, setMeldung] = useState('');
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [detail, setDetail] = useState<Frist | null>(null);
  const bereich = useMemo(() => zeitraum(fokus, ansicht), [fokus, ansicht]);
  const laden = useCallback(async () => {
    setLaedt(true); setFehler(null);
    try {
      const [f, s, a] = await Promise.all([
        api.post<{ fristen: Frist[] }>('/c/kalender/liste', { ...bereich, archiv }),
        partner ? Promise.resolve({ serien: [] as FristSerie[] }) : api.get<{ serien: FristSerie[] }>('/c/kalender/serien'),
        api.get<{ abo: KalenderAbo | null; api_url: string }>('/c/kalender/abo'),
      ]);
      setFristen(f.fristen); setSerien(s.serien); setAbo(a.abo); setApiUrl(a.api_url);
    } catch (e) { setFehler(e); } finally { setLaedt(false); }
  }, [api, bereich, archiv, partner]);
  useEffect(() => { void laden(); }, [laden]);
  useEffect(() => {
    const id = suche.get('frist');
    if (id) void api.post<{ frist: Frist }>('/c/kalender/frist', { id }).then(r => setDetail(r.frist)).catch(setFehler);
  }, [api, suche]);
  async function aktion(pfad: string, daten: unknown, text: string) {
    setBusy(true); setFehler(null); setMeldung('');
    try { await api.post(pfad, daten); await laden(); setMeldung(text); return true; }
    catch (e) { setFehler(e); return false; } finally { setBusy(false); }
  }
  async function speichern(e: FormEvent) {
    e.preventDefault(); if (!entwurf) return;
    if (await aktion(`/c/kalender/${entwurf.serie ? 'serie' : 'speichern'}`, entwurf, 'Gespeichert.')) { setEntwurf(null); setDetail(null); }
  }
  function bearbeiten(f: Frist) { setDetail(null); setEntwurf({ ...leer(), ...f }); }
  function schieben(richtung: number) {
    if (ansicht === 'woche') setFokus(add(fokus, richtung * 7));
    else { const d = new Date(`${fokus}T12:00:00Z`); setFokus(tag(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + richtung, 1, 12)))); }
  }
  const sichtbar = fristen.filter(f => (!art || f.art === art) && (!person || personen(f.zustaendig).includes(person)) && (!offen || !f.erledigt));
  const personenListe = [...new Set(fristen.flatMap(f => personen(f.zustaendig)))].sort();
  const ueberfaellig = sichtbar.filter(f => f.datum < heute() && !f.erledigt && !f.archiviert);
  const monatsbeginn = ansicht === 'woche' ? bereich.von : add(bereich.von, -((new Date(`${bereich.von}T12:00:00Z`).getUTCDay() + 6) % 7));
  const tage = Array.from({ length: ansicht === 'woche' ? 7 : 42 }, (_, i) => add(monatsbeginn, i));
  const aboUrl = abo ? `${apiUrl.replace(/\/$/, '')}/oeffentlich/kalender/${abo.token}.ics` : '';
  return <>
    <PageHeader title="Kalender" subtitle="Uploads, Drehtage und Abgaben. Uhrzeiten gelten für Europa/Berlin." actions={!partner && <button className="button primary" onClick={() => { setEntwurf(leer()); setDetail(null); }}>Frist anlegen</button>} />
    <div className="page organisation-page">
      {fehler != null && <ErrorBox error={fehler} onRetry={() => void laden()} />}
      {meldung && <p className="muted" role="status">{meldung}</p>}
      {partner && <p className="muted">Hier stehen die Fristen deiner freigegebenen Boards. Änderungen machst du direkt an der Aufgabe.</p>}
      <div className="filters kalender-filter">
        <Field label="Ansicht"><select value={ansicht} onChange={e => setAnsicht(e.target.value)}><option value="monat">Monat</option><option value="woche">Woche</option><option value="liste">Liste</option></select></Field>
        <Field label="Art"><select value={art} onChange={e => setArt(e.target.value)}><option value="">Alle Arten</option>{FRIST_ARTEN.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Field>
        <Field label="Zuständig"><select value={person} onChange={e => setPerson(e.target.value)}><option value="">Alle Personen</option>{personenListe.map(p => <option key={p}>{p}</option>)}</select></Field>
        <label><input type="checkbox" checked={offen} onChange={e => setOffen(e.target.checked)} /> Nur offene</label>
        <label><input type="checkbox" checked={archiv} onChange={e => setArchiv(e.target.checked)} /> Archiv</label>
      </div>
      <div className="kalender-nav"><button className="button small" aria-label="Vorheriger Zeitraum" onClick={() => schieben(-1)}>Zurück</button><strong>{datumText(bereich.von)} – {datumText(bereich.bis)}</strong><button className="button small" aria-label="Nächster Zeitraum" onClick={() => schieben(1)}>Weiter</button><button className="button small" onClick={() => setFokus(heute())}>Heute</button><Field label="Datum wählen"><input type="date" value={fokus} onChange={e => e.target.value && setFokus(e.target.value)} /></Field></div>
      {laedt ? <Loading label="Fristen werden geladen …" /> : <>
        {ueberfaellig.length > 0 && <details className="kalender-ueberfaellig"><summary>{ueberfaellig.length} offene Fristen sind überfällig</summary><ul>{ueberfaellig.map(f => <li key={f.id}><button className="button small" onClick={() => setDetail(f)}>{datumText(f.datum)}: {f.titel}</button></li>)}</ul></details>}
        {ansicht === 'liste' ? <div className="organisation-table"><table className="table compact"><thead><tr><th>Datum</th><th>Frist</th><th>Art</th><th>Zuständig</th><th>Stand</th></tr></thead><tbody>{sichtbar.map(f => <tr key={f.id}><td>{datumText(f.datum)} {f.uhrzeit}</td><td><button className="button small" onClick={() => setDetail(f)}>{f.titel}</button></td><td>{artLabel(f.art)}</td><td>{f.zustaendig || 'Noch offen'}</td><td>{f.archiviert ? 'Archiviert' : f.erledigt ? 'Erledigt' : 'Offen'}</td></tr>)}</tbody></table>{!sichtbar.length && <p className="muted">Keine Fristen für diese Auswahl.</p>}</div> : <div className={`kalender-raster ${ansicht}`} role="region" aria-label={`${ansicht === 'woche' ? 'Wochen' : 'Monats'}kalender`}>
          {tage.map(d => <section key={d} className={`kalender-tag${d === heute() ? ' heute' : ''}${d.slice(0, 7) !== fokus.slice(0, 7) ? ' anderer-monat' : ''}`} aria-label={datumText(d)}><h2><time dateTime={d}>{new Date(`${d}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: ansicht === 'woche' ? 'short' : undefined })}</time></h2>{sichtbar.filter(f => f.datum === d).map(f => <button key={f.id} className={`kalender-eintrag${f.erledigt ? ' erledigt' : ''}`} onClick={() => setDetail(f)}><small>{f.uhrzeit || artLabel(f.art)}</small><span>{f.titel}</span>{f.erledigt && <small>Erledigt</small>}</button>)}</section>)}
        </div>}
      </>}
      {detail && <Card title={detail.titel} actions={<button className="button small" onClick={() => setDetail(null)}>Schließen</button>}><p>{datumText(detail.datum)} {detail.uhrzeit} · {artLabel(detail.art)} · {detail.erledigt ? 'Erledigt' : 'Offen'}</p><p>Zuständig: {detail.zustaendig || 'Noch offen'}</p>{detail.notiz && <p className="organisation-notiz">{detail.notiz}</p>}{detail.serie_id && <p className="muted">Einzeltermin einer Serie{detail.abweichend ? ' · separat angepasst' : ''}.</p>}{detail.link && (detail.link.startsWith('/') ? <Link to={detail.link}>Zum Ursprung: {quelleLabel(detail.quelle)}</Link> : <a href={detail.link} target="_blank" rel="noreferrer">Verknüpfung öffnen</a>)}{istEigeneQuelle(detail.quelle) && !partner ? <div className="kalender-nav"><button className="button" onClick={() => bearbeiten(detail)}>Bearbeiten</button><button className="button" disabled={busy} onClick={async () => { if (await aktion('/c/kalender/erledigt', { id: detail.id, erledigt: !detail.erledigt }, detail.erledigt ? 'Wieder geöffnet.' : 'Frist erledigt.')) setDetail(null); }}>{detail.erledigt ? 'Wieder öffnen' : 'Erledigen'}</button><button className="button" disabled={busy} onClick={async () => { if (await aktion('/c/kalender/archivieren', { id: detail.id, archiviert: !detail.archiviert }, 'Archiv aktualisiert.')) setDetail(null); }}>{detail.archiviert ? 'Wiederherstellen' : 'Archivieren'}</button></div> : <p className="muted">Diese Frist wird in {quelleLabel(detail.quelle)} bearbeitet.</p>}</Card>}
      {entwurf && <Card title={entwurf.id ? entwurf.serie ? 'Serie bearbeiten' : 'Frist bearbeiten' : 'Neue Frist'}><form onSubmit={e => void speichern(e)}><div className="organisation-form">
        <Field label="Titel"><input required maxLength={200} value={entwurf.titel} onChange={e => setEntwurf({ ...entwurf, titel: e.target.value })} /></Field>
        <Field label="Art"><select value={entwurf.art} onChange={e => setEntwurf({ ...entwurf, art: e.target.value })}>{FRIST_ARTEN.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Field>
        {!entwurf.id && <label><input type="checkbox" checked={entwurf.serie} onChange={e => setEntwurf({ ...entwurf, serie: e.target.checked })} /> Wiederkehrende Frist</label>}
        <Field label={entwurf.serie ? 'Erster Termin' : 'Datum'}><input type="date" required value={entwurf.serie ? entwurf.start : entwurf.datum} onChange={e => setEntwurf({ ...entwurf, [entwurf.serie ? 'start' : 'datum']: e.target.value })} /></Field>
        <Field label="Uhrzeit (optional)"><input type="time" value={entwurf.uhrzeit} onChange={e => setEntwurf({ ...entwurf, uhrzeit: e.target.value })} /></Field>
        {entwurf.serie && <><Field label="Wiederholung"><select value={entwurf.rhythmus} onChange={e => setEntwurf({ ...entwurf, rhythmus: e.target.value })}>{RHYTHMEN.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></Field><Field label="Letzter Termin (optional)"><input type="date" min={entwurf.start} value={entwurf.ende} onChange={e => setEntwurf({ ...entwurf, ende: e.target.value })} /></Field></>}
        <Field label="Zuständig" hint="Mehrere Personen mit Komma trennen."><input maxLength={300} value={entwurf.zustaendig} onChange={e => setEntwurf({ ...entwurf, zustaendig: e.target.value })} /></Field>
        <Field label="Verknüpfung (optional)"><input maxLength={500} value={entwurf.link} placeholder="https://… oder /content" onChange={e => setEntwurf({ ...entwurf, link: e.target.value })} /></Field>
        <Field label="Notiz" wide><textarea rows={3} maxLength={4000} value={entwurf.notiz} onChange={e => setEntwurf({ ...entwurf, notiz: e.target.value })} /></Field>
      </div><FormError error={fehler} /><div className="kalender-nav"><button type="submit" className="button primary" disabled={busy}>{busy ? 'Speichert …' : 'Speichern'}</button><button type="button" className="button" disabled={busy} onClick={() => setEntwurf(null)}>Abbrechen</button></div></form></Card>}
      {!partner && <Card title="Wiederkehrende Fristen" actions={<button className="button small" onClick={() => setEntwurf({ ...leer(), serie: true })}>Serie anlegen</button>}><p className="muted">Termine für Buchhaltung und Gesellschaft legt ihr mit euren Fachleuten fest. Einzelne Termine lassen sich im Kalender unabhängig erledigen oder verschieben.</p><Field label="Vorlage verwenden"><select value="" onChange={e => { const v = SERIEN_VORLAGEN[Number(e.target.value)]; if (v) setEntwurf({ ...leer(), ...v, serie: true }); }}><option value="">Vorlage wählen …</option>{SERIEN_VORLAGEN.map((v, i) => <option key={v.titel} value={i}>{v.titel}</option>)}</select></Field><ul className="liste-schlicht">{serien.map(s => <li key={s.id}><div><strong>{s.titel}</strong><p className="muted">{rhythmusLabel(s.rhythmus)} · {s.archiviert ? 'Archiviert' : s.naechster ? `Nächster Termin: ${datumText(s.naechster)}` : 'Keine weiteren Termine'}</p></div><div className="kalender-nav"><button className="button small" onClick={() => setEntwurf({ ...leer(), ...s, serie: true })}>Serie bearbeiten</button><button className="button small" disabled={busy} onClick={() => void aktion('/c/kalender/serie/archivieren', { id: s.id, archiviert: !s.archiviert }, 'Serie aktualisiert.')}>{s.archiviert ? 'Wiederherstellen' : 'Serie archivieren'}</button></div></li>)}</ul>{!serien.length && <p className="muted">Noch keine wiederkehrenden Fristen.</p>}</Card>}
      <Card title="Kalender abonnieren"><p>Dein persönlicher Abo-Link zeigt {partner ? 'nur die Fristen deiner freigegebenen Boards' : 'die für dich sichtbaren Fristen'}. Behandle den Link wie einen Zugangsschlüssel.</p>{abo ? <><Field label="Umfang"><select disabled={busy} value={abo.umfang} onChange={e => void aktion('/c/kalender/abo', { umfang: e.target.value }, 'Abo aktualisiert.')}><option value="alle">Alle sichtbaren Fristen</option><option value="meine">Nur meine Fristen</option></select></Field><Field label="Abo-Adresse"><input readOnly value={aboUrl} onFocus={e => e.target.select()} /></Field><div className="kalender-nav"><button className="button small" onClick={() => void navigator.clipboard.writeText(aboUrl).then(() => setMeldung('Abo-Link kopiert.')).catch(() => setFehler(new Error('Bitte die Abo-Adresse markieren und kopieren.')))}>Link kopieren</button><button className="button small" disabled={busy} onClick={() => void aktion('/c/kalender/abo', { neu: true }, 'Neuer Link erzeugt. Bitte im Kalender ersetzen; der alte Link ist ungültig.')}>Link erneuern</button><button className="button small" disabled={busy} onClick={() => void aktion('/c/kalender/abo/beenden', {}, 'Kalender-Abo beendet.')}>Abo beenden</button></div></> : <button className="button" disabled={busy} onClick={() => void aktion('/c/kalender/abo', { umfang: 'alle' }, 'Abo-Link erstellt.')}>Abo-Link erstellen</button>}<details><summary>Mit Google, Apple oder Outlook abonnieren</summary><ul><li>Google Kalender: Weitere Kalender → Per URL. Abo-Adresse einfügen.</li><li>Apple Kalender: Ablage → Neues Kalenderabonnement. Abo-Adresse einfügen.</li><li>Outlook: Kalender hinzufügen → Aus dem Internet abonnieren. Abo-Adresse einfügen.</li></ul><p className="muted">Die Kalender-App bestimmt, wann sie Änderungen abholt. Änderungen an Fristen macht ihr im Hub.</p></details></Card>
    </div>
  </>;
}
export function KalenderRouten() { return <Routes><Route index element={<KalenderSeite />} /></Routes>; }
