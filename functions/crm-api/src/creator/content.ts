import type { Antwort } from '../routen';
import type { BausteinId } from '../../../../src/data/instanz';
import { PLATTFORM_REGELN, begriffe, suchbegriffeVon, istKennzeichnung, type Kanal } from '../../../../src/creator/content/regeln';
import { baustein, fehler, istObjekt, neueId, ok, type CreatorKontext, type Modul } from './modul';
import { frageJson } from './ki';
import { ContentFehler, admin, datum, einstellungen, erlaubteBoards, feld, inhalt, kanalAn, kanale, objekt, speichern, text, ton, uploadDaten, url, zuInhalt } from './content/daten';
import { KI_SYSTEM, recherchiere, rechercheTakt } from './content/recherche';

function block(pfad:string,ctx:CreatorKontext):BausteinId|null {
 if(pfad==='/c/content/auswahl')return ctx.sicht.bausteine.find(b=>['contentplan','skripte','thumbnails','upload'].includes(b))??'contentplan';
 if(pfad.startsWith('/c/content/recherche'))return 'recherche';
 if(pfad.startsWith('/c/content/skripte'))return 'skripte';
 if(pfad.startsWith('/c/content/thumbnails'))return 'thumbnails';
 if(pfad.startsWith('/c/content/upload')||pfad.startsWith('/c/content/captions')||pfad==='/c/content/einstellungen')return 'upload';
 if(pfad==='/c/content/ton')return ctx.sicht.bausteine.find(b=>['skripte','recherche','upload'].includes(b))??'skripte';
 return 'contentplan';
}
function liste(v:unknown,label:string,min=0,max=5):string[]{if(!Array.isArray(v)||v.length<min||v.length>max)throw new ContentFehler(`${label}: ${min} bis ${max} Einträge erwartet.`);return v.map(x=>feld(x,label,500,true));}
async function skriptSpeichern(b:Record<string,unknown>,ctx:CreatorKontext,quelle:string){
 const id=feld(b.inhalt_id,'Inhalt',80,true);const skript=feld(b.skript,'Skript',30000,true);const titel=liste(b.titel,'Titel',3,5);const hooks=liste(b.hooks,'Hooks',3,5);
 return ctx.pool.transaktion(async db=>{
  await inhalt(db,id,true);
  const {rows}=await db.query<{version:number}>('SELECT coalesce(max(version),0)+1 AS version FROM content_skripte WHERE inhalt_id=$1',[id]);
  const {rows:neu}=await db.query(`INSERT INTO content_skripte(id,inhalt_id,version,skript,titel,hooks,titel_wahl,hook_wahl,quelle,anweisung,erstellt_von) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[neueId('SK'),id,rows[0].version,skript,JSON.stringify(titel),JSON.stringify(hooks),feld(b.titel_wahl,'Gewählter Titel',500),feld(b.hook_wahl,'Gewählter Hook',500),quelle,feld(b.anweisung,'Anweisung',3000),ctx.email]);
  return neu[0];
 });
}
async function thumbnailSpeichern(b:Record<string,unknown>,ctx:CreatorKontext,quelle:string){
 const id=feld(b.inhalt_id,'Inhalt',80,true);await inhalt(ctx.pool,id);
 const refs=liste(b.referenzen??[],'Referenzen',0,8);
 if(refs.length){const {rows}=await ctx.pool.query('SELECT id FROM videos WHERE id=ANY($1::text[])',[refs]);if(rows.length!==new Set(refs).size)throw new ContentFehler('Eine Thumbnail-Referenz wurde nicht gefunden.');}
 const {rows}=await ctx.pool.query(`INSERT INTO content_thumbnails(id,inhalt_id,bild,text,gesicht,farben,komposition,referenzen,hinweise,quelle,erstellt_von,geaendert_von,geaendert_am) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,now())
 ON CONFLICT(inhalt_id) DO UPDATE SET bild=$3,text=$4,gesicht=$5,farben=$6,komposition=$7,referenzen=$8,hinweise=$9,quelle=$10,geaendert_von=$11,geaendert_am=now() RETURNING *`,
 [neueId('TH'),id,feld(b.bild,'Bild',3000,true),feld(b.text,'Text',1000),feld(b.gesicht,'Gesicht',2000,true),feld(b.farben,'Farben',1000),feld(b.komposition,'Komposition',3000,true),JSON.stringify(refs),feld(b.hinweise,'Hinweise',4000),quelle,ctx.email]);return rows[0];
}
async function routes(methode:string,pfad:string,raw:unknown,ctx:CreatorKontext,holen:typeof fetch):Promise<Antwort|null>{
 if(!ctx.sicht.werkzeuge.includes('content'))return fehler(403,'Content ist für dich nicht freigeschaltet.');
 const bId=block(pfad,ctx);const zu=bId?baustein(ctx,bId):null;if(zu)return zu;
 if(methode!=='GET'&&methode!=='POST')return null;
 const b=methode==='POST'?objekt(raw):{};
 const bezug=methode==='GET'?/^\/c\/content\/(?:inhalte|skripte|thumbnails|upload)\/([^/]+)/.exec(pfad)?.[1]:b.inhalt_id;
 if(bezug){const i=await inhalt(ctx.pool,feld(bezug,'Inhalt',80,true));if(!kanalAn(ctx,i.kanal))throw new ContentFehler('Dieser Kanal ist nicht freigeschaltet.',403);}
 if((pfad==='/c/content'||pfad==='/c/content/inhalte'||pfad==='/c/content/auswahl')&&methode==='GET'){
  const {rows}=await ctx.pool.query<Record<string,unknown>>('SELECT *,geplant_am::text AS geplant_am FROM inhalte WHERE NOT archiviert ORDER BY inhalte.geplant_am NULLS LAST,inhalte.erstellt_am DESC');
  const {rows:videos}=await ctx.pool.query(`SELECT id,titel,plattform,url,beispiel,vorschaubild FROM videos WHERE NOT beispiel ORDER BY veroeffentlicht_am DESC NULLS LAST LIMIT 500`);
  const {rows:team}=await ctx.pool.query<{wert:string}>(`SELECT wert FROM listen WHERE liste='team' ORDER BY nr`);
  return ok({inhalte:rows.map(zuInhalt).filter(i=>kanalAn(ctx,i.kanal)),videos,team:team.map(t=>t.wert),kanaele:kanale(ctx)});
 }
 if(pfad==='/c/content/inhalte/speichern'&&methode==='POST')return ok({inhalt:await speichern(b,ctx)});
 const detail=/^\/c\/content\/inhalte\/([^/]+)$/.exec(pfad);
 if(detail&&methode==='GET'){const i=await inhalt(ctx.pool,detail[1]);if(!kanalAn(ctx,i.kanal))return fehler(403,'Dieser Kanal ist nicht freigeschaltet.');return ok({inhalt:i});}
 if(pfad==='/c/content/ton'){
  if(methode==='POST'){admin(ctx);await ctx.pool.query(`INSERT INTO content_ton(id,beschreibung,beispiele,no_gos,geaendert_am,geaendert_von) VALUES('standard',$1,$2,$3,now(),$4) ON CONFLICT(id) DO UPDATE SET beschreibung=$1,beispiele=$2,no_gos=$3,geaendert_am=now(),geaendert_von=$4`,[feld(b.beschreibung,'Ton',5000),feld(b.beispiele,'Beispiele',12000),feld(b.no_gos,'No-Gos',4000),ctx.email]);}
  return ok({ton:await ton(ctx.pool)});
 }
 if(pfad==='/c/content/recherche'&&methode==='GET'){
  const {rows:vorschlaege}=await ctx.pool.query('SELECT * FROM content_vorschlaege ORDER BY erstellt_am DESC LIMIT 200');
  const {rows:laeufe}=await ctx.pool.query('SELECT *,woche::text AS woche FROM content_recherche_laeufe ORDER BY erstellt_am DESC LIMIT 20');return ok({vorschlaege,laeufe});
 }
 if(pfad==='/c/content/recherche/erstellen'&&methode==='POST')return ok(await recherchiere(ctx,ctx.email,holen,ctx.sicht.bausteine.includes('twitch')));
 if(pfad==='/c/content/recherche/entscheiden'&&methode==='POST'){
  if(b.status!=='uebernommen'&&b.status!=='verworfen')throw new ContentFehler('Ungültige Entscheidung.');
  if(b.status==='uebernommen'){const s=baustein(ctx,'contentplan');if(s)return s;}
  return ctx.pool.transaktion(async db=>{
   const {rows}=await db.query<Record<string,unknown>>('SELECT * FROM content_vorschlaege WHERE id=$1 FOR UPDATE',[feld(b.id,'Vorschlag',80,true)]);const v=rows[0];if(!v)throw new ContentFehler('Vorschlag nicht gefunden.',404);
   if(v.status!=='offen')return ok({inhalt_id:v.inhalt_id,status:v.status});
   let id:string|null=null;if(b.status==='uebernommen'){
    if(!kanalAn(ctx,v.kanal))throw new ContentFehler('Dieser Kanal ist nicht freigeschaltet.');id=neueId('I');
    await db.query(`INSERT INTO inhalte(id,titel,kanal,format,status,quelle,quelle_id,notiz,erstellt_von) VALUES($1,$2,$3,$4,'idee','assistent',$5,$6,$7)`,[id,v.titel,v.kanal,v.format,v.id,v.begruendung,ctx.email]);
   }
   await db.query('UPDATE content_vorschlaege SET status=$2,inhalt_id=$3,entschieden_von=$4,entschieden_am=now() WHERE id=$1',[v.id,b.status,id,ctx.email]);return ok({inhalt_id:id,status:b.status});
  });
 }
 const scripts=/^\/c\/content\/skripte\/([^/]+)$/.exec(pfad);
 if(scripts&&methode==='GET'){await inhalt(ctx.pool,scripts[1]);const {rows}=await ctx.pool.query('SELECT * FROM content_skripte WHERE inhalt_id=$1 ORDER BY version DESC',[scripts[1]]);return ok({skripte:rows,ton:await ton(ctx.pool)});}
 if(pfad==='/c/content/skripte/erstellen'&&methode==='POST'){
  const i=await inhalt(ctx.pool,feld(b.inhalt_id,'Inhalt',80,true));
  const result=objekt(await frageJson(ctx.ki,{zweck:'skript',modell:'gut',email:ctx.email,maxTokens:6000,system:KI_SYSTEM,nachricht:JSON.stringify({aufgabe:'Schreibe ein Skript und jeweils 3–5 Titel und Hooks. JSON {skript:string,titel:string[],hooks:string[]}.',inhalt:i,ton:await ton(ctx.pool),anweisung:feld(b.anweisung,'Anweisung',3000)})}));
  return ok({skript:await skriptSpeichern({...result,inhalt_id:i.id,anweisung:b.anweisung},ctx,'ki')});
 }
 if(pfad==='/c/content/skripte/speichern'&&methode==='POST')return ok({skript:await skriptSpeichern(b,ctx,'team')});
 const thumb=/^\/c\/content\/thumbnails\/([^/]+)$/.exec(pfad);
 if(thumb&&methode==='GET'){
  await inhalt(ctx.pool,thumb[1]);const {rows}=await ctx.pool.query('SELECT * FROM content_thumbnails WHERE inhalt_id=$1',[thumb[1]]);
  const {rows:referenzen}=await ctx.pool.query(`SELECT v.id,v.titel,v.vorschaubild,v.beispiel FROM videos v LEFT JOIN LATERAL(SELECT aufrufe FROM video_werte WHERE video_id=v.id ORDER BY datum DESC LIMIT 1) w ON true WHERE coalesce(v.vorschaubild,'')<>'' ORDER BY w.aufrufe DESC NULLS LAST LIMIT 8`);
  return ok({thumbnail:rows[0]??null,referenzen,boards:await erlaubteBoards(ctx)});
 }
 if(pfad==='/c/content/thumbnails/erstellen'&&methode==='POST'){
  const i=await inhalt(ctx.pool,feld(b.inhalt_id,'Inhalt',80,true));
  const {rows:referenzen}=await ctx.pool.query(`SELECT v.id,v.titel,v.vorschaubild FROM videos v LEFT JOIN LATERAL(SELECT aufrufe FROM video_werte WHERE video_id=v.id ORDER BY datum DESC LIMIT 1) w ON true WHERE coalesce(v.vorschaubild,'')<>'' ORDER BY w.aufrufe DESC NULLS LAST LIMIT 8`);
  const out=objekt(await frageJson(ctx.ki,{zweck:'thumbnail',modell:'gut',email:ctx.email,maxTokens:2500,system:KI_SYSTEM,nachricht:JSON.stringify({aufgabe:'Erstelle ein umsetzbares Thumbnail-Briefing. JSON {bild,text,gesicht,farben,komposition,hinweise,referenzen:[Video-ID]}. Nur vorhandene Referenz-IDs verwenden. Erfinde keine Bildbeobachtungen; dir liegen nur Titel und URLs vor.',inhalt:i,referenzen,anweisung:feld(b.anweisung,'Anweisung',3000)})}));
  return ok({thumbnail:await thumbnailSpeichern({...out,inhalt_id:i.id},ctx,'ki')});
 }
 if(pfad==='/c/content/thumbnails/speichern'&&methode==='POST')return ok({thumbnail:await thumbnailSpeichern(b,ctx,'team')});
 if(pfad==='/c/content/thumbnails/aufgabe'&&methode==='POST'){
  const boards=await erlaubteBoards(ctx);const board=boards.find(x=>x.id===b.board_id);if(!board)throw new ContentFehler('Dieses Board ist für dich nicht freigegeben.',403);
  let spalten:unknown;try{spalten=JSON.parse(board.spalten||'[]');}catch{throw new ContentFehler('Das Board hat keine gültigen Spalten.');}
  if(!Array.isArray(spalten)||!istObjekt(spalten[0])||typeof spalten[0].id!=='string')throw new ContentFehler('Bitte zuerst eine Spalte auf dem Board anlegen.');
  const spalte=spalten[0].id;
  return ctx.pool.transaktion(async db=>{
   const i=await inhalt(db,feld(b.inhalt_id,'Inhalt',80,true));const {rows}=await db.query<Record<string,unknown>>('SELECT * FROM content_thumbnails WHERE inhalt_id=$1 FOR UPDATE',[i.id]);const t=rows[0];if(!t)throw new ContentFehler('Bitte zuerst ein Briefing speichern.');
   if(t.aufgabe_id){const vorhanden=await db.query('SELECT id FROM aufgaben WHERE id=$1 AND NOT archiviert',[t.aufgabe_id]);if(vorhanden.rows.length)return ok({aufgabe_id:t.aufgabe_id,board_id:t.aufgabe_board_id});}
   const id=neueId('K');const beschreibung=['Bild','Text','Gesicht','Farben','Komposition','Hinweise'].map(k=>`${k}: ${text(t[k.toLowerCase()])}`).join('\n\n');
   await db.query(`INSERT INTO aufgaben(id,board_id,spalte_id,titel,beschreibung,zustaendig,faellig_am,sortierung,quelle,quelle_link,erstellt_am,erstellt_von) VALUES($1,$2,$3,$4,$5,$6,$7,0,'content',$8,$9,$10)`,[id,board.id,spalte,`Thumbnail: ${i.titel}`,beschreibung,feld(b.zustaendig,'Zuständigkeit',100),datum(b.faellig_am),`#/content/inhalte/${i.id}`,ctx.jetzt().toISOString(),ctx.person]);
   await db.query('UPDATE content_thumbnails SET aufgabe_id=$2,aufgabe_board_id=$3 WHERE id=$1',[t.id,id,board.id]);return ok({aufgabe_id:id,board_id:board.id});
  });
 }
 if(pfad==='/c/content/einstellungen'){
  if(methode==='POST'){
   admin(ctx);const erlaubte=['impressum_url','impressum_tiktok','impressum_instagram'];
   if(Object.keys(b).some(k=>!erlaubte.includes(k)))throw new ContentFehler('Unbekannte Einstellung.');
   for(const [k,v] of Object.entries(b)){const val=k==='impressum_url'?url(v):(v==='ja'?'ja':'nein');await ctx.pool.query(`INSERT INTO content_einstellungen(schluessel,wert,geaendert_am,geaendert_von) VALUES($1,$2,now(),$3) ON CONFLICT(schluessel) DO UPDATE SET wert=$2,geaendert_am=now(),geaendert_von=$3`,[k,val,ctx.email]);}
  }
  return ok({einstellungen:await einstellungen(ctx.pool)});
 }
 const upload=/^\/c\/content\/upload\/([^/]+)\/(tiktok|instagram|youtube|twitch)$/.exec(pfad);
 if(upload&&methode==='GET'){if(!kanalAn(ctx,upload[2]))throw new ContentFehler('Dieser Kanal ist nicht freigeschaltet.',403);return ok(await uploadDaten(ctx,upload[1],upload[2] as Kanal));}
 if((pfad==='/c/content/upload/speichern'||pfad==='/c/content/upload/erstellen')&&methode==='POST'){
  const id=feld(b.inhalt_id,'Inhalt',80,true);if(!kanalAn(ctx,b.plattform))throw new ContentFehler('Dieser Kanal ist nicht freigeschaltet.');const plattform=b.plattform;
  const i=await inhalt(ctx.pool,id);let werte=b;
  if(pfad.endsWith('/erstellen'))werte=objekt(await frageJson(ctx.ki,{zweck:'upload',modell:'gut',email:ctx.email,maxTokens:3500,system:KI_SYSTEM,nachricht:JSON.stringify({aufgabe:'Erstelle deutsche Upload-Texte. JSON {titel,caption,beschreibung,hashtags:string[],suchbegriffe:string[]}. Keine Veröffentlichung.',inhalt:i,plattform,regeln:PLATTFORM_REGELN[plattform],ton:await ton(ctx.pool),anweisung:feld(b.anweisung,'Anweisung',3000)})}));
  const abgehakt=istObjekt(werte.abgehakt)?Object.fromEntries(['schalter','thumbnail'].map(k=>[k,werte.abgehakt&&istObjekt(werte.abgehakt)?werte.abgehakt[k]===true:false])):{};
  const tags=Array.isArray(werte.hashtags)?liste(werte.hashtags,'Hashtags',0,40):feld(werte.hashtags,'Hashtags',1000);const such=Array.isArray(werte.suchbegriffe)?liste(werte.suchbegriffe,'Suchbegriffe',0,20):feld(werte.suchbegriffe,'Suchbegriffe',1000);
  await ctx.pool.query(`INSERT INTO content_uploads(id,inhalt_id,plattform,titel,caption,hashtags,beschreibung,suchbegriffe,abgehakt,quelle,erstellt_von,geaendert_von,geaendert_am) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,now()) ON CONFLICT(inhalt_id,plattform) DO UPDATE SET titel=$4,caption=$5,hashtags=$6,beschreibung=$7,suchbegriffe=$8,abgehakt=$9,quelle=$10,geaendert_von=$11,geaendert_am=now()`,[neueId('UP'),id,plattform,feld(werte.titel,'Titel',500),feld(werte.caption,'Caption',8000),begriffe(tags).join(', '),feld(werte.beschreibung,'Beschreibung',12000),suchbegriffeVon(such).join(', '),JSON.stringify(abgehakt),pfad.endsWith('/erstellen')?'ki':'team',ctx.email]);
  return ok(await uploadDaten(ctx,id,plattform));
 }
 if(pfad==='/c/content/captions'&&methode==='GET'){
  const {rows:videos}=await ctx.pool.query(`SELECT id,titel,beschreibung,beispiel FROM videos WHERE plattform='tiktok' ORDER BY veroeffentlicht_am DESC NULLS LAST LIMIT 20`);
  const {rows:vorschlaege}=await ctx.pool.query('SELECT * FROM content_caption_vorschlaege ORDER BY erstellt_am DESC LIMIT 100');return ok({videos,vorschlaege});
 }
 if(pfad==='/c/content/captions/erstellen'&&methode==='POST'){
  const {rows}=await ctx.pool.query<{id:string;titel:string;beschreibung:string}>(`SELECT id,titel,beschreibung FROM videos WHERE id=$1 AND plattform='tiktok'`,[feld(b.video_id,'Video',80,true)]);const v=rows[0];if(!v)throw new ContentFehler('TikTok-Video nicht gefunden.',404);
  const out=objekt(await frageJson(ctx.ki,{zweck:'caption',modell:'gut',email:ctx.email,maxTokens:2000,system:KI_SYSTEM,nachricht:JSON.stringify({aufgabe:'Verbessere diese TikTok-Caption mit konkreten deutschen Suchbegriffen. Vorhandene Werbekennzeichnung erhalten. JSON {caption,hashtags:string[],suchbegriffe:string[],begruendung}.',video:v,ton:await ton(ctx.pool)})}));
  let caption=feld(out.caption,'Caption',4000,true);if(istKennzeichnung(v.titel||'')||istKennzeichnung(v.beschreibung||''))caption=`Werbung\n\n${caption.replace(/^\s*(Werbung|Anzeige)\s*[|:\-]?\s*/i,'')}`;
  const {rows:neu}=await ctx.pool.query('INSERT INTO content_caption_vorschlaege(id,video_id,bisher,caption,hashtags,suchbegriffe,begruendung) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[neueId('CP'),v.id,v.beschreibung||v.titel,caption,liste(out.hashtags,'Hashtags',1,8).join(', '),liste(out.suchbegriffe,'Suchbegriffe',1,10).join(', '),feld(out.begruendung,'Begründung',3000,true)]);return ok({vorschlag:neu[0]});
 }
 if(pfad==='/c/content/captions/entscheiden'&&methode==='POST'){
  if(b.status!=='uebernommen'&&b.status!=='verworfen')throw new ContentFehler('Ungültige Entscheidung.');
  const {rows}=await ctx.pool.query(`UPDATE content_caption_vorschlaege SET status=$2,entschieden_von=$3,entschieden_am=now() WHERE id=$1 AND status='offen' RETURNING id`,[feld(b.id,'Vorschlag',80,true),b.status,ctx.email]);return rows.length?ok():fehler(409,'Vorschlag nicht mehr offen.');
 }
 return null;
}
export function erzeugeContentModul(holen:typeof fetch=fetch):Modul {return {praefix:'content',routen:async(m,p,b,c)=>{try{return await routes(m,p,b,c,holen);}catch(e){if(e instanceof ContentFehler)return fehler(e.status,e.message);throw e;}},takte:{recherche:c=>rechercheTakt(c,holen)}};}
export const contentModul=erzeugeContentModul();
