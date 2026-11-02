import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, ErrorBox, Field, Loading, PageHeader } from '../../components/ui';
import { useBaustein, useCreatorApi, useInstanz } from '../api';
import { useAblageDrive } from '../ablage/drive';
import { STATUS, FORMATE, istKanal, kanalLabel, kanalVon, statusLabel, statusVon, type Kanal } from './regeln';
import { RechercheDokumente } from './Dokumente';
import type { ContentDaten, Inhalt } from './typen';
import { Bereich, datumLabel, heute, isoTag, useAktion, useLaden, safeLink } from './gemeinsam';

const leer=():Inhalt=>({id:'',titel:'',kanal:'',format:'',status:'idee',geplant_am:'',zustaendig:'',kooperation_id:'',video_id:'',quelle:'team',quelle_id:'',notiz:'',archiviert:false,geaendert_am:''});
type Ansicht='kalender'|'liste'|'board'|'recherche';
const ANSICHTEN:{id:Ansicht;label:string}[]=[{id:'kalender',label:'Kalender'},{id:'liste',label:'Liste'},{id:'board',label:'Board'},{id:'recherche',label:'Recherche'}];
export function ContentPlan(){return <Bereich id="contentplan" titel="Content-Plan"><Plan/></Bereich>;}
function Plan(){
 const r=useLaden<ContentDaten>('/c/content');const api=useCreatorApi();const ak=useAktion();const nav=useNavigate();
 const [ansicht,setAnsicht]=useState<Ansicht>('kalender');const [anker,setAnker]=useState(heute());const [neu,setNeu]=useState(false);
 const items=r.daten?.inhalte??[];
 // Board columns: the known status chain plus every free-text status in use.
 const spalten=[...STATUS.map(s=>({id:s.id as string,label:s.label})),...[...new Set(items.map(i=>i.status))].filter(x=>x&&!STATUS.some(s=>s.id===x)).map(x=>({id:x,label:x}))];
 const verschieben=(i:Inhalt,s:string)=>ak.run(async()=>{await api.post('/c/content/inhalte/speichern',{...i,status:s});await r.laden();},'Status geändert');
 const d=new Date(`${anker}T12:00:00Z`);const start=new Date(d);start.setUTCDate(1);start.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7));
 const tage=Array.from({length:42},(_,n)=>{const x=new Date(start);x.setUTCDate(x.getUTCDate()+n);return isoTag(x);});
 const periode=(richtung:number)=>{const n=new Date(d);n.setUTCDate(1);n.setUTCMonth(n.getUTCMonth()+richtung);setAnker(isoTag(n));};
 return <div className="page"><PageHeader title="Content-Plan" subtitle="Von der Idee bis zum veröffentlichten Video." actions={ansicht!=='recherche'&&<button className="button primary" onClick={()=>setNeu(!neu)}>{neu?'Schließen':'Inhalt planen'}</button>}/>
 {r.fehler?<ErrorBox error={r.fehler} onRetry={()=>void r.laden()}/>:null}{!r.daten&&!r.fehler?<Loading/>:null}
 {r.daten&&<>{neu&&ansicht!=='recherche'&&<Card title="Neuer Inhalt"><InhaltForm wert={leer()} daten={r.daten} speichern={async i=>{const res=await api.post<{inhalt:Inhalt}>('/c/content/inhalte/speichern',i);nav(`/content/inhalte/${res.inhalt.id}`);}}/></Card>}
 <div className="content-view-switch" aria-label="Ansicht">{ANSICHTEN.map(a=><button key={a.id} className={`button small${ansicht===a.id?' primary':''}`} aria-pressed={ansicht===a.id} onClick={()=>setAnsicht(a.id)}>{a.label}</button>)}</div>{ak.feedback}
 {ansicht!=='recherche'&&items.length===0&&<p className="muted">Es sind noch keine Inhalte geplant.</p>}
 {ansicht==='liste'&&items.length>0&&<div className="table-wrap"><table className="table compact"><thead><tr><th>Inhalt</th><th>Kanal</th><th>Status</th><th>Upload</th><th>Zuständig</th></tr></thead><tbody>{items.map(i=><tr key={i.id}><td><Link to={`/content/inhalte/${i.id}`}>{i.titel}</Link></td><td>{kanalLabel(i.kanal)}</td><td>{statusLabel(i.status)}</td><td>{datumLabel(i.geplant_am)}</td><td>{i.zustaendig||'Offen'}</td></tr>)}</tbody></table></div>}
 {ansicht==='board'&&<div className="content-board">{spalten.map(s=><section key={s.id} className="content-board-column" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const i=items.find(x=>x.id===e.dataTransfer.getData('text/plain'));if(i&&!ak.busy)void verschieben(i,s.id);}}><h2>{s.label} <span className="muted">{items.filter(i=>i.status===s.id).length}</span></h2>{items.filter(i=>i.status===s.id).map(i=><article key={i.id} className="content-board-item" draggable={!ak.busy} onDragStart={e=>e.dataTransfer.setData('text/plain',i.id)}><Link to={`/content/inhalte/${i.id}`}>{i.titel}</Link><p className="small muted">{kanalLabel(i.kanal)} · {datumLabel(i.geplant_am)}</p><select aria-label={`Status von ${i.titel}`} disabled={ak.busy} value={i.status} onChange={e=>void verschieben(i,e.target.value)}>{spalten.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></article>)}</section>)}</div>}
 {ansicht==='kalender'&&<><div className="filters"><button className="button small" onClick={()=>periode(-1)}>Zurück</button><strong>{d.toLocaleDateString('de-DE',{month:'long',year:'numeric',timeZone:'UTC'})}</strong><button className="button small" onClick={()=>periode(1)}>Weiter</button><button className="button small" onClick={()=>setAnker(heute())}>Heute</button></div><div className="table-wrap"><div className="content-calendar">{tage.map(tag=><div key={tag} className={`content-calendar-day${tag.slice(0,7)!==anker.slice(0,7)?' is-muted':''}`}><time dateTime={tag}>{new Date(`${tag}T12:00:00Z`).toLocaleDateString('de-DE',{weekday:'short',day:'numeric',timeZone:'UTC'})}</time>{items.filter(i=>i.geplant_am===tag).map(i=><Link className="content-calendar-item" key={i.id} to={`/content/inhalte/${i.id}`}><strong>{i.titel}</strong><small className="muted"> · {kanalLabel(i.kanal)} · {statusLabel(i.status)}</small></Link>)}</div>)}</div></div>{items.some(i=>!i.geplant_am)&&<p>{items.filter(i=>!i.geplant_am).length} Inhalte haben noch kein Upload-Datum. Du findest sie in Liste und Board.</p>}</>}
 {ansicht==='recherche'&&<RechercheDokumente/>}
 </>}</div>;
}
function InhaltForm({wert,daten,speichern}:{wert:Inhalt;daten:ContentDaten;speichern:(i:Inhalt)=>Promise<void>}){
 const [i,setI]=useState(wert);const ak=useAktion();const instanz=useInstanz();const koops=useLaden<{kooperationen:{id:string;titel:string;marke:string;werbung:boolean}[]}>(instanz.werkzeuge.includes('kooperationen')?'/c/kooperationen/auswahl':null);
 const koopName=(k:{titel:string;marke:string})=>k.titel||k.marke;
 const [koopText,setKoopText]=useState('');const koopListe=koops.daten?.kooperationen??[];
 const koopAnzeige=koopText||(koopListe.find(k=>k.id===i.kooperation_id)?.titel??koopListe.find(k=>k.id===i.kooperation_id)?.marke??'');
 const koopTreffer=(t:string)=>koopListe.find(k=>koopName(k).toLowerCase()===t.trim().toLowerCase());
 const set=(k:keyof Inhalt,v:string)=>setI(x=>({...x,[k]:v}));
 const submit=(e:FormEvent)=>{e.preventDefault();const t=koopText.trim();const koop=koopText?(t?koopTreffer(t)?.id??'':''):i.kooperation_id;void ak.run(()=>speichern({...i,kanal:kanalVon(i.kanal),status:statusVon(i.status),kooperation_id:koop}));};
 const formate=istKanal(kanalVon(i.kanal))?FORMATE[kanalVon(i.kanal) as Kanal]:[];
 return <form onSubmit={submit}><div className="content-form-grid">
  <Field label="Titel" wide><input required maxLength={200} value={i.titel} onChange={e=>set('titel',e.target.value)}/></Field>
  <Field label="Kanal"><input required maxLength={60} list="content-kanaele" value={kanalLabel(i.kanal)} onChange={e=>set('kanal',e.target.value)}/><datalist id="content-kanaele">{daten.kanaele.map(k=><option key={k} value={kanalLabel(k)}/>)}</datalist></Field>
  <Field label="Format"><input list="content-formate" maxLength={100} value={i.format} onChange={e=>set('format',e.target.value)}/><datalist id="content-formate">{formate.map(f=><option key={f}>{f}</option>)}</datalist></Field>
  <Field label="Status"><input maxLength={60} list="content-status" value={statusLabel(i.status)} onChange={e=>set('status',e.target.value)}/><datalist id="content-status">{STATUS.map(s=><option key={s.id} value={s.label}/>)}</datalist></Field>
  <Field label="Upload-Datum"><input type="date" value={i.geplant_am} onChange={e=>set('geplant_am',e.target.value)}/></Field>
  <Field label="Zuständig"><input maxLength={100} list="content-team" placeholder="Noch offen" value={i.zustaendig} onChange={e=>set('zustaendig',e.target.value)}/><datalist id="content-team">{daten.team.map(t=><option key={t} value={t}/>)}</datalist></Field>
  {instanz.werkzeuge.includes('kooperationen')&&<Field label="Kooperation" hint={koopText.trim()&&!koopTreffer(koopText)?'Keine passende Kooperation. Lege sie unter Budget → Kooperationen an.':undefined}><input maxLength={200} list="content-koops" placeholder="Keine Kooperation" value={koopAnzeige} onChange={e=>setKoopText(e.target.value||' ')}/><datalist id="content-koops">{koopListe.map(k=><option key={k.id} value={koopName(k)}/>)}</datalist></Field>}
  <Field label="Notiz" wide><textarea rows={5} maxLength={12000} value={i.notiz} onChange={e=>set('notiz',e.target.value)}/></Field>
 </div>{koops.fehler?<ErrorBox error={koops.fehler} onRetry={()=>void koops.laden()}/>:null}{ak.feedback}<button className="button primary" disabled={ak.busy}>{ak.busy?'Speichert …':'Inhalt speichern'}</button></form>;
}
export function InhaltDetail(){return <Bereich id="contentplan" titel="Inhalt"><Detail/></Bereich>;}
function Detail(){
 const {id}=useParams();const api=useCreatorApi();const nav=useNavigate();const r=useLaden<{inhalt:Inhalt}>(id?`/c/content/inhalte/${encodeURIComponent(id)}`:null);const data=useLaden<ContentDaten>('/c/content');const instanz=useInstanz();const ak=useAktion();const drive=useAblageDrive();const ablage=useBaustein('ablage');const [ordner,setOrdner]=useState('');
 const i=r.daten?.inhalt;
 return <div className="page"><PageHeader title={i?.titel||'Inhalt'} actions={<Link className="button" to="/content">Zum Content-Plan</Link>}/>{r.fehler?<ErrorBox error={r.fehler} onRetry={()=>void r.laden()}/>:null}{data.fehler?<ErrorBox error={data.fehler} onRetry={()=>void data.laden()}/>:null}{(!i||!data.daten)&&!r.fehler&&!data.fehler?<Loading/>:null}{i&&data.daten&&<><p className="muted small">Quelle: {i.quelle==='bericht'?'Analytics-Bericht':i.quelle==='assistent'?'Recherche-Assistent':'Team'}</p><Card title="Planung"><InhaltForm key={`${i.id}:${i.geaendert_am}`} wert={i} daten={data.daten} speichern={async v=>{await api.post('/c/content/inhalte/speichern',v);await r.laden();}}/></Card><nav className="content-detail-actions" aria-label="Inhalt weiterbearbeiten">{([{id:'skripte',label:'Skript, Titel und Hooks'},{id:'thumbnails',label:'Thumbnail-Briefing'},{id:'upload',label:'Upload vorbereiten'}] as const).filter(x=>instanz.bausteine.includes(x.id)).map(x=><Link className="button" key={x.id} to={`/content/${x.id}?inhalt=${i.id}`}>{x.label}</Link>)}</nav>{ablage&&instanz.werkzeuge.includes('ablage')&&<Card title="Rohmaterial in Google Drive"><button className="button" disabled={ak.busy} onClick={()=>void ak.run(async()=>{const o=await drive.ordnerFuer('content/rohmaterial',`${i.id} ${i.titel}`);setOrdner(o.url);},'Drive-Ordner ist bereit')}>Drive-Ordner anlegen oder öffnen</button>{ordner&&<p><a href={safeLink(ordner)} target="_blank" rel="noreferrer">Ordner in Google Drive öffnen</a></p>}</Card>}{ak.feedback}<button className="button small" disabled={ak.busy} onClick={()=>void ak.run(async()=>{await api.post('/c/content/inhalte/speichern',{...i,archiviert:true});nav('/content');},'Inhalt archiviert')}>Inhalt archivieren</button></>}</div>;
}
