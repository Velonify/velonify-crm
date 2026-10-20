import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AKTIVITAET_LABEL, PHASEN, isAbgeschlossen, phaseLabel, statusLabel } from '../data/constants';
import { useCrm } from '../data/CrmContext';
import { isoDate } from '../data/ids';
import { kontaktName } from '../data/rules';
import { offeneDeals, wahrscheinlichkeit } from '../data/selectors';
import type { Deal } from '../data/types';
import { faelligText, formatDateTime, formatEuro } from '../lib/format';
import { usePhaseChange } from './dialogs/PhaseChange';
import { AuchOffen, useAnwesenheit } from './Praesenz';

interface BlattZiel {
  firmaId: string;
  dealId?: string;
}

interface BlattWert {
  oeffne(firmaId: string, dealId?: string): void;
  schliesse(): void;
}

const BlattKontext = createContext<BlattWert>({ oeffne: () => undefined, schliesse: () => undefined });

/** Opens a company in the side sheet: the list stays where it is, the full record is one click further. */
export function useBlatt(): BlattWert {
  return useContext(BlattKontext);
}

export function BlattProvider({ children }: { children: ReactNode }) {
  const [ziel, setZiel] = useState<BlattZiel | null>(null);
  const { pathname } = useLocation();
  const oeffne = useCallback((firmaId: string, dealId?: string) => setZiel({ firmaId, dealId }), []);
  const schliesse = useCallback(() => setZiel(null), []);
  // Another page: the sheet belonged to the old one.
  useEffect(() => setZiel(null), [pathname]);
  const wert = useMemo(() => ({ oeffne, schliesse }), [oeffne, schliesse]);
  return (
    <BlattKontext.Provider value={wert}>
      {children}
      <FirmaBlatt ziel={ziel} onClose={schliesse} />
    </BlattKontext.Provider>
  );
}

const PIPELINE_PHASEN = PHASEN.filter((p) => !isAbgeschlossen(p));

