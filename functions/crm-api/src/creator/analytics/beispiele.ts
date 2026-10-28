import type { CreatorKontext } from '../modul';
import { darfEinrichten } from '../../../../../src/data/instanz';
import { neueId } from '../modul';
import { tag, plusTage } from './gemeinsam';
import { problem } from './daten';

export async function beispiele(ctx:CreatorKontext){if(!darfEinrichten(ctx.rolle))problem('Beispielzahlen spielen Admins ein.',403);return ctx.pool.transaktion(async db=>{
  await db.query("SELECT pg_advisory_xact_lock(692184)");
  const vorhanden=(await db.query<{plattform:string}>('SELECT DISTINCT plattform FROM kanal_konten')).rows.map(r=>r.plattform);let kanaele=0;
  for(const [pi,p] of ['youtube','instagram','tiktok'].entries()){
    if(vorhanden.includes(p))continue;const id=neueId('DEMO');await db.query(`INSERT INTO kanal_konten(id,plattform,handle,name,status,beispiel) VALUES($1,$2,'@beispiel','Beispielkanal','beispiel',true)`,[id,p]);kanaele++;
    for(let day=89;day>=0;day--)await db.query('INSERT INTO kanal_werte(konto_id,datum,follower,aufrufe,reichweite,interaktionen,beispiel) VALUES($1,$2,$3,$4,$5,$6,true)',[id,plusTage(tag(ctx.jetzt()),-day),10000+pi*2000+(89-day)*29,1000+(day*127+pi*301)%4000,900+(day*97)%3000,80+(day*17)%200]);
    for(let i=0;i<14;i++){const v=neueId('DV');const date=plusTage(tag(ctx.jetzt()),-i*6);await db.query(`INSERT INTO videos(id,konto_id,plattform,extern_id,titel,beschreibung,veroeffentlicht_am,dauer_s,typ,beispiel) VALUES($1,$2,$3,$4,$5,$6,$7,45,'video',true)`,[v,id,p,`demo-${v}`,`Beispiel ${i+1}: ${['Alltag','Sprache','Reise'][i%3]}`,'Erfundene Daten zur Vorschau.',`${date}T12:00:00Z`]);
      for(let age=i*6;age>=0;age-=Math.max(1,i*2)){const d=plusTage(tag(ctx.jetzt()),-age);const views=1200+(i*1307+pi*281)%20000+(i*6-age)*300;await db.query(`INSERT INTO video_werte(video_id,datum,aufrufe,likes,kommentare,shares,durchschnitt_s,beispiel) VALUES($1,$2,$3,$4,$5,$6,28,true) ON CONFLICT DO NOTHING`,[v,d,views,Math.round(views*.06),Math.round(views*.004),Math.round(views*.002)]);}
      await db.query(`INSERT INTO video_merkmale(video_id,thema,format,hook,quelle,bestaetigt) VALUES($1,$2,$3,$4,'team',true)`,[v,['Alltag','Sprache','Reise'][i%3],['Erklärung','Vlog'][i%2],['Frage','Überraschung'][i%2]]);
    }
  }
  for(const [art,werte] of Object.entries({thema:['Alltag','Sprache','Reise'],format:['Erklärung','Vlog'],hook:['Frage','Überraschung']}))for(const wert of werte)await db.query('INSERT INTO merkmal_listen(art,wert) VALUES($1,$2) ON CONFLICT DO NOTHING',[art,wert]);return {kanaele};
});}
