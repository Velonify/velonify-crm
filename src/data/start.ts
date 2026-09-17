import { FIRMEN_LINKS, SLACK_STANDARD_URL } from './constants';
import { offeneDeals } from './selectors';
import type { Database, Einstellungen, Firma } from './types';

export interface FirmenLink {
  label: string;
  url: string;
}

const istWebadresse = (url: string) => /^https:\/\/\S+$/i.test(url);

/** The company links that are set up, in a fixed order. Slack falls back to the workspace address. */
export function firmenLinks(einstellungen: Einstellungen): FirmenLink[] {
  return FIRMEN_LINKS.map((l) => ({
    label: l.label,
    url: (einstellungen[l.einstellung] ?? '').trim() || (l.einstellung === 'link_slack' ? SLACK_STANDARD_URL : ''),
  })).filter((l) => istWebadresse(l.url));
}

/** Opens a channel by name in the Slack app or browser. */
export function slackChannelUrl(einstellungen: Einstellungen, channel: string): string {
  const basis = (einstellungen.link_slack ?? '').trim() || SLACK_STANDARD_URL;
  return `${basis.replace(/\/+$/, '')}/app_redirect?channel=${encodeURIComponent(channel.replace(/^#/, ''))}`;
}

export interface Schnellzugriff {
  firma: Firma;
  /** "kunde", or "angebot" for a lead with an open offer */
  art: 'kunde' | 'angebot';
}

/** Customers, then leads with an open offer – the firms people work on day to day. Sorted by Kürzel, then name. */
export function schnellzugriff(db: Database): Schnellzugriff[] {
  const mitAngebot = new Set(offeneDeals(db.deals).filter((d) => d.phase === 'angebot').map((d) => d.firma_id));
  const sortierung = (a: Firma, b: Firma) => (a.kuerzel || '~').localeCompare(b.kuerzel || '~') || a.name.localeCompare(b.name, 'de');
  const aktiv = db.firmen.filter((f) => !f.archiviert).sort(sortierung);
  return [
    ...aktiv.filter((f) => f.status === 'kunde').map((firma) => ({ firma, art: 'kunde' as const })),
    ...aktiv.filter((f) => f.status === 'lead' && mitAngebot.has(f.id)).map((firma) => ({ firma, art: 'angebot' as const })),
  ];
}
