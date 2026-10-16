import { pruefeBerechtigung, kundensicht, type PortalDatei } from '../../../src/data/portalApi';
import { einstellungenVon, ereignisseSeit, hinweisNachricht, updateFaellig, updateNachricht, wege, type Kanal, type Nachricht } from '../../../src/data/portalBenachrichtigung';
import type { Store } from '../../../src/data/store';
import type { Firma, PortalZugang } from '../../../src/data/types';

export interface VersandAbhaengigkeiten {
  store: Store;
  /** Files of the client share of a firm (empty when the folder is missing). */
  dateien: (firma: Firma) => Promise<PortalDatei[]>;
  sendeMail: (an: string, betreff: string, text: string, html: string) => Promise<void>;
  /** Posts into a Slack channel (name without #); null when no Slack bot is set up. */
  slack: ((channel: string, text: string) => Promise<void>) | null;
  portalUrl: string;
  teamDomain: string;
  jetzt: Date;
}

export interface VersandBericht {
  hinweise: number;
  updates: number;
  fehler: number;
}

/**
 * One run of the scheduler (every 15 minutes): instant notifications for everything since the last run, and the
 * summaries that are due. Each login remembers how far it got; a failed send is tried again next run. Slack goes
 * once per client and run, however many contacts chose it.
 */
export async function versende(d: VersandAbhaengigkeiten): Promise<VersandBericht> {
  const { store, jetzt } = d;
  const bis = jetzt.toISOString();
  const [db, portal, kunden, todos] = await Promise.all([store.load(), store.loadPortalDaten(), store.loadKundenDaten(), store.loadTodoDaten()]);
  const bericht: VersandBericht = { hinweise: 0, updates: 0, fehler: 0 };
  const dateienCache = new Map<string, Promise<PortalDatei[]>>();
  const slackGesendet = new Set<string>();
  const aenderungen: { id: string; changes: Partial<PortalZugang> }[] = [];

  const sende = async (n: Nachricht, kanal: Kanal, an: string, firma: Firma, slackSchluessel: string): Promise<boolean> => {
    const channel = firma.slack_channel.trim().replace(/^#/, '');
    const weg = wege(kanal, !!channel && !!d.slack);
    let ok = true;
    if (weg.slack && !slackGesendet.has(slackSchluessel)) {
      try {
        await d.slack!(channel, n.slack);
        slackGesendet.add(slackSchluessel);
      } catch (err) {
        console.error(`Slack-Versand an #${channel} fehlgeschlagen, schicke E-Mail`, err);
        bericht.fehler++;
        // The client should hear about it anyway.
        weg.email = true;
      }
    }
    if (weg.email) {
      try {
        await d.sendeMail(an, n.betreff, n.text, n.html);
      } catch (err) {
        console.error('Mail-Versand fehlgeschlagen', err);
        bericht.fehler++;
        ok = false;
      }
    }
    return ok;
  };

  for (const zugang of portal.zugaenge) {
    if (!zugang.aktiv) continue;
    const berechtigung = pruefeBerechtigung(db, portal, zugang.kontakt_id, zugang.firma_id);
    if (!berechtigung) continue;
    const { firma, kontakt } = berechtigung;
    const einstellungen = einstellungenVon(zugang);
    const changes: Partial<PortalZugang> = {};
    if (!dateienCache.has(firma.id)) {
      dateienCache.set(
        firma.id,
        d.dateien(firma).catch((err) => {
          console.error(`Dateien von ${firma.id} nicht lesbar`, err);
          return [];
        }),
      );
    }
    const dateien = await dateienCache.get(firma.id)!;
    const basis = { berechtigung, kunden, todos, portal, dateien, teamDomain: d.teamDomain };

    // Instant notifications: the first run only starts the clock, so nobody gets the whole history.
    if (!zugang.hinweise_bis) {
      changes.hinweise_bis = bis;
    } else {
      const ereignisse = ereignisseSeit({ ...basis, seit: zugang.hinweise_bis, bis });
      const ok = ereignisse.length === 0 || (await sende(hinweisNachricht({ ereignisse, vorname: kontakt.vorname, firmaName: firma.name, portalUrl: d.portalUrl }), einstellungen.kanal_hinweise, kontakt.email.trim(), firma, `${firma.id}|hinweise`));
      if (ok) changes.hinweise_bis = bis;
      if (ok && ereignisse.length) bericht.hinweise++;
    }

    if (einstellungen.updates !== 'aus') {
      const faellig = updateFaellig(einstellungen.updates, zugang.update_am, jetzt);
      if (faellig.faellig) {
        const sicht = kundensicht({ ...basis, db, teamDomain: d.teamDomain });
        const nachricht = updateNachricht({ rhythmus: einstellungen.updates, sicht, ereignisse: ereignisseSeit({ ...basis, seit: faellig.seit, bis }), seit: faellig.seit, portalUrl: d.portalUrl });
        const ok = !nachricht || (await sende(nachricht, einstellungen.kanal_updates, kontakt.email.trim(), firma, `${firma.id}|update|${einstellungen.updates}`));
        if (ok) changes.update_am = bis;
        if (ok && nachricht) bericht.updates++;
      }
    }
    if (Object.keys(changes).length) aenderungen.push({ id: zugang.id, changes });
  }
  if (aenderungen.length) await store.update('portal_zugaenge', aenderungen);
  return bericht;
}

/** chat.postMessage of the "Velonify Hub" app; the bot has to be a member of the client's channel. */
export function slackPoster(token: string, fetchFn: typeof fetch = fetch): (channel: string, text: string) => Promise<void> {
  return async (channel, text) => {
    const antwort = await fetchFn('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel: /^[CG][A-Z0-9]{6,}$/.test(channel) ? channel : `#${channel}`, text, unfurl_links: false, unfurl_media: false }),
    });
    const daten = (await antwort.json()) as { ok: boolean; error?: string };
    if (!daten.ok) throw new Error(`Slack chat.postMessage: ${daten.error ?? antwort.status}`);
  };
}
