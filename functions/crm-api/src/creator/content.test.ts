import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { testDb } from '../../../../db/test/testDb';
import { BAUSTEINE, type InstanzSicht } from '../../../../src/data/instanz';
import { speicherGeheimnisse } from './geheimnisse';
import { testKi } from './ki';
import type { CreatorKontext, Modul, TaktKontext } from './modul';
import { erzeugeContentModul } from './content';

let ctx:CreatorKontext; let pg:PGlite; let modul:Modul;
const fakeFetch:typeof fetch=async()=>new Response(JSON.stringify({items:[]}),{status:200});
async function call(p:string,b?:unknown){return modul.routen!(b===undefined?'GET':'POST',`/c/content${p}`,b,ctx);}
async function anlegen(extra:Record<string,unknown>={}){const r=await call('/inhalte/speichern',{titel:'Stadt entdecken',kanal:'tiktok',status:'idee',geplant_am:'2026-11-03',...extra});expect(r?.status).toBe(200);return (r!.daten as {inhalt:{id:string;geaendert_am:string}}).inhalt;}
function ki(antwort:unknown){ctx.ki=testKi(()=>JSON.stringify(antwort));}
const script={skript:'Szene eins: Kamera vor dem Bahnhof.',titel:['Titel eins','Titel zwei','Titel drei'],hooks:['Hook eins','Hook zwei','Hook drei']};
describe('Creator Content integration', {timeout:60000},()=>{
 beforeEach(async()=>{const t=await testDb();pg=t.pg;const sicht:InstanzSicht={profil:'creator',name:'Beispiel',email:'mara@example.com',person:'Mara',rolle:'admin',werkzeuge:['home','content','todo','kooperationen'],bausteine:BAUSTEINE.map(b=>b.id),betraege:true,velonify_zugang:true};ctx={pool:t.pool,email:sicht.email,person:'Mara',rolle:'admin',sicht,ki:testKi(()=> '{}'),geheimnisse:speicherGeheimnisse(),umgebung:{hubUrl:'https://hub.example',apiUrl:'https://api.example',wert:()=>undefined},jetzt:()=>new Date('2026-10-28T12:00:00Z')};modul=erzeugeContentModul(fakeFetch);});
 afterEach(async()=>{await pg.close();});
 it('lists the plan with planned and unplanned entries (no ambiguous sort column)',async()=>{
  await anlegen();await anlegen({geplant_am:''});const r=await call('');expect(r?.status).toBe(200);
 });
 it('creates, updates and removes linked upload deadlines atomically',async()=>{
  const i=await anlegen();let r=await ctx.pool.query<{datum:string;bezug_id:string}>("SELECT datum::text,bezug_id FROM fristen WHERE quelle='inhalt'");expect(r.rows).toEqual([{datum:'2026-11-03',bezug_id:i.id}]);
  expect((await call('/inhalte/speichern',{id:i.id,titel:'Neuer Titel',geplant_am:'2026-11-04'}))?.status).toBe(200);r=await ctx.pool.query("SELECT datum::text,bezug_id FROM fristen WHERE quelle='inhalt'");expect(r.rows).toHaveLength(1);expect(r.rows[0].datum).toBe('2026-11-04');
  await call('/inhalte/speichern',{id:i.id,geplant_am:''});expect((await ctx.pool.query('SELECT * FROM fristen')).rows).toHaveLength(0);
 });
 it('rejects impossible dates, stale writes, hidden features and hidden Twitch content',async()=>{
  expect((await call('/inhalte/speichern',{titel:'x',kanal:'tiktok',geplant_am:'2026-02-30'}))?.status).toBe(400);
  const i=await anlegen();expect((await call('/inhalte/speichern',{id:i.id,titel:'x',geaendert_am:'2025-01-01'}))?.status).toBe(409);
  const twitch=await anlegen({kanal:'twitch'});ctx.sicht.bausteine=ctx.sicht.bausteine.filter(b=>b!=='twitch'&&b!=='recherche');
  expect((await call('/recherche'))?.status).toBe(403);expect((await call(`/skripte/${twitch.id}`))?.status).toBe(403);
  ctx.sicht.werkzeuge=[];expect((await call(''))?.status).toBe(403);
 });
 it('links only a real same-channel video once and clears the previous relationship',async()=>{
  const i=await anlegen();await ctx.pool.query("INSERT INTO videos(id,konto_id,plattform,extern_id,beispiel) VALUES('V1','K','youtube','1',false),('V2','K','tiktok','2',true),('V3','K','tiktok','3',false)");
  expect((await call('/inhalte/speichern',{id:i.id,status:'live'}))?.status).toBe(400);expect((await call('/inhalte/speichern',{id:i.id,video_id:'V1'}))?.status).toBe(400);expect((await call('/inhalte/speichern',{id:i.id,video_id:'V2'}))?.status).toBe(400);
  expect((await call('/inhalte/speichern',{id:i.id,status:'live',video_id:'V3'}))?.status).toBe(200);expect((await ctx.pool.query("SELECT inhalt_id FROM videos WHERE id='V3'")).rows[0]).toEqual({inhalt_id:i.id});
  const other=await anlegen();expect((await call('/inhalte/speichern',{id:other.id,video_id:'V3'}))?.status).toBe(409);
  await call('/inhalte/speichern',{id:i.id,status:'idee',video_id:''});expect((await ctx.pool.query("SELECT inhalt_id FROM videos WHERE id='V3'")).rows[0]).toEqual({inhalt_id:null});
 });
 it('retains script versions and requires approval of the current version before shooting',async()=>{
  const i=await anlegen();ki(script);const r=await call('/skripte/erstellen',{inhalt_id:i.id});expect(r?.status).toBe(200);const s=(r!.daten as {skript:{id:string}}).skript;
  expect((await call('/inhalte/speichern',{id:i.id,status:'dreh'}))?.status).toBe(409);
  await ctx.pool.query("INSERT INTO freigaben(id,objekt_typ,objekt_id,titel,freigeber,status,angefragt_von) VALUES('FG','skript',$1,'Skript','Mara','freigegeben','Kim')",[s.id]);
  expect((await call('/inhalte/speichern',{id:i.id,status:'dreh'}))?.status).toBe(200);
  expect((await call('/skripte/speichern',{inhalt_id:i.id,...script,skript:'Neue Fassung'}))?.status).toBe(200);
  expect((await ctx.pool.query('SELECT version FROM content_skripte ORDER BY version')).rows).toEqual([{version:1},{version:2}]);
  expect((await call('/inhalte/speichern',{id:i.id,status:'schnitt'}))?.status).toBe(409);
 });
 it('makes research from real source IDs, retains example flags and scheduled retries are idempotent',async()=>{
  await ctx.pool.query("INSERT INTO kommentare(id,video_id,plattform,text,beispiel) VALUES('C1','V1','tiktok','Wie kommt man zum Bahnhof?',true)");
  ki({vorschlaege:Array.from({length:5},(_,n)=>({titel:`Thema ${n}`,kanal:'tiktok',format:'Video',begruendung:'Die Community fragt danach.',quellen:['kommentar:C1']}))});
  const tc:TaktKontext={pool:ctx.pool,ki:ctx.ki,geheimnisse:ctx.geheimnisse,umgebung:ctx.umgebung,jetzt:ctx.jetzt,bausteine:ctx.sicht.bausteine};
  await modul.takte!.recherche(tc);await modul.takte!.recherche(tc);
  expect((await ctx.pool.query('SELECT * FROM content_vorschlaege')).rows).toHaveLength(5);
  const {rows}=await ctx.pool.query<{quellen:{beispiel:boolean;hinweise:string[]}}>('SELECT quellen FROM content_recherche_laeufe');expect(rows[0].quellen.beispiel).toBe(true);expect(rows[0].quellen.hinweise.some(h=>h.includes('YOUTUBE_API_KEY'))).toBe(true);
  const {rows:v}=await ctx.pool.query<{id:string}>('SELECT id FROM content_vorschlaege LIMIT 1');await call('/recherche/entscheiden',{id:v[0].id,status:'uebernommen'});await call('/recherche/entscheiden',{id:v[0].id,status:'uebernommen'});expect((await ctx.pool.query("SELECT * FROM inhalte WHERE quelle='assistent'")).rows).toHaveLength(1);
 });
 it('does not invent a research success with missing sources or unknown citations',async()=>{
  expect((await call('/recherche/erstellen',{}))?.status).toBe(409);
  await ctx.pool.query("INSERT INTO kommentare(id,video_id,plattform,text) VALUES('C1','V1','tiktok','Frage')");ki({vorschlaege:Array.from({length:5},()=>({titel:'Thema',kanal:'tiktok',begruendung:'Test',quellen:['erfunden']}))});
  expect((await call('/recherche/erstellen',{}))?.status).toBe(502);expect((await ctx.pool.query('SELECT * FROM content_recherche_laeufe')).rows).toHaveLength(0);
 });
 it('uses the official YouTube trends endpoint and surfaces API failure while other sources work',async()=>{
  let request='';modul=erzeugeContentModul(async(input)=>{request=String(input);return new Response('',{status:503});});ctx.umgebung.wert=n=>n==='YOUTUBE_API_KEY'?'example-key':undefined;
  await ctx.pool.query("INSERT INTO kommentare(id,video_id,plattform,text) VALUES('C1','V1','tiktok','Frage')");ki({vorschlaege:Array.from({length:5},()=>({titel:'Thema',kanal:'youtube',format:'Video',begruendung:'Grund',quellen:['kommentar:C1']}))});
  const r=await call('/recherche/erstellen',{});expect(r?.status).toBe(200);expect(request).toContain('https://www.googleapis.com/youtube/v3/videos');expect(request).toContain('chart=mostPopular');expect((r!.daten as {hinweise:string[]}).hinweise[0]).toContain('nicht abgerufen');
 });
 it('automatically labels linked cooperation and includes imprint in final YouTube description',async()=>{
  await ctx.pool.query("INSERT INTO kooperationen(id,partner,marke) VALUES('KO','Beispielpartner','Beispielmarke')");const i=await anlegen({kanal:'youtube',kooperation_id:'KO'});
  const r=await call('/upload/speichern',{inhalt_id:i.id,plattform:'youtube',titel:'Bahnhof entdecken',beschreibung:'Den Bahnhof entdecken und umsteigen.',hashtags:'bahn',suchbegriffe:'Bahnhof',kennzeichnung:'keine Werbung'});
  expect(r?.status).toBe(200);const d=r!.daten as {fertig:{titel:string;text:string};upload:{kennzeichnung:string};umfeld:{werbung:boolean}};
  expect(d.umfeld.werbung).toBe(true);expect(d.upload.kennzeichnung).toBe('Werbung | Beispielmarke');expect(d.fertig.titel).toMatch(/^Werbung/);expect(d.fertig.text).toContain('Impressum: https://hub.example/#/oeffentlich/impressum');
 });
 it('creates one real thumbnail task and enforces partner board access',async()=>{
  const i=await anlegen();await ctx.pool.query(`INSERT INTO boards(id,titel,spalten) VALUES('B1','Schnitt','[{"id":"todo","titel":"Offen"}]'),('B2','Intern','[{"id":"todo","titel":"Offen"}]')`);
  await call('/thumbnails/speichern',{inhalt_id:i.id,bild:'Bahnhof',text:'Hier lang',gesicht:'Staunen',komposition:'Person links',referenzen:[]});
  await ctx.pool.query("INSERT INTO instanz_zugaenge(email,name,rolle,boards,werkzeuge) VALUES('mara@example.com','Mara','partner','B1','todo,content')");ctx.rolle='partner';
  expect((await call('/thumbnails/aufgabe',{inhalt_id:i.id,board_id:'B2'}))?.status).toBe(403);
  const req={inhalt_id:i.id,board_id:'B1',zustaendig:'Kim',faellig_am:'2026-11-01'};expect((await call('/thumbnails/aufgabe',req))?.status).toBe(200);await call('/thumbnails/aufgabe',req);expect((await ctx.pool.query('SELECT * FROM aufgaben')).rows).toHaveLength(1);
 });
 it('limits tone and imprint configuration to admins',async()=>{
  ctx.rolle='team';expect((await call('/ton',{beschreibung:'Ton'}))?.status).toBe(403);expect((await call('/einstellungen',{impressum_url:'https://example.com'}))?.status).toBe(403);
  ctx.rolle='admin';expect((await call('/einstellungen',{impressum_url:'javascript:alert(1)'}))?.status).toBe(400);expect((await call('/einstellungen',{impressum_url:'https://example.com/impressum'}))?.status).toBe(200);
 });
});
