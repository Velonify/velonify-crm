import { BAUSTEINE, INSTANZ_EINSTELLUNG, instanzBausteine, instanzWerkzeuge, istBaustein, PROFIL_WERKZEUGE } from '../../../../src/data/instanz';
import type { InstanzNeuigkeit, InstanzStatus } from '../../../../src/data/plattform';
import { PostgresStore, type Db } from '../../../../src/data/postgres/postgresStore';
import type { Antwort } from '../routen';
import type { InstanzDienste } from '../instanz';
import { fehler, istObjekt, neueId, ok, type Modul } from './modul';
import { startOeffentlich, startRouten } from './steuerung/start';

/**
 * Modul Steuerung (Bauplan Abschnitt 3, Punkte 31–32). Two parts:
 * - /steuerung/* for Velonify's hub, with STEUER_TOKEN (checked in index.ts): status, building blocks and news of the
 *   instance, only metadata, never content.
 * - /c/start/… for the instance's own Home page (this week, approvals, numbers, news, tour) and its legal details,
 *   public under /oeffentlich/start/recht.
 * Velonify's side (Plattform → Instanzen) is in steuerung/instanzen.ts.
 */
export async function behandleSteuerung(methode: string, pfad: string, body: unknown, dienste: InstanzDienste): Promise<Antwort> {
  const jetzt = dienste.jetzt ?? (() => new Date());
  switch (pfad) {
    case '/steuerung/status':
      if (methode !== 'GET') return fehler(405, 'Nur GET.');
      return ok(await status(dienste, jetzt()));
    // The Bauplan calls it "funktionen", the hub "Bausteine": both names lead to the same switch.
    case '/steuerung/bausteine':
    case '/steuerung/funktionen': {
      if (methode !== 'POST') return fehler(405, 'Nur POST.');
      if (!istObjekt(body)) return fehler(400, 'Anfrage ohne Inhalt.');
      // Same check as POST /instanz/einstellungen with bausteine.
      if (!istObjekt(body.bausteine) || !Object.entries(body.bausteine).every(([b, an]) => istBaustein(b) && typeof an === 'boolean')) return fehler(400, 'Unbekannter Baustein.');
      const aktuell = instanzBausteine(await dienste.instanz.einstellungen());
      const bisher = Object.fromEntries(BAUSTEINE.map((b) => [b.id, aktuell.includes(b.id)]));
      await new PostgresStore(dienste.pool, () => 'steuerung@velonify.de').saveEinstellungen({ [INSTANZ_EINSTELLUNG.funktionen]: JSON.stringify({ ...bisher, ...body.bausteine }) });
      const einstellungen = await dienste.instanz.einstellungen();
      return ok({ bausteine: instanzBausteine(einstellungen), werkzeuge: instanzWerkzeuge(dienste.profil, einstellungen) });
    }
    case '/steuerung/neuigkeiten':
      if (methode !== 'GET') return fehler(405, 'Nur GET.');
      return ok({ neuigkeiten: await neuigkeiten(dienste.pool) });
    case '/steuerung/neuigkeit': {
      if (methode !== 'POST') return fehler(405, 'Nur POST.');
      if (!istObjekt(body)) return fehler(400, 'Anfrage ohne Inhalt.');
      const titel = typeof body.titel === 'string' ? body.titel.trim() : '';
      const inhalt = typeof body.text === 'string' ? body.text.trim() : '';
      const link = typeof body.link === 'string' ? body.link.trim() : '';
      const werkzeug = typeof body.werkzeug === 'string' ? body.werkzeug.trim() : '';
      if (!titel || titel.length > 120) return fehler(400, 'Der Titel braucht 1 bis 120 Zeichen.');
      if (!inhalt || inhalt.length > 2000) return fehler(400, 'Der Text braucht 1 bis 2000 Zeichen.');
      if (link && !/^(\/(?!\/)[^\s\\]*|https:\/\/[^\s\\]+)$/.test(link)) return fehler(400, 'Der Link ist ein Hub-Pfad wie /analytics oder eine https-Adresse.');
      if (werkzeug && !PROFIL_WERKZEUGE[dienste.profil].includes(werkzeug)) return fehler(400, 'Unbekanntes Werkzeug.');
      const von = typeof body.von === 'string' ? body.von.trim().slice(0, 120) : '';
      const { rows } = await dienste.pool.query<Record<string, unknown>>(
        'INSERT INTO instanz_neuigkeiten (id, titel, text, link, werkzeug, von) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [neueId('NH'), titel, inhalt, link || null, werkzeug || null, von || 'Velonify'],
      );
      return ok({ neuigkeit: zuNeuigkeit(rows[0]) });
    }
    case '/steuerung/neuigkeit/archivieren': {
      if (methode !== 'POST') return fehler(405, 'Nur POST.');
      if (!istObjekt(body) || typeof body.id !== 'string') return fehler(400, 'Neuigkeit fehlt.');
      const { rows } = await dienste.pool.query<Record<string, unknown>>('UPDATE instanz_neuigkeiten SET archiviert = true WHERE id = $1 RETURNING *', [body.id]);
      if (!rows[0]) return fehler(404, 'Unbekannte Neuigkeit.');
      return ok({ neuigkeit: zuNeuigkeit(rows[0]) });
    }
  }
  return fehler(404, `Unbekannte Route ${pfad}.`);
}

