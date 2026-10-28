import type { Db } from '../../../../../src/data/postgres/postgresStore';
import { datumText, median, rate, text, zahl } from './gemeinsam';

export type Zeile = Record<string, unknown>;
export interface Video {
  id: string; konto_id: string; plattform: string; extern_id: string; titel: string; url: string;
  beschreibung: string; veroeffentlicht_am: string; dauer_s: number | null; vorschaubild: string;
  typ: string; beispiel: boolean; thema: string; format: string; hook: string; bestaetigt: boolean;
  quelle: string; aufrufe: number | null; likes: number | null; kommentare: number | null;
  shares: number | null; saves: number | null; reichweite: number | null; wiedergabezeit_s: number | null;
  durchschnitt_s: number | null; komplett_rate: number | null; interaktionsrate: number | null; stand: string;
}
export const wertFelder = ['aufrufe','likes','kommentare','shares','saves','reichweite','wiedergabezeit_s','durchschnitt_s','abos_neu','komplett_rate','follower_neu'] as const;
export function videoAus(r: Zeile): Video {
  const basis = { id:text(r.id),konto_id:text(r.konto_id),plattform:text(r.plattform),extern_id:text(r.extern_id),titel:text(r.titel),url:text(r.url),beschreibung:text(r.beschreibung),veroeffentlicht_am:r.veroeffentlicht_am ? new Date(String(r.veroeffentlicht_am)).toISOString() : '',dauer_s:zahl(r.dauer_s),vorschaubild:text(r.vorschaubild),typ:text(r.typ),beispiel:!!r.beispiel,thema:text(r.thema),format:text(r.format),hook:text(r.hook),bestaetigt:!!r.bestaetigt,quelle:text(r.merkmal_quelle),aufrufe:zahl(r.aufrufe),likes:zahl(r.likes),kommentare:zahl(r.kommentare),shares:zahl(r.shares),saves:zahl(r.saves),reichweite:zahl(r.reichweite),wiedergabezeit_s:zahl(r.wiedergabezeit_s),durchschnitt_s:zahl(r.durchschnitt_s),komplett_rate:zahl(r.komplett_rate),stand:datumText(r.stand) };
  return {...basis, interaktionsrate:rate(basis)};
}
export async function videosLesen(db: Db): Promise<Video[]> {
  const {rows}=await db.query<Zeile>(`SELECT v.*,m.thema,m.format,m.hook,m.bestaetigt,m.quelle AS merkmal_quelle,
    ${wertFelder.map(f=>`coalesce(st.${f},api.${f}) AS ${f}`).join(',')}, greatest(st.datum,api.datum) AS stand
    FROM videos v LEFT JOIN video_merkmale m ON m.video_id=v.id
    LEFT JOIN LATERAL (SELECT * FROM video_werte w WHERE w.video_id=v.id AND w.quelle='api' ORDER BY datum DESC LIMIT 1) api ON true
    LEFT JOIN LATERAL (SELECT * FROM video_werte w WHERE w.video_id=v.id AND w.quelle='studio' AND (api.datum IS NULL OR w.datum>=api.datum) ORDER BY datum DESC LIMIT 1) st ON true
    ORDER BY v.veroeffentlicht_am DESC NULLS LAST, v.id`);
  return rows.map(videoAus);
}
export function merkmalVergleich(videos: Video[]) {
  return (['thema','format','hook'] as const).flatMap(art=>[...new Set(videos.map(v=>v[art]).filter(Boolean))].map(wert=>{
    const teil=videos.filter(v=>v[art]===wert);
    return {art,wert,anzahl:teil.length,bestaetigt:teil.filter(v=>v.bestaetigt).length,median_aufrufe:median(teil.flatMap(v=>v.aufrufe===null?[]:[v.aufrufe])),interaktionsrate:median(teil.flatMap(v=>v.interaktionsrate===null?[]:[v.interaktionsrate]))};
  }));
}
export async function kontenLesen(db: Db) {
  const {rows}=await db.query<Zeile>(`SELECT k.id,k.plattform,k.handle,k.name,k.url,k.status,k.beispiel,k.letzte_abholung,k.fehler,k.token_bis,k.abruf_stand,w.datum,w.follower,w.aufrufe,w.reichweite FROM kanal_konten k LEFT JOIN LATERAL (SELECT * FROM kanal_werte WHERE konto_id=k.id ORDER BY datum DESC LIMIT 1) w ON true ORDER BY k.plattform,k.id`);
  return rows.map(r=>({...r,datum:datumText(r.datum),follower:zahl(r.follower),aufrufe:zahl(r.aufrufe),reichweite:zahl(r.reichweite)}));
}
export async function listenLesen(db: Db) {
  return (await db.query<{art:string;wert:string;sortierung:number}>('SELECT * FROM merkmal_listen ORDER BY art,sortierung,wert')).rows;
}
export function gueltigerTag(w: unknown): w is string {
  return typeof w==='string' && /^\d{4}-\d{2}-\d{2}$/.test(w) && Number.isFinite(Date.parse(w)) && new Date(w).toISOString().slice(0,10)===w;
}
export function kurz(w: unknown, max=200): string {return typeof w==='string'?w.trim().slice(0,max):'';}
export function muss(w: unknown, name: string, max=200): string {const v=kurz(w,max);if(!v)throw Object.assign(new Error(`${name} fehlt.`),{status:400});return v;}
export function problem(meldung:string,status=400):never{throw Object.assign(new Error(meldung),{status});}