function FirmaBlatt({ ziel, onClose }: { ziel: BlattZiel | null; onClose(): void }) {
  const { db } = useCrm();
  const phaseChange = usePhaseChange();
  const zuKnopf = useRef<HTMLButtonElement>(null);
  const vorher = useRef<Element | null>(null);
  const [bereit, setBereit] = useState(false);
  const offen = ziel !== null;

  const firma = ziel && db ? db.firmen.find((f) => f.id === ziel.firmaId) : undefined;
  const deals = firma && db ? db.deals.filter((d) => d.firma_id === firma.id && !d.archiviert) : [];
  const deal: Deal | undefined = (ziel?.dealId && deals.find((d) => d.id === ziel.dealId)) || offeneDeals(deals)[0] || deals[0];
  useAnwesenheit(firma ? { art: 'firma', id: firma.id, titel: firma.name } : null);

  // Short skeleton, so opening feels like loading the record and the content does not jump in.
  useEffect(() => {
    if (!offen) return;
    setBereit(false);
    vorher.current = document.activeElement;
    const t = window.setTimeout(() => {
      setBereit(true);
      zuKnopf.current?.focus({ preventScroll: true });
    }, 180);
    return () => window.clearTimeout(t);
  }, [offen, ziel?.firmaId]);

  useEffect(() => {
    if (!offen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.overlay')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [offen, onClose]);

  useEffect(() => {
    if (offen) return;
    const el = vorher.current;
    if (el instanceof HTMLElement) el.focus({ preventScroll: true });
  }, [offen]);

  const heute = isoDate(new Date());
  const kontakte = firma && db ? db.kontakte.filter((k) => k.firma_id === firma.id && !k.archiviert).sort((a, b) => Number(b.hauptkontakt) - Number(a.hauptkontakt)) : [];
  const verlauf = firma && db ? db.aktivitaeten.filter((a) => a.firma_id === firma.id).sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 6) : [];
  const wiedervorlagen = firma && db ? db.wiedervorlagen.filter((w) => w.firma_id === firma.id && !w.erledigt_am).sort((a, b) => a.faellig_am.localeCompare(b.faellig_am)) : [];
  const phaseI = deal ? PIPELINE_PHASEN.indexOf(deal.phase as (typeof PIPELINE_PHASEN)[number]) : -1;
  const ueberfaellig = deal?.naechster_schritt_am ? deal.naechster_schritt_am < heute : false;

  return (
    <>
      <div className={`blatt-schleier${offen ? ' is-offen' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`blatt${offen ? ' is-offen' : ''}`} role="dialog" aria-modal="false" aria-label={firma ? firma.name : 'Firma'} aria-hidden={!offen}>
        {offen && (!bereit || !firma) ? (
          <div className="blatt-skelett" aria-busy="true">
            <div className="sk" style={{ height: 44, width: '60%' }} />
            <div className="sk" style={{ height: 10 }} />
            <div className="sk" style={{ height: 96 }} />
            <div className="blatt-fakten">
              <div className="sk" style={{ height: 56 }} />
              <div className="sk" style={{ height: 56 }} />
              <div className="sk" style={{ height: 56 }} />
              <div className="sk" style={{ height: 56 }} />
            </div>
            <div className="sk" style={{ height: 160 }} />
          </div>
        ) : firma ? (
          <>
            <header className="blatt-kopf">
              <div className="blatt-titel">
                <span className="blatt-zeichen" aria-hidden="true">{(firma.kuerzel || firma.name).slice(0, 1)}</span>
                <div>
                  <h2>{firma.name}</h2>
                  <span className="muted small">
                    {[firma.domain, statusLabel(firma.status), firma.zustaendig].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <button type="button" className="icon-button" onClick={onClose} aria-label="Schließen" ref={zuKnopf}>
                  ×
                </button>
              </div>
              <AuchOffen art="firma" id={firma.id} />
              {deal && !isAbgeschlossen(deal.phase) && (
                <div className="blatt-phasen" role="group" aria-label={`Phase von ${deal.titel}`}>
                  {PIPELINE_PHASEN.map((p, i) => (
                    <button
                      key={p}
                      type="button"
                      className={i < phaseI ? 'is-vorbei' : i === phaseI ? 'is-jetzt' : ''}
                      aria-pressed={i === phaseI}
                      title={`Phase: ${phaseLabel(p)}`}
                      onClick={() => void phaseChange.request(deal, p)}
                    >
                      <i />
                      <span>{phaseLabel(p)}</span>
                    </button>
                  ))}
                </div>
              )}
              {deal && isAbgeschlossen(deal.phase) && <span className={`badge phase-${deal.phase}`}>{phaseLabel(deal.phase)}</span>}
            </header>

            <div className="blatt-inhalt">
              {deal && !isAbgeschlossen(deal.phase) && (
                <section className={`blatt-schritt${ueberfaellig ? ' is-ueberfaellig' : ''}`}>
                  <div className="row-zwischen">
                    <span className="eyebrow-klein">Nächster Schritt</span>
                    {deal.naechster_schritt_am && <span className={`badge ${ueberfaellig ? 'aktion-fehler' : 'subtle'}`}>{faelligText(deal.naechster_schritt_am, heute)}</span>}
                  </div>
                  <strong>{deal.naechster_schritt || 'Noch kein nächster Schritt festgelegt'}</strong>
                  <div className="blatt-knoepfe">
                    <Link to={`/crm/firmen/${firma.id}`} className="button small primary">Akte öffnen</Link>
                    <button type="button" className="button small" onClick={() => void phaseChange.request(deal, PIPELINE_PHASEN[Math.min(phaseI + 1, PIPELINE_PHASEN.length - 1)] ?? 'angebot')} disabled={phaseI === PIPELINE_PHASEN.length - 1}>
                      Nächste Phase
                    </button>
                    <button type="button" className="button small subtle" onClick={() => void phaseChange.request(deal, 'gewonnen')}>Gewonnen</button>
                  </div>
                </section>
              )}

              <dl className="blatt-fakten">
                <div><dt>Deal</dt><dd>{deal ? deal.titel : '–'}</dd></div>
                <div><dt>Wert</dt><dd className="num">{formatEuro(deal?.wert_eur)}</dd></div>
                <div><dt>Gewichtet</dt><dd className="num">{deal && deal.wert_eur ? formatEuro(Math.round((deal.wert_eur * wahrscheinlichkeit(deal)) / 100)) : '–'}</dd></div>
                <div><dt>Plattform</dt><dd>{[firma.plattform, firma.version].filter(Boolean).join(' ') || '–'}</dd></div>
              </dl>

              {wiedervorlagen.length > 0 && (
                <section>
                  <span className="eyebrow-klein">Wiedervorlagen</span>
                  <ul className="blatt-liste">
                    {wiedervorlagen.map((w) => (
                      <li key={w.id} className={w.faellig_am < heute ? 'is-ueberfaellig' : ''}>
                        <span>{w.titel}</span>
                        <span className="muted small">{faelligText(w.faellig_am, heute)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {kontakte.length > 0 && (
                <section>
                  <span className="eyebrow-klein">Kontakte</span>
                  <ul className="blatt-liste">
                    {kontakte.slice(0, 4).map((k) => (
                      <li key={k.id}>
                        <span>
                          <strong>{kontaktName(k)}</strong>
                          {k.rolle && <span className="muted small"> · {k.rolle}</span>}
                        </span>
                        <span className="blatt-kontaktwege small">
                          {k.email && <a href={`mailto:${k.email}`}>Mail</a>}
                          {k.linkedin && <a href={k.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}
                          {k.telefon && <a href={`tel:${k.telefon}`}>Telefon</a>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <span className="eyebrow-klein">Verlauf</span>
                {verlauf.length === 0 ? (
                  <p className="muted small">Noch nichts im Verlauf.</p>
                ) : (
                  <ul className="blatt-verlauf">
                    {verlauf.map((a) => (
                      <li key={a.id} className={`typ-${a.typ}`}>
                        <i aria-hidden="true" />
                        <div>
                          <span className="blatt-verlauf-text">{a.text}</span>
                          <span className="muted small">
                            {AKTIVITAET_LABEL[a.typ] ?? a.typ} · {formatDateTime(a.datum)}
                            {a.von ? ` · ${a.von.split('@')[0]}` : ''}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <footer className="blatt-fuss">
              <Link
                to={`/contact?firma=${firma.id}${deal ? `&deal=${deal.id}${deal.kontakt_id ? `&kontakt=${deal.kontakt_id}` : ''}` : ''}`}
                className="button small"
              >
                Anschreiben
              </Link>
              {firma.domain && (
                <Link to={`/audit/neu?domain=${encodeURIComponent(firma.domain)}`} className="button small">
                  Shop-Audit
                </Link>
              )}
              <Link to={`/angebote/neu?firma=${firma.id}${deal ? `&deal=${deal.id}` : ''}`} className="button small">
                Angebot
              </Link>
              <Link to={`/crm/firmen/${firma.id}`} className="button small subtle">
                Ganze Akte →
              </Link>
            </footer>
          </>
        ) : null}
      </aside>
      {phaseChange.element}
    </>
  );
}
