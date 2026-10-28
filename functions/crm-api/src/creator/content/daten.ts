import { darfEinrichten, listeAus } from '../../../../../src/data/instanz';
import type { Db } from '../../../../../src/data/postgres/postgresStore';
import type { Inhalt, Ton, UploadDaten } from '../../../../../src/creator/content/typen';
import { KANAELE, istKanal, istStatus, STATUS, standardKennzeichnung, fertigeTexte, pruefeUpload, type Kanal, type UploadTexte } from '../../../../../src/creator/content/regeln';
import { freigabeVon } from '../freigaben';
import { istObjekt, neueId, type CreatorKontext } from '../modul';

export class ContentFehler extends Error { constructor(message:string, readonly status=400) { super(message); } }
export const text = (v:unknown) => v == null ? '' : String(v);
export function feld(v:unknown, label:string, max=4000, pflicht=false):string {
  if (v != null && typeof v !== 'string') throw new ContentFehler(`${label} muss Text sein.`);
  const s = (v as string | undefined)?.trim() ?? '';
  if ((pflicht && !s) || s.length>max) throw new ContentFehler(`${label}: ${pflicht?'Bitte ausfüllen; ':''}höchstens ${max} Zeichen.`);
  return s;
}
export function objekt(v:unknown):Record<string,unknown> { if (!istObjekt(v)) throw new ContentFehler('Ungültige Eingabe.'); return v; }
export function datum(v:unknown):string|null {
  const s=feld(v,'Datum',10); if(!s) return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s) throw new ContentFehler('Bitte ein gültiges Datum wählen.');
  return s;
}
export function url(v:unknown):string { const s=feld(v,'Link',2000); if(!s)return ''; try{const u=new URL(s);if(u.protocol==='https:'||u.protocol==='http:')return u.href;}catch{/* Invalid user input. */}throw new ContentFehler('Bitte einen vollständigen http(s)-Link eingeben.'); }
export const kanalAn = (ctx: Pick<CreatorKontext,'sicht'>, k:unknown):k is Kanal => istKanal(k) && (k!=='twitch'||ctx.sicht.bausteine.includes('twitch'));
export const kanale = (ctx:Pick<CreatorKontext,'sicht'>) => KANAELE.filter(k=>kanalAn(ctx,k.id)).map(k=>k.id);
export function zuInhalt(r:Record<string,unknown>):Inhalt { return {...r,id:text(r.id),titel:text(r.titel),kanal:r.kanal as Kanal,format:text(r.format),status:r.status as Inhalt['status'],geplant_am:r.geplant_am?text(r.geplant_am).slice(0,10):'',zustaendig:text(r.zustaendig),kooperation_id:text(r.kooperation_id),video_id:text(r.video_id),quelle:text(r.quelle),quelle_id:text(r.quelle_id),notiz:text(r.notiz),archiviert:!!r.archiviert,geaendert_am:r.geaendert_am?new Date(r.geaendert_am as string).toISOString():''}; }
export async function inhalt(db:Db,id:string,sperren=false):Promise<Inhalt> { const {rows}=await db.query<Record<string,unknown>>(`SELECT *, geplant_am::text AS geplant_am FROM inhalte WHERE id=$1 ${sperren?'FOR UPDATE':''}`,[id]); if(!rows[0])throw new ContentFehler('Inhalt nicht gefunden.',404);return zuInhalt(rows[0]); }
export async function ton(db:Db):Promise<Ton> { const {rows}=await db.query<Ton>(`SELECT coalesce(beschreibung,'') AS beschreibung,coalesce(beispiele,'') AS beispiele,coalesce(no_gos,'') AS no_gos FROM content_ton WHERE id='standard'`);return rows[0]??{beschreibung:'',beispiele:'',no_gos:''}; }
export async function einstellungen(db:Db):Promise<Record<string,string>> { const {rows}=await db.query<{schluessel:string;wert:string}>('SELECT schluessel,wert FROM content_einstellungen');return Object.fromEntries(rows.map(r=>[r.schluessel,r.wert??''])); }
export async function speichern(body:Record<string,unknown>,ctx:CreatorKontext) {
 return ctx.pool.transaktion(async db=>{
  const alt=body.id?await inhalt(db,feld(body.id,'Inhalt',80,true),true):null;
  const b={...alt,...body}; const titel=feld(b.titel,'Titel',200,true);
  if(!kanalAn(ctx,b.kanal))throw new ContentFehler('Dieser Kanal ist nicht freigeschaltet.');
  if(!istStatus(b.status??'idee'))throw new ContentFehler('Unbekannter Status.');
  const status=text(b.status||'idee');
  if(alt && body.geaendert_am!==undefined && body.geaendert_am!==alt.geaendert_am)throw new ContentFehler('Der Inhalt wurde inzwischen geändert. Bitte neu laden.',409);
  const geplant=datum(b.geplant_am); const koop=feld(b.kooperation_id,'Kooperation',80);const vid=feld(b.video_id,'Video',80);
  if(koop && koop!==alt?.kooperation_id && !ctx.sicht.werkzeuge.includes('kooperationen'))throw new ContentFehler('Kooperationen sind für dich nicht freigeschaltet.',403);
  if(koop){const {rows}=await db.query('SELECT id FROM kooperationen WHERE id=$1 AND NOT archiviert',[koop]);if(!rows.length)throw new ContentFehler('Kooperation nicht gefunden.');}
  if(vid){const {rows}=await db.query<{plattform:string;beispiel:boolean;inhalt_id:string}>('SELECT plattform,beispiel,inhalt_id FROM videos WHERE id=$1 FOR UPDATE',[vid]);const v=rows[0];if(!v||v.plattform!==b.kanal||v.beispiel)throw new ContentFehler('Bitte ein echtes Video desselben Kanals wählen.');if(v.inhalt_id&&v.inhalt_id!==alt?.id)throw new ContentFehler('Das Video ist bereits einem anderen Inhalt zugeordnet.',409);}
  if(status==='live'&&!vid)throw new ContentFehler('Für „Live“ bitte das veröffentlichte Video verknüpfen.');
  if(alt&&STATUS.findIndex(s=>s.id===status)>=2&&ctx.sicht.bausteine.includes('freigaben')&&ctx.sicht.bausteine.includes('skripte')){
   const {rows}=await db.query<{id:string}>('SELECT id FROM content_skripte WHERE inhalt_id=$1 ORDER BY version DESC LIMIT 1',[alt.id]);
   if(rows[0]&&(await freigabeVon(db,'skript',rows[0].id))?.status!=='freigegeben')throw new ContentFehler('Die aktuelle Skriptfassung braucht vor dem Dreh eine Freigabe.',409);
  }
  const id=alt?.id??neueId('I'); const archiviert=b.archiviert===true;
  await db.query(`INSERT INTO inhalte(id,titel,kanal,format,status,geplant_am,zustaendig,kooperation_id,video_id,notiz,archiviert,erstellt_von,geaendert_von,geaendert_am)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13)
   ON CONFLICT(id) DO UPDATE SET titel=$2,kanal=$3,format=$4,status=$5,geplant_am=$6,zustaendig=$7,kooperation_id=$8,video_id=$9,notiz=$10,archiviert=$11,geaendert_von=$12,geaendert_am=$13`,
   [id,titel,b.kanal,feld(b.format,'Format',100),status,geplant,feld(b.zustaendig,'Zuständigkeit',100),koop||null,vid||null,feld(b.notiz,'Notiz',12000),archiviert,ctx.email,ctx.jetzt().toISOString()]);
  if(alt?.video_id&&alt.video_id!==vid)await db.query('UPDATE videos SET inhalt_id=NULL WHERE id=$1 AND inhalt_id=$2',[alt.video_id,id]);
  if(vid)await db.query('UPDATE videos SET inhalt_id=$1 WHERE id=$2',[id,vid]);
  if(geplant)await db.query(`INSERT INTO fristen(id,titel,datum,art,quelle,bezug_id,link,zustaendig,erledigt,archiviert,erstellt_von) VALUES($1,$2,$3,'upload','inhalt',$4,$5,$6,$7,$8,$9)
   ON CONFLICT(quelle,bezug_id) WHERE bezug_id IS NOT NULL DO UPDATE SET titel=EXCLUDED.titel,datum=EXCLUDED.datum,zustaendig=EXCLUDED.zustaendig,erledigt=EXCLUDED.erledigt,archiviert=EXCLUDED.archiviert,geaendert_am=now(),geaendert_von=$9`,
   [neueId('FR'),titel,geplant,id,`/content/inhalte/${id}`,feld(b.zustaendig,'Zuständigkeit',100),status==='live',archiviert,ctx.email]);
  else await db.query(`DELETE FROM fristen WHERE quelle='inhalt' AND bezug_id=$1`,[id]);
  return inhalt(db,id);
 });
}
export async function erlaubteBoards(ctx:CreatorKontext) {
 if(!ctx.sicht.werkzeuge.includes('todo')||!ctx.sicht.bausteine.includes('boards'))return [];
 const {rows}=await ctx.pool.query<{id:string;titel:string;spalten:string}>('SELECT id,titel,spalten FROM boards WHERE NOT archiviert ORDER BY titel');
 if(ctx.rolle!=='partner')return rows;
 const {rows:z}=await ctx.pool.query<{boards:string}>('SELECT boards FROM instanz_zugaenge WHERE email=$1 AND aktiv',[ctx.email]);
 const ids=listeAus(z[0]?.boards);return rows.filter(r=>ids.includes(r.id));
}
export async function uploadDaten(ctx:CreatorKontext,id:string,plattform:Kanal):Promise<UploadDaten> {
 const i=await inhalt(ctx.pool,id); const e=await einstellungen(ctx.pool);
 const {rows}=await ctx.pool.query<UploadTexte>('SELECT * FROM content_uploads WHERE inhalt_id=$1 AND plattform=$2',[id,plattform]);
 const u=rows[0]??{titel:i.titel,caption:'',hashtags:'',beschreibung:'',suchbegriffe:'',kennzeichnung:'',abgehakt:{}};
 const {rows:koops}=i.kooperation_id?await ctx.pool.query<{marke:string;werbung:boolean}>('SELECT marke,werbung FROM kooperationen WHERE id=$1',[i.kooperation_id]):{rows:[]};
 const werbung=!!i.kooperation_id; // Every linked cooperation gets a visible label, including unclear flags.
 const kennzeichnung=werbung?standardKennzeichnung(koops[0]?.marke??''):'';
 const upload={titel:text(u.titel),caption:text(u.caption),hashtags:text(u.hashtags),beschreibung:text(u.beschreibung),suchbegriffe:text(u.suchbegriffe),kennzeichnung,abgehakt:u.abgehakt??{}};
 const umfeld={werbung,impressumUrl:e.impressum_url||`${ctx.umgebung.hubUrl.replace(/\/$/,'')}/#/oeffentlich/impressum`,impressumImProfil:e[`impressum_${plattform}`]==='ja'};
 return {upload,umfeld,fertig:fertigeTexte(plattform,upload,umfeld),pruefung:pruefeUpload(plattform,upload,umfeld)};
}
export function admin(ctx:CreatorKontext){if(!darfEinrichten(ctx.rolle))throw new ContentFehler('Diese Einstellung ändern Admins.',403);}
