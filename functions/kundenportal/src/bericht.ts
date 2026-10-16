import { ID_PREFIX, newId } from '../../../src/data/ids';
import { berichtInhalt, berichtsMonat, inBerichtsFenster, liesBericht, monatsZeitraum, type BerichtDaten } from '../../../src/data/monatsbericht';
import type { Store } from '../../../src/data/store';
import { liesDaten, type TrackingDaten } from '../../../src/data/tracking';
import type { KundenBericht } from '../../../src/data/types';
import { holeKennzahlen, type KennzahlenAbhaengigkeiten } from './kennzahlen';

export interface BerichtErgebnis {
  neu: number;
  aktualisiert: number;
  fehler: number;
}

/**
 * Drafts the monthly report of every client with the switch on (or of one client), or recalculates the draft that
 * is there. Released reports stay as they are. The scheduler does it only in the first days of the next month, when
 * Search Console has caught up; the hub ("Entwurf erstellen" / "Neu berechnen") at any time for a finished month.
 */
export async function erstelleBerichte(store: Store, d: KennzahlenAbhaengigkeiten, opt: { firmaId?: string; monat?: string } = {}): Promise<BerichtErgebnis> {
  const ergebnis: BerichtErgebnis = { neu: 0, aktualisiert: 0, fehler: 0 };
  const monat = opt.monat ?? berichtsMonat(d.jetzt);
  if (!opt.firmaId && !inBerichtsFenster(monat, d.jetzt)) return ergebnis;

  const [portal, todos] = await Promise.all([store.loadPortalDaten(), store.loadTodoDaten()]);
  const jetzt = d.jetzt.toISOString();
  const neu: KundenBericht[] = [];
  const aenderungen: { id: string; changes: Partial<KundenBericht> }[] = [];

  for (const t of portal.tracking.filter((x) => x.monatsbericht && (!opt.firmaId || x.firma_id === opt.firmaId))) {
    const vorhanden = (portal.berichte ?? []).find((b) => b.firma_id === t.firma_id && b.monat === monat);
    if (vorhanden?.status === 'freigegeben') continue;
    // PageSpeed is a measurement of now, not of a month: the report takes the last one of the tracking hub.
    const { daten: zahlen, fehler } = await holeKennzahlen({ ...t, pagespeed_url: '' }, { ...d, zeitraum: monatsZeitraum(monat) });
    const alt = liesBericht(vorhanden)?.zahlen ?? {};
    const speed = liesDaten(t)?.pagespeed;
    const alleZahlen: TrackingDaten = {
      ...((zahlen.ga4 ?? alt.ga4) && { ga4: zahlen.ga4 ?? alt.ga4 }),
      ...((zahlen.gsc ?? alt.gsc) && { gsc: zahlen.gsc ?? alt.gsc }),
      ...(speed && { pagespeed: speed }),
    };
    const daten: BerichtDaten = {
      zahlen: alleZahlen,
      ...berichtInhalt({ firmaId: t.firma_id, monat, todos, portal }),
      stand_am: jetzt,
      ...(fehler.length ? { fehler } : {}),
    };
    ergebnis.fehler += fehler.length;
    if (vorhanden) {
      aenderungen.push({ id: vorhanden.id, changes: { daten: JSON.stringify(daten), geaendert_am: jetzt, geaendert_von: 'kundenportal' } });
      ergebnis.aktualisiert++;
    } else {
      neu.push({
        id: newId(ID_PREFIX.kunden_berichte),
        firma_id: t.firma_id,
        monat,
        status: 'entwurf',
        kommentar: '',
        daten: JSON.stringify(daten),
        freigegeben_am: '',
        freigegeben_von: '',
        erstellt_am: jetzt,
        erstellt_von: 'kundenportal',
        geaendert_am: jetzt,
        geaendert_von: 'kundenportal',
      });
      ergebnis.neu++;
    }
  }
  if (neu.length) await store.insert('kunden_berichte', neu);
  if (aenderungen.length) await store.update('kunden_berichte', aenderungen);
  return ergebnis;
}
