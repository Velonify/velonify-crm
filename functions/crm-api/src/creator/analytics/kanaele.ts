import { randomBytes } from 'node:crypto';
import { darfEinrichten } from '../../../../../src/data/instanz';
import type { Db } from '../../../../../src/data/postgres/postgresStore';
import type { CreatorKontext, OeffentlichKontext } from '../modul';
import { neueId } from '../modul';
import { adapterFuer, konfigFuer, rueckrufUrl, type Tokens, type AbrufErgebnis, type Adapter } from './plattformen';
import { ApiFehler, istPlattform, istOauthPlattform, tag, type Dienste, type Holen } from './gemeinsam';
import { problem, kurz, wertFelder, type Zeile } from './daten';

interface Konto { id:string;plattform:string;extern_id:string;token_secret:string; }
const admin=(ctx:CreatorKontext)=>{if(!darfEinrichten(ctx.rolle))problem('Kanäle verbinden und trennen dürfen nur Admins.',403);};
export async function verbinden(body:Zeile,ctx:CreatorKontext) {
  admin(ctx);if(!istOauthPlattform(body.plattform))problem('Unbekannter Kanal.');
  if(body.plattform==='twitch'&&!ctx.sicht.bausteine.includes('twitch'))problem('Twitch ist nicht eingeschaltet.',403);
  if(body.plattform==='facebook'&&!ctx.sicht.bausteine.includes('benchmarking'))problem('Benchmarking ist nicht eingeschaltet.',403);
  const adapter=adapterFuer(body.plattform);const {konfig,fehlt}=konfigFuer(adapter,ctx.umgebung);
  if(!konfig)problem(`Die Verbindung ist noch nicht eingerichtet: ${fehlt.join(', ')}.`,503);
  const state=randomBytes(32).toString('base64url');
  await ctx.pool.query(`DELETE FROM analytics_oauth WHERE erstellt_am < $1`,[new Date(ctx.jetzt().getTime()-24*3600_000).toISOString()]);
  await ctx.pool.query(`INSERT INTO analytics_oauth(state,plattform,email,person,rolle,erstellt_am) VALUES($1,$2,$3,$4,$5,$6)`,[state,body.plattform,ctx.email,ctx.person,ctx.rolle,ctx.jetzt().toISOString()]);
  return {url:adapter.autorisierung(konfig,rueckrufUrl(ctx.umgebung,body.plattform),state)};
}
export async function rueckruf(plattform:string,query:Record<string,string>,ctx:OeffentlichKontext,holen:Holen) {
  if(!istOauthPlattform(plattform))problem('Unbekannter Kanal.',404);
  if(plattform==='facebook'&&!ctx.bausteine.includes('benchmarking'))problem('Benchmarking ist ausgeschaltet.',404);
  if(!ctx.bausteine.includes('kanaele')||(plattform==='twitch'&&!ctx.bausteine.includes('twitch')))problem('Die Kanal-Anbindung ist ausgeschaltet.',404);
  const {rows}=await ctx.pool.query<{email:string;person:string;rolle:string}>(`UPDATE analytics_oauth SET verbraucht_am=$3 WHERE state=$1 AND plattform=$2 AND verbraucht_am IS NULL AND erstellt_am>$4 RETURNING email,person,rolle`,[query.state??'',plattform,ctx.jetzt().toISOString(),new Date(ctx.jetzt().getTime()-10*60_000).toISOString()]);
  const versuch=rows[0];if(!versuch)problem('Dieser Verbindungsversuch ist abgelaufen oder wurde bereits verwendet. Bitte im Hub neu starten.',400);
  const aktive=(await ctx.pool.query<{rolle:string}>(`SELECT rolle FROM instanz_zugaenge WHERE email=$1 AND aktiv`,[versuch.email])).rows[0];
  const support=(ctx.umgebung.wert('ADMINS')??'').split(',').map(s=>s.trim().toLowerCase()).includes(versuch.email.toLowerCase());
  const zugang=(await ctx.pool.query<{wert:string}>(`SELECT wert FROM einstellungen WHERE schluessel='instanz_velonify_zugang'`)).rows[0]?.wert;
  if(aktive?.rolle!=='admin'&&!(versuch.rolle==='velonify'&&support&&zugang!=='aus'))problem('Der Zugang für diese Verbindung ist nicht mehr freigegeben.',403);
  if(query.error)problem('Die Plattform-Anmeldung wurde abgebrochen. Bitte die Verbindung im Hub erneut starten.');
  if(!query.code)problem('Der Bestätigungscode fehlt.');
  const adapter=adapterFuer(plattform);const {konfig,fehlt}=konfigFuer(adapter,ctx.umgebung);if(!konfig)problem(`Verbindung nicht eingerichtet: ${fehlt.join(', ')}.`,503);
  const {tokens,profil}=await adapter.tausche(konfig,query.code,rueckrufUrl(ctx.umgebung,plattform),holen,ctx.jetzt());
  if(!tokens.access_token||!profil.extern_id)problem('Die Plattform hat keine vollständige Verbindung geliefert.',502);
  if(plattform==='facebook'){
    const secret='kanal-instagram-discovery';
    await ctx.geheimnisse.schreiben(secret,JSON.stringify(tokens));
    await ctx.pool.query(`INSERT INTO analytics_zugaenge(id,art,extern_id,handle,token_secret,token_bis,verbunden_von) VALUES('IG-DISCOVERY','instagram_discovery',$1,$2,$3,$4,$5) ON CONFLICT(art) DO UPDATE SET extern_id=excluded.extern_id,handle=excluded.handle,token_secret=excluded.token_secret,token_bis=excluded.token_bis,verbunden_von=excluded.verbunden_von,verbunden_am=now(),fehler=NULL`,[profil.extern_id,profil.handle,secret,tokens.laeuft_ab??null,versuch.email]);
    return {umleiten:`${ctx.umgebung.hubUrl.replace(/\/$/,'')}/#/oeffentlich/kanal-verbunden?kanal=facebook&ergebnis=verbunden`};
  }
  const vorhanden=(await ctx.pool.query<Konto>('SELECT id,token_secret FROM kanal_konten WHERE plattform=$1 AND extern_id=$2 AND NOT beispiel',[plattform,profil.extern_id])).rows[0];
  const id=vorhanden?.id??neueId('KK');const secret=vorhanden?.token_secret||`kanal-${plattform}-${id.toLowerCase()}`;
  await ctx.geheimnisse.schreiben(secret,JSON.stringify(tokens));
  await ctx.pool.query(`INSERT INTO kanal_konten(id,plattform,extern_id,handle,name,bild,url,status,token_secret,verbunden_am,verbunden_von,token_bis,refresh_bis,scopes) VALUES($1,$2,$3,$4,$5,$6,$7,'verbunden',$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO UPDATE SET handle=excluded.handle,name=excluded.name,bild=excluded.bild,url=excluded.url,status='verbunden',token_secret=excluded.token_secret,verbunden_am=excluded.verbunden_am,verbunden_von=excluded.verbunden_von,token_bis=excluded.token_bis,refresh_bis=excluded.refresh_bis,scopes=excluded.scopes,fehler=NULL`,[id,plattform,profil.extern_id,profil.handle,profil.name,profil.bild??null,profil.url??null,secret,ctx.jetzt().toISOString(),versuch.email,tokens.laeuft_ab??null,tokens.refresh_laeuft_ab??null,tokens.scope??null]);
  return {umleiten:`${ctx.umgebung.hubUrl.replace(/\/$/,'')}/#/oeffentlich/kanal-verbunden?kanal=${plattform}&ergebnis=verbunden`};
}
export async function trennen(body:Zeile,ctx:CreatorKontext) {
  admin(ctx);const k=(await ctx.pool.query<Konto>('SELECT * FROM kanal_konten WHERE id=$1 AND NOT beispiel',[kurz(body.id)])).rows[0];if(!k)problem('Kanal nicht gefunden.',404);
  // Stop future jobs before deleting credentials. A failed deletion can be retried safely.
  await ctx.pool.query(`UPDATE kanal_konten SET status='getrennt',token_bis=NULL,refresh_bis=NULL,fehler=NULL WHERE id=$1`,[k.id]);
  if(k.token_secret){if(ctx.geheimnisse.loeschen)await ctx.geheimnisse.loeschen(k.token_secret);else await ctx.geheimnisse.schreiben(k.token_secret,'{}');}
  await ctx.pool.query('UPDATE kanal_konten SET token_secret=NULL WHERE id=$1',[k.id]);
  return {ok:true};
}
async function tokenLesen(k:Konto,d:Dienste):Promise<Tokens>{const roh=await d.geheimnisse.lesen(k.token_secret);if(!roh)problem('Kein Zugang gespeichert. Bitte den Kanal neu verbinden.',401);const t=JSON.parse(roh) as Tokens;if(!t.access_token)problem('Der Zugang ist getrennt. Bitte neu verbinden.',401);return t;}
async function erneuern(k:Konto,t:Tokens,a:Adapter,d:Dienste,erzwingen=false){const {konfig,fehlt}=konfigFuer(a,d.umgebung);if(!konfig)problem(`Nicht eingerichtet: ${fehlt.join(', ')}`,503);const neu=await a.erneuere(konfig,t,d.holen,d.jetzt(),erzwingen);if(neu){if(!neu.access_token)problem('Die Plattform hat keinen erneuerten Zugang geliefert.',502);await d.geheimnisse.schreiben(k.token_secret,JSON.stringify(neu));await d.pool.query('UPDATE kanal_konten SET token_bis=$2,refresh_bis=$3 WHERE id=$1',[k.id,neu.laeuft_ab??null,neu.refresh_laeuft_ab??null]);}return {tokens:neu??t,konfig};}

