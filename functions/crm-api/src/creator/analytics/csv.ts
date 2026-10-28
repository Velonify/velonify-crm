import { createHash } from 'node:crypto';
import type { DbPool } from '../../../../../src/data/postgres/postgresStore';
import { neueId } from '../modul';
import { gueltigerTag, problem, kurz, type Zeile } from './daten';

export function csvLesen(csv:string):{spalten:string[];zeilen:string[][]}{
  if(csv.length>5_000_000)problem('Die CSV-Datei darf höchstens 5 MB groß sein.');
  const roh=csv.replace(/^\uFEFF/,'');const first=roh.split(/\r?\n/)[0];
  const sep=[';',',','\t'].sort((a,b)=>(first.split(b).length-first.split(a).length))[0];
  const rows:string[][]=[];let row:string[]=[];let field='';let quote=false;
  for(let i=0;i<roh.length;i++){const c=roh[i];if(c==='"'){if(quote&&roh[i+1]==='"'){field+='"';i++;}else if(quote||field==='')quote=!quote;else field+=c;}
    else if(c===sep&&!quote){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&roh[i+1]==='\n')i++;row.push(field);field='';if(row.some(x=>x.trim()))rows.push(row);row=[];}
    else field+=c;
  }
  if(quote)problem('Die CSV-Datei enthält ein nicht geschlossenes Anführungszeichen.');
  row.push(field);if(row.some(x=>x.trim()))rows.push(row);
  if(rows.length<2)problem('Die CSV-Datei braucht eine Kopfzeile und mindestens eine Datenzeile.');
  if(rows.length>5001)problem('Bitte höchstens 5.000 Zeilen auf einmal importieren.');
  const spalten=rows.shift()!.map(s=>s.trim());if(new Set(spalten).size!==spalten.length)problem('Spaltennamen müssen eindeutig sein.');
  if(rows.some(r=>r.length!==spalten.length))problem('Die Anzahl der Spalten stimmt nicht in jeder Zeile überein.');
  return {spalten,zeilen:rows};
}
const norm=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const ALIASE:Record<string,string[]>={video_id:['videoid','postid','id','video','videolink','videourl','postlink'],datum:['datum','date','stichtag'],aufrufe:['aufrufe','views','videoviews','totalviews'],likes:['likes','gefalltmir'],kommentare:['kommentare','comments'],shares:['shares','geteilt'],wiedergabezeit_s:['wiedergabezeits','totalplaytime','totalwatchtime','gesamtewiedergabezeit'],durchschnitt_s:['durchschnitts','averagewatchtime','averageviewduration','durchschnittlichewiedergabezeit'],komplett_rate:['komplettrate','watchedfullvideo','fullvideowatchedrate'],follower_neu:['followerneu','newfollowers']};
export const STUDIO_FELDER=Object.keys(ALIASE);
export function zuordnung(spalten:string[],mapping:unknown,felder=STUDIO_FELDER){
  const input=typeof mapping==='object'&&mapping!==null?mapping as Zeile:{};const out:Record<string,string>={};
  for(const f of felder){if(typeof input[f]==='string'&&spalten.includes(input[f] as string))out[f]=input[f] as string;
    else if(!(f in input)){const gefunden=spalten.find(s=>(ALIASE[f]??[norm(f)]).includes(norm(s)));if(gefunden)out[f]=gefunden;}}
  return out;
}
function dezimal(w:string,bruch=false){const s=w.trim().replace(/\s/g,'');if(!s)return null;
  let n:string=s.replace(/%$/,'');if(n.includes(','))n=n.replace(/\./g,'').replace(',','.');else if(!bruch&&/^\d{1,3}(\.\d{3})+$/.test(n))n=n.replace(/\./g,'');
  const z=Number(n);if(!Number.isFinite(z)||z<0)throw new Error('Werte müssen positive Zahlen sein.');return s.endsWith('%')?z/100:z;
}
function dauer(w:string){if(!w.trim())return null;const c=w.trim().split(':');if(c.length>1){if(c.length>3||c.some(s=>!/^\d+(?:[.,]\d+)?$/.test(s)))throw new Error('Ungültige Wiedergabedauer.');return c.reduce((a,v)=>a*60+Number(v.replace(',','.')),0);}return dezimal(w.replace(/\s*(s|sek|seconds?)$/i,''),true);}
interface StudioZeile{nr:number;video_id:string;extern_id:string;datum:string;werte:Record<string,number|null>;fehler:string[];}
export async function studioVorschau(pool:DbPool,body:Zeile){
  const csv=typeof body.csv==='string'?body.csv:'';const {spalten,zeilen}=csvLesen(csv);const map=zuordnung(spalten,body.zuordnung);
  if(!map.video_id)problem('Bitte die Spalte mit der Video-ID oder Video-URL zuordnen.');
  if(!map.datum&&!gueltigerTag(body.stichtag))problem('Bitte den Stichtag des Exports angeben.');
  const videos=(await pool.query<{id:string;extern_id:string}>('SELECT id,extern_id FROM videos WHERE plattform=\'tiktok\' AND NOT beispiel')).rows;
  const seen=new Set<string>();
  const result:StudioZeile[]=zeilen.map((row,i)=>{
    const get=(f:string)=>map[f]?row[spalten.indexOf(map[f])]??'':'';
    const raw=get('video_id').trim();const extern_id=/\/video\/(\d+)/.exec(raw)?.[1]??raw.replace(/^'/,'');const video=videos.find(v=>v.extern_id===extern_id||v.id===extern_id);
    const datum=get('datum')||String(body.stichtag??'');const fehler:string[]=[];if(!video)fehler.push('Kein echtes TikTok-Video mit dieser ID gefunden.');if(!gueltigerTag(datum))fehler.push('Datum muss JJJJ-MM-TT sein.');
    const werte:Record<string,number|null>={};
    for(const f of STUDIO_FELDER.filter(f=>f!=='video_id'&&f!=='datum')){try{werte[f]=f.endsWith('_s')?dauer(get(f)):dezimal(get(f),f==='komplett_rate');if(f==='komplett_rate'&&werte[f]!==null&&werte[f]!>1)throw new Error('Anteil muss zwischen 0 und 1 oder als Prozent angegeben sein.');if(!f.endsWith('_s')&&f!=='komplett_rate'&&werte[f]!==null&&!Number.isSafeInteger(werte[f]))throw new Error('Zählwerte müssen sichere ganze Zahlen sein.');}catch(e){fehler.push(`${f}: ${e instanceof Error?e.message:'Ungültiger Wert.'}`);}}
    if(!Object.values(werte).some(v=>v!==null))fehler.push('Keine Messwerte zugeordnet.');const key=`${video?.id}-${datum}`;if(seen.has(key))fehler.push('Video und Datum kommen mehrfach vor.');seen.add(key);
    return {nr:i+2,video_id:video?.id??'',extern_id,datum,werte,fehler};
  });return {spalten,zuordnung:map,zeilen:result,gueltig:result.every(r=>!r.fehler.length)};
}
export async function studioImport(pool:DbPool,body:Zeile,person:string){
  const preview=await studioVorschau(pool,body);if(!preview.gueltig)problem('Bitte erst alle Fehler in der Importvorschau korrigieren.');
  const fingerprint=createHash('sha256').update(JSON.stringify(preview.zeilen)).digest('hex');
  return pool.transaktion(async db=>{
    const existing=(await db.query<{id:string}>('SELECT id FROM studio_importe WHERE fingerprint=$1',[fingerprint])).rows[0];if(existing)return {id:existing.id,bereits_importiert:true,zeilen:preview.zeilen.length};
    const fields=STUDIO_FELDER.filter(f=>f!=='video_id'&&f!=='datum');
    for(const r of preview.zeilen)await db.query(`INSERT INTO video_werte(video_id,datum,quelle,${fields.join(',')}) VALUES($1,$2,'studio',${fields.map((_,i)=>`$${i+3}`).join(',')}) ON CONFLICT(video_id,datum,quelle) DO UPDATE SET ${fields.map(f=>`${f}=coalesce(excluded.${f},video_werte.${f})`).join(',')}`,[r.video_id,r.datum,...fields.map(f=>r.werte[f])]);
    const id=neueId('SI');await db.query('INSERT INTO studio_importe(id,datei,stichtag,zeilen,zugeordnet,zuordnung,von,fingerprint) VALUES($1,$2,$3,$4,$4,$5::jsonb,$6,$7)',[id,kurz(body.datei)||'Studio-Export',preview.zeilen[0].datum,preview.zeilen.length,JSON.stringify(preview.zuordnung),person,fingerprint]);return {id,zeilen:preview.zeilen.length};
  });
}
export const BENCHMARK_FELDER=['plattform','handle','name','datum','follower','beitraege','aufrufe_schnitt','interaktionen_schnitt'];
export function benchmarkVorschau(body:Zeile){
  const {spalten,zeilen}=csvLesen(typeof body.csv==='string'?body.csv:'');const map=zuordnung(spalten,body.zuordnung,BENCHMARK_FELDER);
  const seen=new Set<string>();const rows=zeilen.map((row,i)=>{const get=(f:string)=>map[f]?row[spalten.indexOf(map[f])]?.trim()??'':'';const fehler:string[]=[];const plattform=get('plattform').toLowerCase();const handle=get('handle');const datum=get('datum');
    if(!['instagram','tiktok','youtube','twitch'].includes(plattform))fehler.push('Unbekannte Plattform.');if(!/^[\w.@-]{1,100}$/.test(handle))fehler.push('Handle ohne URL angeben.');if(!gueltigerTag(datum))fehler.push('Datum muss JJJJ-MM-TT sein.');
    const werte:Record<string,number|null>={};for(const f of BENCHMARK_FELDER.slice(4)){try{werte[f]=dezimal(get(f),f==='interaktionen_schnitt');if(f!=='interaktionen_schnitt'&&werte[f]!==null&&!Number.isSafeInteger(werte[f]))throw new Error('Ganze Zahl erwartet.');}catch(e){fehler.push(`${f}: ${e instanceof Error?e.message:'Ungültig.'}`);}}
    if(Object.values(werte).every(v=>v===null))fehler.push('Mindestens einen Messwert angeben.');const key=`${plattform}:${handle.toLowerCase()}:${datum}`;if(seen.has(key))fehler.push('Kanal und Datum kommen mehrfach vor.');seen.add(key);
    return {nr:i+2,plattform,handle,name:get('name')||handle,datum,werte,fehler};
  });return {spalten,zuordnung:map,zeilen:rows,gueltig:rows.every(r=>!r.fehler.length)};
}
export async function benchmarkImport(pool:DbPool,body:Zeile,person:string){const p=benchmarkVorschau(body);if(!p.gueltig)problem('Bitte alle Fehler in der Vorschau korrigieren.');
  await pool.transaktion(async db=>{for(const r of p.zeilen){const {rows}=await db.query<{id:string}>(`INSERT INTO benchmark_kanaele(id,name,plattform,handle,erstellt_von) VALUES($1,$2,$3,$4,$5) ON CONFLICT(plattform,handle) DO UPDATE SET name=excluded.name RETURNING id`,[neueId('BK'),r.name,r.plattform,r.handle.toLowerCase(),person]);await db.query(`INSERT INTO benchmark_werte(kanal_id,datum,follower,beitraege,aufrufe_schnitt,interaktionen_schnitt,quelle,import_quelle,erfasst_von) VALUES($1,$2,$3,$4,$5,$6,'manuell','csv',$7) ON CONFLICT(kanal_id,datum) DO UPDATE SET follower=excluded.follower,beitraege=excluded.beitraege,aufrufe_schnitt=excluded.aufrufe_schnitt,interaktionen_schnitt=excluded.interaktionen_schnitt,quelle='manuell',import_quelle='csv',erfasst_von=excluded.erfasst_von`,[rows[0].id,r.datum,r.werte.follower,r.werte.beitraege,r.werte.aufrufe_schnitt,r.werte.interaktionen_schnitt,person]);}});return {zeilen:p.zeilen.length};}