const zeit = (w: unknown) => (w ? new Date(w as string).toISOString() : '');
const text = (w: unknown) => (w === null || w === undefined ? '' : String(w));
const zahl = (w: unknown) => Number(w ?? 0);

export function zuNeuigkeit(z: Record<string, unknown>): InstanzNeuigkeit {
  return {
    id: text(z.id),
    titel: text(z.titel),
    text: text(z.text),
    link: text(z.link),
    werkzeug: text(z.werkzeug),
    am: zeit(z.am),
    von: text(z.von),
    archiviert: z.archiviert === true,
  };
}

async function neuigkeiten(db: Db): Promise<InstanzNeuigkeit[]> {
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM instanz_neuigkeiten ORDER BY am DESC LIMIT 100');
  return rows.map(zuNeuigkeit);
}

/** Counts and dates about the instance – never names, addresses, content or amounts. */
async function status(dienste: InstanzDienste, jetzt: Date): Promise<InstanzStatus> {
  const db = dienste.pool;
  const einstellungen = await dienste.instanz.einstellungen();
  const iso = jetzt.toISOString();
  const [zugaenge, rollen, kanaele, ki, speicher, news] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT count(*) FILTER (WHERE aktiv) AS aktiv, count(*) FILTER (WHERE NOT aktiv) AS inaktiv,
         count(*) FILTER (WHERE aktiv AND letzter_login > $1::timestamptz - interval '7 days') AS aktiv_7_tage,
         max(letzter_login) AS letzter_login
       FROM instanz_zugaenge`,
      [iso],
    ),
    db.query<{ rolle: string; n: string }>('SELECT rolle, count(*) AS n FROM instanz_zugaenge WHERE aktiv GROUP BY rolle ORDER BY rolle'),
    db.query<Record<string, unknown>>('SELECT plattform, status, beispiel, verbunden_am, letzte_abholung, fehler FROM kanal_konten ORDER BY plattform, id'),
    // The calendar month in Berlin, like the bill of Anthropic is read.
    db.query<Record<string, unknown>>(
      `SELECT modell, count(*) AS aufrufe, sum(tokens_ein) AS tokens_ein, sum(tokens_aus) AS tokens_aus
       FROM instanz_ki_nutzung
       WHERE am >= (date_trunc('month', $1::timestamptz AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin') AND am <= $1::timestamptz
       GROUP BY modell ORDER BY modell`,
      [iso],
    ),
    db.query<{ bytes: string }>('SELECT pg_database_size(current_database()) AS bytes'),
    db.query<{ n: string }>('SELECT count(*) AS n FROM instanz_neuigkeiten WHERE NOT archiviert'),
  ]);
  const z = zugaenge.rows[0] ?? {};
  const modelle = ki.rows.map((r) => ({ modell: text(r.modell), aufrufe: zahl(r.aufrufe), tokens_ein: zahl(r.tokens_ein), tokens_aus: zahl(r.tokens_aus) }));
  return {
    version: dienste.umgebung.wert('HUB_VERSION') ?? '',
    profil: dienste.profil,
    name: einstellungen[INSTANZ_EINSTELLUNG.name] ?? '',
    bausteine: instanzBausteine(einstellungen),
    werkzeuge: instanzWerkzeuge(dienste.profil, einstellungen),
    velonify_zugang: einstellungen[INSTANZ_EINSTELLUNG.velonifyZugang] !== 'aus',
    zugaenge: {
      aktiv: zahl(z.aktiv),
      inaktiv: zahl(z.inaktiv),
      rollen: Object.fromEntries(rollen.rows.map((r) => [r.rolle, zahl(r.n)])),
      aktiv_7_tage: zahl(z.aktiv_7_tage),
      letzter_login: zeit(z.letzter_login),
    },
    kanaele: kanaele.rows.map((k) => ({
      plattform: text(k.plattform),
      status: text(k.status),
      beispiel: k.beispiel === true,
      verbunden_am: zeit(k.verbunden_am),
      letzte_abholung: zeit(k.letzte_abholung),
      fehler: k.fehler ? 'Abruf fehlgeschlagen. Details im Kanalbereich der Instanz.' : '',
    })),
    ki: {
      monat: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit' }).format(jetzt),
      aufrufe: modelle.reduce((s, m) => s + m.aufrufe, 0),
      tokens_ein: modelle.reduce((s, m) => s + m.tokens_ein, 0),
      tokens_aus: modelle.reduce((s, m) => s + m.tokens_aus, 0),
      modelle,
    },
    speicher: { datenbank_bytes: zahl(speicher.rows[0]?.bytes) },
    neuigkeiten: zahl(news.rows[0]?.n),
    stand: iso,
  };
}

export const startModul: Modul = { praefix: 'start', routen: startRouten, oeffentlich: startOeffentlich };
