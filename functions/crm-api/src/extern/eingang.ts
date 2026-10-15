import type { DbPool } from '../../../../src/data/postgres/postgresStore';
import { einfuegen, ergebnis, feld, neueId, type Ergebnis } from './tabelle';

const MAX_LAENGE = 4000;

/** "velonify.de" instead of the bare Netlify address, so the CRM shows where the inquiry came from. */
function herkunft(einsendung: Record<string, unknown>): string {
  const treffer = /^https?:\/\/([^/]+)/.exec(String(einsendung.site_url ?? ''));
  return treffer ? treffer[1].replace(/^www\./, '') : 'Website';
}

const kuerze = (text: string) => (text.length > MAX_LAENGE ? `${text.slice(0, MAX_LAENGE)} […]` : text);

/**
 * Inquiry from the contact form on velonify.de (former apps-script/eingang): one row in `eingang`, shown in the hub
 * under Anfragen. The website's submission-created function posts the Netlify submission here.
 */
export async function nimmAnfrage(db: DbPool, koerper: unknown): Promise<Ergebnis> {
  const k = (koerper ?? {}) as Record<string, unknown>;
  const einsendung = ((k.payload as Record<string, unknown>) ?? k) as Record<string, unknown>;
  const felder = (einsendung.data ?? {}) as Record<string, unknown>;
  // The honeypot is only visible to bots.
  if (feld(felder, 'bot-field')) return ergebnis(200, 'Ignoriert.');
  const email = feld(felder, 'email', 1e6);
  if (!email) return ergebnis(400, 'Ohne E-Mail-Adresse fangen wir nichts an.');
  const jetzt = new Date().toISOString();
  await db.transaktion(async (tx) => {
    await tx.query(`SELECT set_config('app.person', 'Website', true)`);
    await einfuegen(tx, 'eingang', {
      id: neueId('EA'),
      eingegangen_am: String(einsendung.created_at ?? '') || jetzt,
      quelle: herkunft(einsendung),
      sprache: feld(felder, 'sprache') || 'de',
      name: kuerze(feld(felder, 'name', 1e6)),
      email: kuerze(email),
      shop: kuerze(feld(felder, 'shop', 1e6)),
      themen: kuerze(feld(felder, 'themen', 1e6)),
      nachricht: kuerze(feld(felder, 'nachricht', 1e6)),
      status: 'neu',
      erstellt_am: jetzt,
      erstellt_von: 'Website',
      geaendert_am: jetzt,
      geaendert_von: 'Website',
    });
  });
  return ergebnis(200, 'Gespeichert.');
}