/** Deletes only demo rows for the connected platform; real data and other examples survive. */
export async function ersetzeBeispiele(db:Db,plattform:string){
  const ids=(await db.query<{id:string}>('SELECT id FROM videos WHERE plattform=$1 AND beispiel',[plattform])).rows.map(r=>r.id);
  if(ids.length){for(const table of ['video_werte','video_merkmale','kommentare'])await db.query(`DELETE FROM ${table} WHERE video_id=ANY($1::text[])`,[ids]);await db.query(`UPDATE inhalte SET video_id=NULL WHERE video_id=ANY($1::text[])`,[ids]);await db.query('DELETE FROM videos WHERE id=ANY($1::text[])',[ids]);}
  await db.query('DELETE FROM kanal_werte WHERE konto_id IN(SELECT id FROM kanal_konten WHERE plattform=$1 AND beispiel)',[plattform]);
  await db.query('DELETE FROM kanal_konten WHERE plattform=$1 AND beispiel',[plattform]);
  // Drafts based on examples must never survive silently into real reporting.
  await db.query('DELETE FROM berichte WHERE beispiel AND status=\'entwurf\'');
}
export async function speichernAbruf(k:Konto,r:AbrufErgebnis,d:Dienste){
  return d.pool.transaktion(async db=>{
    await db.query('SELECT id FROM kanal_konten WHERE id=$1 FOR UPDATE',[k.id]);
    const aktiv=(await db.query<{status:string}>('SELECT status FROM kanal_konten WHERE id=$1',[k.id])).rows[0];
    if(!aktiv||aktiv.status==='getrennt')problem('Der Kanal wurde während des Abrufs getrennt.',409);
    const heute=tag(d.jetzt());
    for(const w of [{...r.heute,datum:heute},...r.tage]){
      await db.query(`INSERT INTO kanal_werte(konto_id,datum,follower,aufrufe,reichweite,interaktionen,likes,beitraege,wiedergabezeit_s,follower_neu) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(konto_id,datum) DO UPDATE SET follower=coalesce(excluded.follower,kanal_werte.follower),aufrufe=coalesce(excluded.aufrufe,kanal_werte.aufrufe),reichweite=coalesce(excluded.reichweite,kanal_werte.reichweite),interaktionen=coalesce(excluded.interaktionen,kanal_werte.interaktionen),likes=coalesce(excluded.likes,kanal_werte.likes),beitraege=coalesce(excluded.beitraege,kanal_werte.beitraege),wiedergabezeit_s=coalesce(excluded.wiedergabezeit_s,kanal_werte.wiedergabezeit_s),follower_neu=coalesce(excluded.follower_neu,kanal_werte.follower_neu)`,[k.id,w.datum,w.follower??null,w.aufrufe??null,w.reichweite??null,w.interaktionen??null,w.likes??null,w.beitraege??null,w.wiedergabezeit_s??null,w.follower_neu??null]);
    }
    const ids=new Map<string,string>();
    for(const v of r.videos){
      const {rows}=await db.query<{id:string}>(`INSERT INTO videos(id,konto_id,plattform,extern_id,url,titel,beschreibung,veroeffentlicht_am,dauer_s,vorschaubild,typ,abgerufen_am) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(plattform,extern_id) DO UPDATE SET konto_id=excluded.konto_id,url=excluded.url,titel=excluded.titel,beschreibung=excluded.beschreibung,veroeffentlicht_am=excluded.veroeffentlicht_am,dauer_s=excluded.dauer_s,vorschaubild=excluded.vorschaubild,typ=excluded.typ,abgerufen_am=excluded.abgerufen_am RETURNING id`,[neueId('V'),k.id,k.plattform,v.extern_id,v.url??null,v.titel??null,v.beschreibung??null,v.veroeffentlicht_am??null,v.dauer_s??null,v.vorschaubild??null,v.typ,d.jetzt().toISOString()]);
      const id=rows[0].id;ids.set(v.extern_id,id);
      const fields=wertFelder.filter(f=>f!=='komplett_rate'&&f!=='follower_neu');
      await db.query(`INSERT INTO video_werte(video_id,datum,${fields.join(',')}) VALUES($1,$2,${fields.map((_,i)=>`$${i+3}`).join(',')}) ON CONFLICT(video_id,datum,quelle) DO UPDATE SET ${fields.map(f=>`${f}=coalesce(excluded.${f},video_werte.${f})`).join(',')}`,[id,heute,...fields.map(f=>v.werte[f]??null)]);
    }
    for(const c of r.kommentare){const id=ids.get(c.video_extern_id);if(id)await db.query(`INSERT INTO kommentare(id,video_id,plattform,text,likes,am) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET text=excluded.text,likes=excluded.likes`,[`${k.plattform}-${c.extern_id}`,id,k.plattform,c.text,c.likes,c.am]);}
    for(const m of r.marker??[]){const id=ids.get(m.video_extern_id);if(id)await db.query(`INSERT INTO twitch_marker(id,video_id,position_s,beschreibung,am) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET beschreibung=excluded.beschreibung`,[m.extern_id,id,m.position_s,m.beschreibung,m.am]);}
    for(const c of r.clips??[])await db.query(`INSERT INTO twitch_clips(id,video_id,vod_offset_s,dauer_s,titel,aufrufe,url,ersteller,am) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET aufrufe=excluded.aufrufe,titel=excluded.titel,video_id=excluded.video_id,vod_offset_s=excluded.vod_offset_s`,[c.extern_id,c.video_extern_id?ids.get(c.video_extern_id)??null:null,c.vod_offset_s,c.dauer_s,c.titel,c.aufrufe,c.url,c.ersteller,c.am]);
    await ersetzeBeispiele(db,k.plattform);
    await db.query(`UPDATE kanal_konten SET handle=$2,name=$3,url=$4,bild=$5,status='verbunden',fehler=NULL,letzte_abholung=$6,abruf_stand=$7::jsonb WHERE id=$1`,[k.id,r.profil.handle,r.profil.name,r.profil.url??null,r.profil.bild??null,d.jetzt().toISOString(),JSON.stringify({videos:r.videos.length,kommentare:r.kommentare.length})]);
    return {videos:r.videos.length,kommentare:r.kommentare.length};
  });
}
export async function abrufen(d:Dienste,id?:string){
  if(!d.bausteine.includes('kanaele'))return {konten:[]};
  const {rows}=await d.pool.query<Konto>(`SELECT id,plattform,extern_id,token_secret FROM kanal_konten WHERE NOT beispiel AND status IN('verbunden','fehler') AND token_secret IS NOT NULL ${id?'AND id=$1':''}`,id?[id]:[]);
  const result: {id:string;ok:boolean;videos?:number;kommentare?:number;fehler?:string}[]=[];
  for(const k of rows){if(!istPlattform(k.plattform)||(k.plattform==='twitch'&&!d.bausteine.includes('twitch')))continue;
    let claimed=false;
    try{
      // Claim prevents concurrent refreshes from replacing each other's refresh tokens.
      const claim=(await d.pool.query(`UPDATE kanal_konten SET abruf_sperre_bis=$2,letzter_versuch=$3 WHERE id=$1 AND (abruf_sperre_bis IS NULL OR abruf_sperre_bis<$3) RETURNING id`,[k.id,new Date(d.jetzt().getTime()+10*60_000).toISOString(),d.jetzt().toISOString()])).rows;
      if(!claim.length){result.push({id:k.id,ok:false,fehler:'Ein Abruf läuft bereits.'});continue;}
      claimed=true;
      const a=adapterFuer(k.plattform);let {tokens,konfig}=await erneuern(k,await tokenLesen(k,d),a,d);
      const bekannt=new Set((await d.pool.query<{extern_id:string}>('SELECT extern_id FROM videos WHERE konto_id=$1',[k.id])).rows.map(v=>v.extern_id));
      let r:AbrufErgebnis;
      try{r=await a.abruf!(konfig,tokens,d.holen,d.jetzt(),bekannt);}catch(e){if(!(e instanceof ApiFehler)||e.status!==401)throw e;({tokens,konfig}=await erneuern(k,tokens,a,d,true));r=await a.abruf!(konfig,tokens,d.holen,d.jetzt(),bekannt);}
      if(r.profil.extern_id!==k.extern_id)problem('Die Plattform hat einen anderen Kanal zurückgegeben. Bitte neu verbinden.',409);
      result.push({id:k.id,ok:true,...await speichernAbruf(k,r,d)});
    }catch(e){const fehler=e instanceof Error?e.message:'Abruf fehlgeschlagen.';await d.pool.query(`UPDATE kanal_konten SET status=CASE WHEN status='getrennt' THEN status ELSE 'fehler' END,fehler=$2 WHERE id=$1`,[k.id,fehler.slice(0,500)]);result.push({id:k.id,ok:false,fehler});}
    finally{if(claimed)await d.pool.query('UPDATE kanal_konten SET abruf_sperre_bis=NULL WHERE id=$1',[k.id]);}
  }return {konten:result};
}
