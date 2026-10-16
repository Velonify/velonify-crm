// Node only (crm-api, crm-mcp): sends @-mentions as direct messages from the Velonify Slack app.
import { ART_LABEL } from './erwaehnungen';
import { findeTeamMitglied } from './selectors';
import type { Erwaehnung } from './types';

export interface SlackKonfig {
  /** Bot token of the Slack app (xoxb-…), scopes chat:write, users:read and users:read.email. */
  token: string;
  /** Address of the hub, e.g. https://crm.velonify.de */
  hub: string;
  /** Address → team name for people the name matching cannot place ("lukas@velonify.de" → "Lugge"), like TEAM_ZUORDNUNG. */
  teamZuordnung?: ReadonlyMap<string, string>;
  fetch?: typeof fetch;
}

interface SlackNutzer {
  id: string;
  deleted?: boolean;
  is_bot?: boolean;
  real_name?: string;
  profile?: { email?: string; real_name?: string; display_name?: string; first_name?: string };
}

// Slack's member list changes rarely; one read per half hour and instance is plenty.
const LISTE_GILT_MS = 30 * 60_000;

/** "&", "<" and ">" are control characters in Slack's mrkdwn. */
const sicher = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Who a team name is in Slack: the address from the fixed mapping first, else a member whose name or address the hub's
 * own matching ties to that team name ("Julian Meyer", julian@…).
 */
export function slackNutzerFuer(person: string, nutzer: readonly SlackNutzer[], zuordnung: ReadonlyMap<string, string> = new Map()): SlackNutzer | undefined {
  const aktiv = nutzer.filter((n) => !n.deleted && !n.is_bot && n.id !== 'USLACKBOT');
  const adresse = [...zuordnung].find(([, name]) => name === person)?.[0];
  if (adresse) {
    const treffer = aktiv.find((n) => n.profile?.email?.toLowerCase() === adresse);
    if (treffer) return treffer;
  }
  return aktiv.find((n) => {
    const name = n.profile?.real_name || n.real_name || n.profile?.display_name || '';
    return findeTeamMitglied([person], name, n.profile?.email ?? '') === person;
  });
}

export function slackText(e: Erwaehnung, autor: string, hub: string): string {
  const link = `${hub.replace(/\/$/, '')}/#${e.link}`;
  return [
    `*${sicher(autor)}* hat dich erwähnt · ${ART_LABEL[e.art] ?? e.art}: *${sicher(e.titel)}*`,
    `> ${sicher(e.auszug).replace(/\n/g, '\n> ')}`,
    `<${link}|Im Velonify Hub öffnen>`,
  ].join('\n');
}

/** Returns the hook for CrmService/crm-api: one direct message per mention; people not found in Slack are skipped. */
export function slackBenachrichtiger(konfig: SlackKonfig): (erwaehnungen: Erwaehnung[]) => Promise<void> {
  const holen = konfig.fetch ?? fetch;
  const zuordnung = konfig.teamZuordnung ?? new Map<string, string>();
  let liste: { nutzer: SlackNutzer[]; am: number } | null = null;

  const slack = async <T>(methode: string, body?: Record<string, unknown>): Promise<T> => {
    const antwort = await holen(`https://slack.com/api/${methode}`, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${konfig.token}`, ...(body ? { 'content-type': 'application/json; charset=utf-8' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const daten = (await antwort.json()) as { ok: boolean; error?: string } & T;
    if (!daten.ok) throw new Error(`Slack ${methode}: ${daten.error ?? antwort.status}`);
    return daten;
  };

  const nutzer = async (): Promise<SlackNutzer[]> => {
    if (liste && Date.now() - liste.am < LISTE_GILT_MS) return liste.nutzer;
    const alle: SlackNutzer[] = [];
    let cursor = '';
    do {
      const seite = await slack<{ members: SlackNutzer[]; response_metadata?: { next_cursor?: string } }>(`users.list?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      alle.push(...seite.members);
      cursor = seite.response_metadata?.next_cursor ?? '';
    } while (cursor);
    liste = { nutzer: alle, am: Date.now() };
    return alle;
  };

  return async (erwaehnungen) => {
    const gueltig = erwaehnungen.filter((e) => e.person && e.link?.startsWith('/'));
    if (gueltig.length === 0) return;
    const alle = await nutzer();
    for (const e of gueltig) {
      const ziel = slackNutzerFuer(e.person, alle, zuordnung);
      if (!ziel) {
        console.warn(`Slack: niemand für „${e.person}“ gefunden`);
        continue;
      }
      const von = e.von.toLowerCase();
      const autorNutzer = alle.find((n) => n.profile?.email?.toLowerCase() === von);
      // The Slack name ("Lukas"), not the hub's team name: Slack is shared with people outside the hub.
      const autor = autorNutzer?.profile?.first_name || autorNutzer?.profile?.real_name || zuordnung.get(von) || von.split('@')[0];
      await slack('chat.postMessage', { channel: ziel.id, text: slackText(e, autor, konfig.hub), unfurl_links: false, unfurl_media: false });
    }
  };
}
