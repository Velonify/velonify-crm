import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WerkzeugIcon } from '../components/Icons';
import { useToast } from '../components/Toasts';
import { ErrorBox, PageHeader } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { BRANCHEN, brancheLabel } from '../data/branchen';
import { PlattformApiFehler, type MarktFilter, type MarktSeite } from './api';
import { useMandant } from './MandantContext';
import { BuchenDialog } from './MandantLeiste';
import { HELPDESK_AUSWAHL, ladezeitLabel, regionLabel, REGIONEN, reichweiteLabel, zahlartLabel } from './marktText';

/**
 * Lead-Markt of a tenant: anonymous previews of checked Shopify shops, 25 per page from the server. "Freischalten"
 * takes one lead of the quota and copies the shop with its contact into the tenant's CRM.
 */
export function LeadMarktPage() {
  const { api, sicht, neuLaden, zeigeBedingungen } = useMandant();
  const { refresh } = useCrm();
  const { show } = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<MarktFilter>({ seite: 1 });
  const [seite, setSeite] = useState<MarktSeite | null>(null);
  const [fehler, setFehler] = useState<unknown>(null);
  const [laedt, setLaedt] = useState(true);
  const [frei, setFrei] = useState<string | null>(null);
  const [buchen, setBuchen] = useState<string | null>(null);

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      setSeite(await api.markt(filter));
      setFehler(null);
    } catch (err) {
      setFehler(err);
    } finally {
      setLaedt(false);
    }
  }, [api, filter]);
  useEffect(() => void laden(), [laden]);

  if (!sicht) return null;
  const { leads, erfolge, zugriff, mandant } = sicht;
  const uebrig = Math.max(0, leads.kontingent - leads.verbraucht);
  const imTest = mandant.status === 'test';
  const kannFreischalten = zugriff === 'voll' && uebrig > 0;

  const setze = (aenderung: Partial<MarktFilter>) => setFilter((f) => ({ ...f, ...aenderung, seite: aenderung.seite ?? 1 }));

  const freischalten = async (id: string) => {
    if (!mandant.bedingungen_am) {
      zeigeBedingungen(true);
      return;
    }
    setFrei(id);
    try {
      const { firma_id, neu } = await api.freischalten(id);
      await Promise.all([neuLaden(), refresh()]);
      show(neu ? 'Lead freigeschaltet und im CRM angelegt.' : 'Den hattet ihr schon freigeschaltet.', 'success', { label: 'Firma öffnen', run: () => navigate(`/crm/firmen/${firma_id}`) });
      await laden();
    } catch (err) {
      if (err instanceof PlattformApiFehler && err.status === 402) setBuchen(err.message);
      else if (err instanceof PlattformApiFehler && err.status === 409) zeigeBedingungen(true);
      else show(err instanceof Error ? err.message : String(err), 'error');
      await laden();
    } finally {
      setFrei(null);
    }
  };

  return (
    <div className="page lead-markt">
      <PageHeader
        eyebrow="Lead-Markt"
        title="Geprüfte Shopify-Shops"
        subtitle="Jeder Shop ist live geprüft: Impressum mit Kontakt, Helpdesk, Technik und Reichweite. Name und Kontakt seht ihr nach dem Freischalten, dann liegt der Shop mit Deal in eurem CRM. Jeder Lead geht nur an ein Team."
        zahlen={[
          { label: imTest ? 'Leads im Test' : 'Leads diesen Monat', wert: `${uebrig} von ${leads.kontingent} frei`, warn: uebrig === 0 },
          { label: 'Shops im Markt', wert: seite ? seite.gesamt.toLocaleString('de-DE') : '…' },
          { label: 'Gespräche daraus', wert: erfolge.gespraeche },
        ]}
      />

      {erfolge.gespraeche > 0 && (
        <section className="card erfolg-karte">
          <p>
            <strong>
              {erfolge.gespraeche} {erfolge.gespraeche === 1 ? 'Gespräch' : 'Gespräche'}
              {erfolge.angebote ? `, ${erfolge.angebote} ${erfolge.angebote === 1 ? 'Angebot' : 'Angebote'}` : ''}
              {erfolge.gewonnen ? `, ${erfolge.gewonnen} gewonnen` : ''}
            </strong>{' '}
            aus {erfolge.leads} freigeschalteten Leads.
            {imTest && ' Mit Pro kommen jeden Monat 150 neue dazu.'}
          </p>
          {imTest && !mandant.buchung_am && (
            <button type="button" className="button primary" onClick={() => setBuchen('')}>
              Weiter mit Pro
            </button>
          )}
        </section>
      )}

      {zugriff !== 'voll' ? (
        <p className="alert">Der Test ist vorbei: Ihr seht den Markt weiter, Freischalten geht wieder nach der Buchung.</p>
      ) : uebrig === 0 ? (
        <div className="alert kontingent-leer">
          <span>Alle {leads.kontingent} Leads sind freigeschaltet. {imTest ? 'Mit Pro bekommt ihr jeden Monat 150 neue, mit Agentur 400.' : 'Im nächsten Monat gibt es neue, oder ihr wechselt das Paket.'}</span>
          <button type="button" className="button primary small" onClick={() => setBuchen('')}>
            Mehr Leads
          </button>
        </div>
      ) : null}

      <div className="filters" role="search">
        <select value={filter.branche ?? ''} onChange={(e) => setze({ branche: e.target.value || undefined })} aria-label="Branche">
          <option value="">Alle Branchen</option>
          {BRANCHEN.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <select value={filter.plz_bereich ?? ''} onChange={(e) => setze({ plz_bereich: e.target.value || undefined })} aria-label="Region">
          <option value="">Ganz Deutschland</option>
          {Object.entries(REGIONEN).map(([plz, name]) => (
            <option key={plz} value={plz}>
              {plz}… {name}
            </option>
          ))}
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={filter.nur_helpdesk ?? false} onChange={(e) => setze({ nur_helpdesk: e.target.checked || undefined })} /> Nur mit Helpdesk
        </label>
        {imTest ? (
          <button type="button" className="button subtle small gesperrt-filter" onClick={() => setBuchen('Den Filter nach einem bestimmten Helpdesk gibt es ab Pro.')} title="Ab Pro">
            <WerkzeugIcon id="schloss" /> Bestimmter Helpdesk
          </button>
        ) : (
          <select value={filter.helpdesk ?? ''} onChange={(e) => setze({ helpdesk: e.target.value || undefined })} aria-label="Helpdesk">
            <option value="">Jeder Helpdesk</option>
            {HELPDESK_AUSWAHL.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        )}
      </div>

      {fehler ? (
        <ErrorBox error={fehler} onRetry={() => void laden()} />
      ) : !seite ? (
        <p className="muted">Lädt …</p>
      ) : seite.eintraege.length === 0 ? (
        <p className="muted">Keine Shops für diese Auswahl. Nehmt einen Filter heraus oder schaut in ein paar Tagen wieder rein, der Markt wird laufend ergänzt.</p>
      ) : (
        <div className="table-wrap">
          <table className="table compact markt-tabelle">
            <thead>
              <tr>
                <th>Branche &amp; Region</th>
                <th>Reichweite</th>
                <th>Helpdesk</th>
                <th>Technik</th>
                <th aria-label="Freischalten" />
              </tr>
            </thead>
            <tbody aria-busy={laedt}>
              {seite.eintraege.map(({ id, vorschau: v }) => (
                <tr key={id}>
                  <td>
                    <strong>{v.branche ? brancheLabel(v.branche) : 'Branche offen'}</strong>
                    <div className="muted small">
                      {regionLabel(v.plz_bereich)}
                      {v.land && v.land !== 'DE' ? ` · ${v.land}` : ''}
                    </div>
                  </td>
                  <td>
                    {reichweiteLabel(v.rang_de)}
                    <div className="muted small">
                      {v.produkte ? `~${v.produkte.toLocaleString('de-DE')} Produkte · ` : ''}Ladezeit {ladezeitLabel(v.lcp_ms)}
                    </div>
                  </td>
                  <td>
                    {v.helpdesk.length ? (
                      <span className="chips">
                        {v.helpdesk.map((h) => (
                          <span key={h} className="chip is-active">
                            {h}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="muted small">keiner erkannt</span>
                    )}
                  </td>
                  <td className="small">
                    {v.shopify_plus ? <strong>Shopify Plus</strong> : 'Shopify'}
                    {v.email_tools.length > 0 && <div className="muted">{v.email_tools.join(', ')}</div>}
                    {v.zahlarten.length > 0 && <div className="muted">{v.zahlarten.slice(0, 4).map(zahlartLabel).join(', ')}</div>}
                  </td>
                  <td className="markt-aktion">
                    <button type="button" className="button small primary" disabled={!kannFreischalten || frei !== null} onClick={() => void freischalten(id)}>
                      {frei === id ? 'Schaltet frei …' : 'Freischalten'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {seite && seite.seiten > 1 && (
        <nav className="form-actions" aria-label="Seiten">
          <button type="button" className="button small" disabled={seite.seite <= 1} onClick={() => setze({ seite: seite.seite - 1 })}>
            ← Zurück
          </button>
          <span className="muted small">
            Seite {seite.seite} von {seite.seiten}
          </span>
          <button type="button" className="button small" disabled={seite.seite >= seite.seiten} onClick={() => setze({ seite: seite.seite + 1 })}>
            Weiter →
          </button>
        </nav>
      )}

      <p className="muted small">
        Freigeschaltete Leads findet ihr im <Link to="/crm/firmen">CRM unter Firmen</Link> mit dem Tag „Lead-Markt“.
      </p>
      {buchen !== null && <BuchenDialog grund={buchen || undefined} onClose={() => setBuchen(null)} />}
    </div>
  );
}
