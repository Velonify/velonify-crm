import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ErrorBox, Field, FormError, Loading, PageHeader } from '../../components/ui';
import { useBaustein, useCreatorApi } from '../api';
import type { BausteinId } from '../../data/instanz';
import type { ContentDaten } from './typen';
import './content.css';

export function useLaden<T>(pfad:string|null){
 const api=useCreatorApi();const [daten,setDaten]=useState<T|null>(null);const [fehler,setFehler]=useState<unknown>();const [laedt,setLaedt]=useState(false);
 const laden=useCallback(async()=>{if(!pfad)return;setLaedt(true);try{setDaten(await api.get<T>(pfad));setFehler(undefined);}catch(e){setFehler(e);}finally{setLaedt(false);}},[api,pfad]);
 useEffect(()=>{setDaten(null);void laden();},[laden]);return {daten,fehler,laedt,laden,setDaten};
}
export function useAktion(){const [fehler,setFehler]=useState<unknown>();const [busy,setBusy]=useState(false);const [meldung,setMeldung]=useState('');const run=async(fn:()=>Promise<void>,nachricht='Gespeichert')=>{setFehler(undefined);setMeldung('');setBusy(true);try{await fn();setMeldung(nachricht);}catch(e){setFehler(e);}finally{setBusy(false);}};return {busy,run,feedback:<><FormError error={fehler}/>{meldung&&<p className="content-feedback" role="status">{meldung}</p>}</>};}
export function Bereich({id,titel,children}:{id:BausteinId;titel:string;children:ReactNode}){const an=useBaustein(id);if(!an)return <div className="page"><PageHeader title={titel}/><p>Dieser Baustein ist für euren Hub noch nicht eingeschaltet.</p></div>;return <>{children}</>;}
export function Arbeitsbereich({titel,children}:{titel:string;children:(id:string,daten:ContentDaten)=>ReactNode}){
 const [params,setParams]=useSearchParams();const r=useLaden<ContentDaten>('/c/content/auswahl');const id=params.get('inhalt')||r.daten?.inhalte[0]?.id||'';
 return <div className="page"><PageHeader title={titel}/>{r.fehler?<ErrorBox error={r.fehler} onRetry={()=>void r.laden()}/>:null}{!r.daten&&!r.fehler?<Loading/>:null}{r.daten&&<><Field label="Inhalt auswählen"><select value={id} onChange={e=>setParams({inhalt:e.target.value})}><option value="">Bitte wählen</option>{r.daten.inhalte.map(i=><option key={i.id} value={i.id}>{i.titel}</option>)}</select></Field>{id?children(id,r.daten):<p className="muted">Lege zuerst einen Inhalt im Content-Plan an.</p>}</>}</div>;
}
export const isoTag=(d:Date)=>d.toISOString().slice(0,10);
export const heute=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export const datumLabel=(s:string)=>s?new Date(`${s.slice(0,10)}T12:00:00Z`).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}):'Noch kein Datum';
export const safeLink=(s:string)=>/^https?:\/\//i.test(s)?s:undefined;
