import { useMemo, useState } from 'react';
import { useToast } from '../components/Toasts';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { fehltEnglisch, inSprache, katalogBaum, SPRACHEN, type Sprache } from '../data/katalog';
import { STARTKATALOG } from '../data/startkatalog';
import type { Leistung, Leistungskategorie } from '../data/types';
import { errorMessage } from '../lib/errors';
import { KategorieDialog, LeistungDialog } from './KatalogDialoge';
import { useKatalog } from './useKatalog';

type Offen =
  | { art: 'kategorie'; kategorie?: Leistungskategorie }
  | { art: 'leistung'; leistung?: Leistung; kategorieId?: string }
  | null;

function Pfeile({ label, oben, unten, onMove }: { label: string; oben: boolean; unten: boolean; onMove(richtung: -1 | 1): void }) {
  return (
    <span className="move-buttons">
      <button type="button" className="icon-button small" onClick={() => onMove(-1)} disabled={oben} aria-label={`${label} nach oben`} title="Nach oben">
        ↑
      </button>
      <button type="button" className="icon-button small" onClick={() => onMove(1)} disabled={unten} aria-label={`${label} nach unten`} title="Nach unten">
        ↓
      </button>
    </span>
  );
}

export function LeistungenPage() {
  const { data, error, loading, reload, aendern } = useKatalog();
  const toast = useToast();
  const [sprache, setSprache] = useState<Sprache>('de');
  const [archivierte, setArchivierte] = useState(false);
  const [offen, setOffen] = useState<Offen>(null);
  const [busy, setBusy] = useState(false);

  const baum = useMemo(() => (data ? katalogBaum(data, archivierte) : []), [data, archivierte]);
  const aktiveKategorien = useMemo(() => (data ? katalogBaum(data).map((k) => k.kategorie) : []), [data]);
  const anzahl = baum.reduce((n, k) => n + k.leistungen.length, 0);
  const ohneEnglisch = data ? [...data.kategorien, ...data.leistungen].filter((x) => !x.archiviert && fehltEnglisch(x)).length : 0;

  const aktion = async (action: Parameters<typeof aendern>[0], meldung?: string) => {
    setBusy(true);
    try {
      await aendern(action);
      if (meldung) toast.show(meldung);
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return <div className="page narrow">{error ? <ErrorBox error={error} onRetry={reload} /> : loading && <Loading label="Katalog wird geladen …" />}</div>;
  }

  return (
    <div className="page narrow">
      <PageHeader
        eyebrow="Angebots-Rechner"
        title="Leistungen"
        subtitle={`${aktiveKategorien.length} Hauptkategorien mit ${anzahl} Unterpunkten. Preise stehen nicht im Katalog, sie kommen pro Angebot ins Kalkulations-Sheet.`}
        actions={
          <>
            <div className="segmented" role="radiogroup" aria-label="Sprache">
              {SPRACHEN.map((s) => (
                <button key={s.wert} type="button" role="radio" aria-checked={sprache === s.wert} className={sprache === s.wert ? 'is-active' : ''} onClick={() => setSprache(s.wert)}>
                  {s.label}
                </button>
              ))}
            </div>
            <button type="button" className="button primary" onClick={() => setOffen({ art: 'kategorie' })}>
              Hauptkategorie anlegen
            </button>
          </>
        }
      />
      {error && <ErrorBox error={error} onRetry={reload} />}

      {data.kategorien.length === 0 ? (
        <section className="card empty">
          <p>Der Katalog ist noch leer.</p>
          <p className="muted">
            Der Startkatalog enthält {STARTKATALOG.length} Hauptkategorien aus bisherigen Angeboten, auf Deutsch und Englisch. Danach lässt sich alles hier anpassen.
          </p>
          <div className="empty-actions">
            <button type="button" className="button primary" disabled={busy} onClick={() => aktion((s) => s.uebernimmStartkatalog(), 'Startkatalog übernommen')}>
              {busy ? 'Übernimmt …' : 'Startkatalog übernehmen'}
            </button>
            <button type="button" className="button" onClick={() => setOffen({ art: 'kategorie' })}>
              Leer beginnen
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="filters katalog-filters">
            <label className="checkbox">
              <input type="checkbox" checked={archivierte} onChange={(e) => setArchivierte(e.target.checked)} />
              Archivierte zeigen
            </label>
            {sprache === 'en' && ohneEnglisch > 0 && <span className="badge warn">{ohneEnglisch} ohne englischen Titel</span>}
          </div>
          <ol className="katalog">
            {baum.map(({ kategorie: k, leistungen }, i) => (
              <li key={k.id} className={`card katalog-kategorie${k.archiviert ? ' is-archived' : ''}`}>
                <header className="katalog-kopf">
                  <span className="katalog-nummer">{i + 1}</span>
                  <div className="katalog-titel">
                    <h2>
                      <button type="button" className="link-button" onClick={() => setOffen({ art: 'kategorie', kategorie: k })}>
                        {inSprache(k, 'titel', sprache)}
                      </button>
                    </h2>
                    <div className="row-sub">
                      {k.abrechnung === 'monatlich' ? <span className="badge phase-kontaktiert">Monatlich</span> : <span className="badge subtle">Einmalig</span>}
                      {k.archiviert && <span className="badge archived">Archiviert</span>}
                      {sprache === 'en' && fehltEnglisch(k) && <span className="badge warn">EN fehlt</span>} {inSprache(k, 'umfang', sprache)}
                    </div>
                  </div>
                  {!k.archiviert && (
                    <Pfeile label={k.titel_de} oben={i === 0} unten={i === baum.length - 1 || baum[i + 1]?.kategorie.archiviert} onMove={(r) => aktion((s) => s.verschiebeKategorie(k.id, r))} />
                  )}
                </header>
                <ul className="katalog-leistungen">
                  {leistungen.map((l, j) => (
                    <li key={l.id} className={l.archiviert ? 'is-archived' : undefined}>
                      <div className="katalog-leistung">
                        <button type="button" className="link-button strong" onClick={() => setOffen({ art: 'leistung', leistung: l })}>
                          {inSprache(l, 'titel', sprache)}
                        </button>
                        {sprache === 'en' && fehltEnglisch(l) && <span className="badge warn">EN fehlt</span>}
                        {l.archiviert && <span className="badge archived">Archiviert</span>}
                        <p className="muted small">{inSprache(l, 'text', sprache)}</p>
                      </div>
                      {!l.archiviert && (
                        <Pfeile
                          label={l.titel_de}
                          oben={j === 0}
                          unten={j === leistungen.length - 1 || leistungen[j + 1]?.archiviert}
                          onMove={(r) => aktion((s) => s.verschiebeLeistung(l.id, r))}
                        />
                      )}
                    </li>
                  ))}
                </ul>
                {!k.archiviert && (
                  <button type="button" className="button small subtle katalog-neu" onClick={() => setOffen({ art: 'leistung', kategorieId: k.id })}>
                    + Unterpunkt
                  </button>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      {offen?.art === 'kategorie' && <KategorieDialog kategorie={offen.kategorie} aendern={aendern} onClose={() => setOffen(null)} />}
      {offen?.art === 'leistung' && (
        <LeistungDialog leistung={offen.leistung} kategorieId={offen.kategorieId} kategorien={aktiveKategorien} aendern={aendern} onClose={() => setOffen(null)} />
      )}
    </div>
  );
}
