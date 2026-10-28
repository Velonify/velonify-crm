import type { Antwort } from '../routen';
import { type Modul, fehler } from './modul';
import { anfrageOeffentlich, anfragenRouten } from './kooperationen/anfragen';
import { Eingabefehler, heuteIn } from './kooperationen/daten';
import { einnahmenRouten } from './kooperationen/einnahmen';
import { holeKurse, type Holen } from './kooperationen/kurse';
import { mediakitOeffentlich, mediakitRouten } from './kooperationen/mediakit';
import { berichtOeffentlich, reportingRouten } from './kooperationen/reportings';
import { uebersichtRouten } from './kooperationen/uebersicht';

async function mitEingabefehler(arbeit: () => Promise<Antwort | null>): Promise<Antwort | null> {
  try { return await arbeit(); }
  catch (err) {
    if (err instanceof Eingabefehler) return fehler(err.status, err.message);
    throw err;
  }
}

/** All external requests can be replaced in tests. Public endpoints expose only published data. */
export function kooperationsModule(holen?: Holen): [Modul, Modul] {
  return [{
    praefix: 'kooperationen',
    routen: (m, p, b, ctx) => mitEingabefehler(async () => {
      const heute = heuteIn(ctx.jetzt());
      return await anfragenRouten(m, p, b, ctx, heute)
        ?? await mediakitRouten(m, p, b, ctx)
        ?? await reportingRouten(m, p, b, ctx, heute)
        ?? await uebersichtRouten(m, p, b, ctx);
    }),
    oeffentlich: (m, p, b, ctx) => mitEingabefehler(async () => {
      if (p === '/oeffentlich/kooperationen/anfrage') return anfrageOeffentlich(m, b, ctx);
      if (p === '/oeffentlich/kooperationen/mediakit') return mediakitOeffentlich(m, ctx);
      const bericht = /^\/oeffentlich\/kooperationen\/bericht\/([A-Za-z0-9_-]+)$/.exec(p);
      return bericht ? berichtOeffentlich(m, bericht[1], ctx) : null;
    }),
  }, {
    praefix: 'einnahmen',
    routen: (m, p, b, ctx) => mitEingabefehler(() => einnahmenRouten(m, p, b, ctx, holen)),
    takte: { kurse: async ctx => ctx.bausteine.includes('einnahmen')
      ? holeKurse(ctx.pool, holen, ctx.jetzt()) : { uebersprungen: true } },
  }];
}

export const [kooperationenModul, einnahmenModul] = kooperationsModule();
