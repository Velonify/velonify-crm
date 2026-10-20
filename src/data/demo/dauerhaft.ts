import type { LeadFinderZustand } from './leadFinderDemo';
import { demoLeadFinder } from './leadFinderDemo';
import { createDemoBackend, stelleDemoHer, type DemoBackend, type DemoDaten } from './seed';
import { ladeGespeichert, speichere } from './speicher';

/** Raised when the shape of the sample data changes: older saved copies are then dropped. */
export const STAND_VERSION = 2;
/** Older copies start over, so the dates (all relative to the day of seeding) never look stale. */
const MAX_ALTER_MS = 14 * 86_400_000;
const WARTEN_MS = 400;

export interface DemoStand extends DemoDaten {
  version: number;
  gespeichert_am: string;
  leadFinder: LeadFinderZustand;
}

let aktiv: DemoBackend | null = null;
/** The running demo, for what reads it besides the hub's service (the client view). */
export const aktiveDemo = () => aktiv;

export function istGueltig(stand: Partial<DemoStand> | null, jetzt = Date.now()): stand is DemoStand {
  return !!stand && stand.version === STAND_VERSION && !!stand.sheets && jetzt - new Date(stand.gespeichert_am ?? 0).getTime() < MAX_ALTER_MS;
}

/**
 * The public demo: the visitor's saved copy if there is one, otherwise fresh sample data. Every change is written
 * back to the browser shortly after, and right away when the tab is hidden or closed.
 */
export async function starteDemo(currentUser: () => string): Promise<DemoBackend> {
  const gespeichert = await ladeGespeichert<DemoStand>();
  const leadFinder = demoLeadFinder();
  let backend: DemoBackend;
  if (istGueltig(gespeichert)) {
    backend = stelleDemoHer(currentUser, gespeichert);
    leadFinder.stelleHer(gespeichert.leadFinder);
  } else {
    backend = await createDemoBackend(currentUser, { schaufenster: true });
  }
  const { sheets, drive, calendar } = backend;
  const stand = (): DemoStand => ({
    version: STAND_VERSION,
    // A restored copy keeps the day it was seeded.
    gespeichert_am: istGueltig(gespeichert) ? gespeichert.gespeichert_am : new Date().toISOString(),
    sheets: sheets.zustand(),
    drive: drive.zustand(),
    kalender: calendar.events,
    leadFinder: leadFinder.zustand(),
  });

  let timer: number | undefined;
  const jetztSichern = () => {
    window.clearTimeout(timer);
    timer = undefined;
    void speichere(stand());
  };
  const spaeterSichern = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(jetztSichern, WARTEN_MS);
  };
  sheets.beiAenderung = drive.beiAenderung = calendar.beiAenderung = leadFinder.beiAenderung = spaeterSichern;
  const beimVerlassen = () => timer !== undefined && jetztSichern();
  window.addEventListener('pagehide', beimVerlassen);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && beimVerlassen());
  // Fresh sample data is saved at once, so the next visit starts without seeding.
  if (!istGueltig(gespeichert)) jetztSichern();
  aktiv = backend;
  return backend;
}
