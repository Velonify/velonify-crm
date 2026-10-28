import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, ErrorBox, Field, FormError, Loading, PageHeader } from '../../components/ui';
import type { Kooperation } from '../../../functions/crm-api/src/creator/kooperationen/uebersicht';
import { useBaustein, useInstanz } from '../api';
import { FreigabeKnopf } from '../freigaben/FreigabeKnopf';
import { geld, KANAELE, LABEL, PHASEN, useDaten } from './gemeinsam';

type Liste = { kooperationen: Kooperation[]; betraege: boolean; summen: { offen: Record<string, number>; bezahlt: Record<string, number> } | null; agentur: string };
export function Uebersicht({ board = false }: { board?: boolean }) {
  const { daten, fehler, busy, laden, speichern } = useDaten<Liste>('/c/kooperationen/liste');
  const [params, setParams] = useSearchParams();
  const [suche, setSuche] = useState('');
  const [archiv, setArchiv] = useState(false);
  const pipeline = useBaustein('pipeline');
  if (board && !pipeline) return <ErrorBox error={new Error('Die Pipeline ist nicht eingeschaltet.')} />;
  if (!daten) return fehler ? <ErrorBox error={fehler} onRetry={() => void laden()} /> : <Loading />;
  const selected = params.get('id');
  const filtered = daten.kooperationen.filter(k => k.archiviert === archiv && `${k.partner} ${k.marke} ${k.titel}`.toLowerCase().includes(suche.toLowerCase()));
  const wechseln = (id: string) => setParams({ id });
  return <>
    <PageHeader title={board ? 'Kooperations-Pipeline' : 'Kooperationen'} subtitle="Partner, nächste Schritte und Zahlungen im Blick." actions={<button className="button primary" onClick={() => wechseln('neu')}>Kooperation anlegen</button>} />
    <div className="filters"><Field label="Suchen"><input value={suche} onChange={e => setSuche(e.target.value)} /></Field><label><input type="checkbox" checked={archiv} onChange={e => setArchiv(e.target.checked)} /> Archiv</label>{pipeline && <Link className="button" to={board ? '/kooperationen' : '/kooperationen/pipeline'}>{board ? 'Liste' : 'Pipeline'}</Link>}</div>
    <FormError error={fehler} />
    {daten.summen && <p>Offen: {geld(daten.summen.offen.EUR)} · {geld(daten.summen.offen.JPY, 'JPY')} — Bezahlt: {geld(daten.summen.bezahlt.EUR)} · {geld(daten.summen.bezahlt.JPY, 'JPY')}</p>}
    {selected && <KoopForm key={selected} id={selected} start={daten.kooperationen.find(k => k.id === selected)} close={() => setParams({})} done={() => void laden()} />}
    {board ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: '1rem' }}>{[...PHASEN, 'abgeschlossen', 'abgesagt'].map(stand => <section key={stand} aria-label={LABEL[stand]} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (filtered.some(k => k.id === id)) void speichern('/c/kooperationen/verschieben', { id, stand }); }}><h2>{LABEL[stand]}</h2>{filtered.filter(k => k.stand === stand).map(k => <article key={k.id} draggable={!busy} onDragStart={e => e.dataTransfer.setData('text/plain', k.id)}><button className="button small" onClick={() => wechseln(k.id)}>{k.titel || k.partner}</button><p>{k.zustaendig || 'Noch nicht zugewiesen'}{daten.betraege ? ` · ${geld(k.betrag, k.waehrung)}` : ''}</p><select aria-label={`Phase für ${k.titel || k.partner}`} value={k.stand} disabled={busy} onChange={e => void speichern('/c/kooperationen/verschieben', { id: k.id, stand: e.target.value })}>{[...PHASEN, 'abgeschlossen', 'abgesagt'].map(p => <option key={p} value={p}>{LABEL[p]}</option>)}</select></article>)}</section>)}</div> : <div style={{ overflowX: 'auto' }}><table className="table compact"><thead><tr><th>Partner / Kooperation</th><th>Stand</th><th>Zuständig</th>{daten.betraege && <th>Betrag</th>}<th>Zahlung</th><th>Fällig</th></tr></thead><tbody>{filtered.map(k => <tr key={k.id}><td><button className="button small" onClick={() => wechseln(k.id)}>{k.titel || k.partner}</button><div className="small muted">{k.marke || k.partner}{k.ueber_agentur ? ` · ${daten.agentur || 'Deal-Agentur'}` : ''}</div></td><td>{LABEL[k.stand]}</td><td>{k.zustaendig || '–'}</td>{daten.betraege && <td>{geld(k.betrag, k.waehrung)}</td>}<td>{LABEL[k.zahlung]}</td><td>{k.faellig_am || '–'}</td></tr>)}</tbody></table></div>}
    {!filtered.length && <p>Noch keine Kooperationen in dieser Ansicht. Lege die erste Kooperation an.</p>}
  </>;
}
function KoopForm({ id, start, close, done }: { id: string; start?: Kooperation; close(): void; done(): void }) {
  const { api, fehler, setFehler } = useDaten<{ kooperationen: unknown[] }>('/c/kooperationen/auswahl');
  const [form, setForm] = useState<Record<string, string | number | boolean | string[] | null>>({ partner: '', titel: '', marke: '', kanaele: [], waehrung: 'EUR', stand: 'anfrage', zahlung: 'offen', werbung: true, ueber_agentur: false, ...(start ?? {}) });
  const [busy, setBusy] = useState(false);
  const sicht = useInstanz();
  const pipeline = useBaustein('pipeline');
  const set = (k: string, v: string | boolean | string[]) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    setBusy(true); setFehler(undefined);
    try { await api.post('/c/kooperationen/speichern', { ...form, id: id === 'neu' ? undefined : id }); done(); close(); }
    catch (e) { setFehler(e); } finally { setBusy(false); }
  };
  return <Card title={id === 'neu' ? 'Neue Kooperation' : 'Kooperation bearbeiten'} actions={<button className="button small" onClick={close}>Schließen</button>}><form onSubmit={e => { e.preventDefault(); void submit(); }}>
    <div className="form-grid">{[['partner','Partner'],['titel','Titel'],['marke','Marke'],['ansprechpartner','Ansprechperson'],['email','E-Mail'],['zustaendig','Zuständig']].map(([key, label]) => <Field key={key} label={label}><input required={key === 'partner'} type={key === 'email' ? 'email' : 'text'} value={String(form[key] ?? '')} onChange={e => set(key,e.target.value)} /></Field>)}
    <Field label="Kanäle"><div>{KANAELE.map(k => <label key={k}><input type="checkbox" checked={(form.kanaele as string[]).includes(k)} onChange={e => set('kanaele', e.target.checked ? [...form.kanaele as string[], k] : (form.kanaele as string[]).filter(x => x !== k))} /> {k} </label>)}</div></Field>
    {sicht.betraege && <><Field label="Betrag"><input type="number" min="0" step="0.01" value={String(form.betrag ?? '')} onChange={e => set('betrag',e.target.value)} /></Field><Field label="Währung"><select value={String(form.waehrung)} onChange={e => set('waehrung',e.target.value)}><option>EUR</option><option>JPY</option></select></Field></>}
    {pipeline && <Field label="Stand"><select value={String(form.stand)} onChange={e => set('stand',e.target.value)}>{[...PHASEN,'abgeschlossen','abgesagt'].map(p => <option key={p} value={p}>{LABEL[p]}</option>)}</select></Field>}
    <Field label="Zahlung"><select value={String(form.zahlung)} onChange={e => set('zahlung',e.target.value)}>{['offen','rechnung_gestellt','bezahlt'].map(p => <option key={p} value={p}>{LABEL[p]}</option>)}</select></Field>
    {[['zeitraum_von','Kampagne von'],['zeitraum_bis','Kampagne bis'],['faellig_am','Zahlung fällig'],['wiedervorlage','Wiedervorlage']].map(([key,label]) => <Field key={key} label={label}><input type="date" value={String(form[key] ?? '')} onChange={e => set(key,e.target.value)} /></Field>)}
    {[['leistung','Leistung'],['briefing','Briefing'],['notiz','Notiz'],['wiedervorlage_notiz','Wiedervorlage-Notiz']].map(([key,label]) => <Field key={key} label={label}><textarea value={String(form[key] ?? '')} onChange={e => set(key,e.target.value)} /></Field>)}
    <Field label="Drive-Ordner"><input type="url" value={String(form.drive_ordner ?? '')} onChange={e => set('drive_ordner',e.target.value)} /></Field>
    <label><input type="checkbox" checked={form.ueber_agentur === true} onChange={e => set('ueber_agentur',e.target.checked)} /> Über Deal-Agentur</label><label><input type="checkbox" checked={form.werbung === true} onChange={e => set('werbung',e.target.checked)} /> Werbekennzeichnung erforderlich</label></div>
    <FormError error={fehler} /><button className="button primary" disabled={busy}>{busy ? 'Speichert …' : 'Speichern'}</button>
  </form>{id !== 'neu' && <><FreigabeKnopf objektTyp="kooperation" objektId={id} titel={String(form.titel || form.partner)} bereich="kooperationen" link={`/kooperationen?id=${id}`} /><button className="button small" disabled={busy} onClick={async () => { setBusy(true); try { await api.post('/c/kooperationen/archivieren',{id,archiviert:!start?.archiviert});done();close(); } catch(e){setFehler(e);} finally{setBusy(false);} }}>{start?.archiviert ? 'Wiederherstellen' : 'Archivieren'}</button></>}</Card>;
}
