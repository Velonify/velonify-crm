import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, PageHeader } from '../components/ui';
import type { MarktStatistik } from './api';
import { useAdminApi } from './PlattformPage';

/**
 * Admin: fills the Lead-Markt. The market pool (German Shopify shops from HTTP Archive) is rebuilt with each crawl;
 * "Auffüllen" checks the next shops live and keeps those with a contact in the Impressum.
 */
export function MarktVerwaltungPage() {
  const api = useAdminApi();
  const { show } = useToast();
  const [stat, setStat] = useState<MarktStatistik | null>(null);
  const [fehler, setFehler] = useState<unknown>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [anzahl, setAnzahl] = useState(20);
  const [nurHelpdesk, setNurHelpdesk] = useState(true);

  const laden = useCallback(async () => {
    try {
      setStat((await api.mandanten()).markt);
      setFehler(null);
    } catch (err) {
      setFehler(err);
    }
  }, [api]);
  useEffect(() => void laden(), [laden]);

  const los = async (was: string, arbeit: () => Promise<string>) => {
    setLaeuft(was);
    try {
      show(await arbeit());
      await laden();
    } catch (err) {
      show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setLaeuft(null);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Plattform"
        title="Lead-Markt"
        subtitle="Shopify-Shops für die Mandanten. Sie kommen nie mit Velonifys eigenen Leads in Konflikt: Der Lead-Finder sortiert Shopify aus, und Domains aus unserem CRM bleiben draußen."
        zahlen={
          stat
            ? [
                { label: 'Im Markt', wert: stat.gesamt },
                { label: 'Noch frei', wert: stat.frei, warn: stat.frei < 100 },
                { label: 'Mit Helpdesk', wert: stat.mit_helpdesk },
                { label: 'Freigeschaltet', wert: stat.vergeben },
                { label: 'Köder', wert: stat.koeder },
              ]
            : undefined
        }
      />
      {fehler ? <ErrorBox error={fehler} onRetry={() => void laden()} /> : null}
      <div className="grid-2">
        <Card title="Auffüllen">
          <p className="small">
            Prüft die nächsten Shopify-Shops live (Impressum, Technik, Branche mit Claude Haiku) und nimmt die mit Kontakt-E-Mail auf. 20 Shops dauern ein paar Minuten. Faustregel: pro Tester mindestens dreimal so viele freie Shops wie sein Kontingent.
          </p>
          <div className="filters">
            <select value={anzahl} onChange={(e) => setAnzahl(Number(e.target.value))} aria-label="Anzahl">
              {[10, 20, 40].map((n) => (
                <option key={n} value={n}>
                  {n} Shops
                </option>
              ))}
            </select>
            <label className="checkbox">
              <input type="checkbox" checked={nurHelpdesk} onChange={(e) => setNurHelpdesk(e.target.checked)} /> Nur Shops mit Helpdesk
            </label>
            <button
              type="button"
              className="button primary"
              disabled={laeuft !== null}
              onClick={() =>
                void los('fuellen', async () => {
                  const r = await api.fuelleMarkt(anzahl, nurHelpdesk);
                  return `${r.neu} Shops aufgenommen (${r.geprueft} geprüft, ${r.verworfen} ohne Kontakt oder nicht passend).`;
                })
              }
            >
              {laeuft === 'fuellen' ? 'Prüft Shops …' : 'Auffüllen'}
            </button>
          </div>
        </Card>
        <Card title="Markt-Pool neu aufbauen">
          <p className="small">Liest alle deutschen Shopify-Shops aus dem neuesten HTTP-Archive-Crawl (BigQuery, etwa 9 GB, 1–2 Minuten). Einmal im Monat reicht, nach dem Crawl des Lead-Finders.</p>
          <button
            type="button"
            className="button"
            disabled={laeuft !== null}
            onClick={() =>
              void los('pool', async () => {
                const r = await api.marktPool();
                return `Markt-Pool: ${r.shops.toLocaleString('de-DE')} Shopify-Shops, ${r.mit_helpdesk.toLocaleString('de-DE')} mit Helpdesk (Crawl ${r.crawl_datum}).`;
              })
            }
          >
            {laeuft === 'pool' ? 'Baut Pool …' : 'Pool neu aufbauen'}
          </button>
        </Card>
      </div>
    </div>
  );
}
