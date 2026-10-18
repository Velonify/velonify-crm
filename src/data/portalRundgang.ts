import { ValidationError } from './errors';
import type { PortalZugang } from './types';

/**
 * Tour and "Neu im Portal" of a contact. The portal shows the tour after the first login and new features (listed in
 * the portal's own code) once each; new features dated before the tour count as seen, so the tour covers them.
 */
export interface PortalRundgang {
  /** When the contact finished or skipped the tour (ISO); '' = still to show. */
  gesehen_am: string;
  /** Ids of the new features the contact has seen. */
  neuerungen: string[];
}

/** Ids of new features, as the portal names them (`2026-10-rundgang`). */
const NEUERUNG_ID = /^[a-z0-9][a-z0-9-]{0,59}$/;
/** Kept per contact; old ids drop out first (the portal only shows recent news anyway). */
export const MAX_NEUERUNGEN = 100;

export function rundgangVon(z: Pick<PortalZugang, 'rundgang_am' | 'neuerungen_gesehen'>): PortalRundgang {
  return {
    gesehen_am: z.rundgang_am ?? '',
    neuerungen: (z.neuerungen_gesehen ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}

/**
 * The changes for `POST /gesehen` (`{ rundgang?: true, neuerungen?: string[] }`): marks the tour and/or new features
 * as seen. Only adds, so two devices cannot undo each other.
 */
export function gesehenAenderungen(eingabe: Record<string, unknown>, zugang: Pick<PortalZugang, 'rundgang_am' | 'neuerungen_gesehen'>, jetzt: Date): Partial<Pick<PortalZugang, 'rundgang_am' | 'neuerungen_gesehen'>> {
  const { rundgang, neuerungen } = eingabe;
  if (rundgang !== undefined && rundgang !== true) throw new ValidationError('rundgang', 'rundgang darf nur true sein.');
  if (neuerungen !== undefined && (!Array.isArray(neuerungen) || neuerungen.length > 50 || !neuerungen.every((n) => typeof n === 'string' && NEUERUNG_ID.test(n)))) {
    throw new ValidationError('neuerungen', 'Unbekannte Neuerungen.');
  }
  if (rundgang !== true && !neuerungen?.length) throw new ValidationError('gesehen', 'Nichts zu speichern.');
  const changes: Partial<Pick<PortalZugang, 'rundgang_am' | 'neuerungen_gesehen'>> = {};
  if (rundgang === true) changes.rundgang_am = jetzt.toISOString();
  if (neuerungen?.length) {
    const alle = [...new Set([...rundgangVon(zugang).neuerungen, ...(neuerungen as string[])])];
    changes.neuerungen_gesehen = alle.slice(-MAX_NEUERUNGEN).join(',');
  }
  return changes;
}
