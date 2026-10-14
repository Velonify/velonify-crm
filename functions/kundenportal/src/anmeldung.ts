import { LINK_GUELTIG_MS, SITZUNG_GUELTIG_MS, type Berechtigung } from '../../../src/data/portalApi';
import type { Siegel } from './siegel';

/**
 * A login link names the contact and the last login at the time it was sent. Using it updates the last login, so the
 * same link (and any older one) stops working: single use without a token table.
 */
interface LinkInhalt {
  k: string;
  f: string;
  z: string;
  exp: number;
}

export interface SitzungInhalt {
  k: string;
  f: string;
  exp: number;
}

export function erstelleLink(siegel: Siegel, b: Berechtigung, jetzt: number): string {
  const inhalt: LinkInhalt = { k: b.kontakt.id, f: b.firma.id, z: b.zugang.zuletzt_am, exp: jetzt + LINK_GUELTIG_MS };
  return siegel.versiegle('link', inhalt);
}

/** The contact and firm of a valid, unexpired link; `zuletzt` must still be the last login of the contact. */
export function oeffneLink(siegel: Siegel, token: string, jetzt: number): LinkInhalt | null {
  const inhalt = siegel.oeffne<LinkInhalt>('link', token);
  if (!inhalt || typeof inhalt.exp !== 'number' || inhalt.exp < jetzt) return null;
  return inhalt;
}

export function linkNochGueltig(inhalt: LinkInhalt, b: Berechtigung): boolean {
  return inhalt.k === b.kontakt.id && inhalt.f === b.firma.id && inhalt.z === b.zugang.zuletzt_am;
}

export function erstelleSitzung(siegel: Siegel, b: Berechtigung, jetzt: number): { sitzung: string; gueltig_bis: string } {
  const exp = jetzt + SITZUNG_GUELTIG_MS;
  return { sitzung: siegel.versiegle('sitzung', { k: b.kontakt.id, f: b.firma.id, exp } satisfies SitzungInhalt), gueltig_bis: new Date(exp).toISOString() };
}

export function oeffneSitzung(siegel: Siegel, token: string, jetzt: number): SitzungInhalt | null {
  const inhalt = siegel.oeffne<SitzungInhalt>('sitzung', token);
  if (!inhalt || typeof inhalt.exp !== 'number' || inhalt.exp < jetzt) return null;
  return inhalt;
}

/** Sliding-window limit per key; counts per instance, which is enough to stop mail bombing and guessing. */
export class Begrenzer {
  private readonly treffer = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly fensterMs: number,
  ) {}

  erlaubt(schluessel: string, jetzt = Date.now()): boolean {
    const juengste = (this.treffer.get(schluessel) ?? []).filter((t) => t > jetzt - this.fensterMs);
    if (juengste.length >= this.max) {
      this.treffer.set(schluessel, juengste);
      return false;
    }
    juengste.push(jetzt);
    this.treffer.set(schluessel, juengste);
    if (this.treffer.size > 10_000) this.treffer.clear();
    return true;
  }
}
