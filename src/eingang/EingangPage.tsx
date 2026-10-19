import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBlatt } from '../components/Blatt';
import { WerkzeugIcon } from '../components/Icons';
import { letzterG } from '../components/Tastatur';
import { useToast } from '../components/Toasts';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { ART_LABEL, sammleEingang, type EingangArt, type EingangEintrag } from '../data/eingangListe';
import { addDays, isoDate } from '../data/ids';
import type { Erwaehnung, MagnetLead, TodoDaten } from '../data/types';
import { errorMessage } from '../lib/errors';
import { useIch } from '../lib/useIch';
import { useEingang } from './useEingang';

type Filter = 'alle' | 'leads' | 'team';
const FILTER: { id: Filter; label: string; arten: EingangArt[] | null }[] = [
  { id: 'alle', label: 'Alle', arten: null },
  { id: 'leads', label: 'Leads & Vertrieb', arten: ['schritt', 'vernetzung', 'anfrage', 'magnet'] },
  { id: 'team', label: 'Team & To-dos', arten: ['erwaehnung', 'wiedervorlage', 'karte'] },
];

const ICON: Record<EingangArt, string> = {
  erwaehnung: 'social',
  wiedervorlage: 'todo',
  schritt: 'crm',
  vernetzung: 'contact',
  karte: 'todo',
  anfrage: 'eingang',
  magnet: 'magnete',
};
const HAUPT: Record<EingangArt, string> = {
  erwaehnung: 'Öffnen',
  wiedervorlage: 'Erledigt',
  schritt: 'Öffnen',
  vernetzung: 'Entscheiden',
  karte: 'Erledigt',
  anfrage: 'Ansehen',
  magnet: 'Ansehen',
};

/** Put off until tomorrow: key → day it shows up again. Per browser, like a personal snooze. */
const SPAETER_KEY = 'velonify-hub.eingang-spaeter';
function leseSpaeter(heute: string): Record<string, string> {
  try {
    const alle = JSON.parse(localStorage.getItem(SPAETER_KEY) ?? '{}') as Record<string, string>;
    return Object.fromEntries(Object.entries(alle).filter(([, bis]) => bis > heute));
  } catch {
    return {};
  }
}
function schreibeSpaeter(werte: Record<string, string>) {
  try {
    localStorage.setItem(SPAETER_KEY, JSON.stringify(werte));
  } catch {
    // Storage blocked: putting off lasts until reload.
  }
}

interface Zusatz {
  erwaehnungen?: Erwaehnung[];
  magnetLeads?: MagnetLead[];
  todo?: TodoDaten;
  fehler: string[];
}

/** Loads the sources that are not part of the CRM snapshot; one that fails is named, the rest still shows. */
function useZusatz() {
  const { service } = useCrm();
  const [zusatz, setZusatz] = useState<Zusatz | null>(null);
  const laden = useCallback(async () => {
    if (!service) return;
    const [e, m, t] = await Promise.allSettled([service.loadErwaehnungen(), service.loadMagnetDaten(), service.loadTodoDaten()]);
    const fehler: string[] = [];
    if (e.status === 'rejected') fehler.push('Erwähnungen');
    if (m.status === 'rejected') fehler.push('Lead-Magnete');
    if (t.status === 'rejected') fehler.push('To-dos');
    setZusatz({
      erwaehnungen: e.status === 'fulfilled' ? e.value : undefined,
      magnetLeads: m.status === 'fulfilled' ? m.value.leads : undefined,
      todo: t.status === 'fulfilled' ? t.value : undefined,
      fehler,
    });
  }, [service]);
  useEffect(() => {
    void laden();
  }, [laden]);
  return { zusatz, laden };
}

export function EingangPage() {
  const { db, service, perform, loading, error, refresh } = useCrm();
  const [ich] = useIch(db?.listen.team ?? []);
  const anfragen = useEingang();
  const { zusatz, laden } = useZusatz();
  const blatt = useBlatt();
  const toast = useToast();
  const navigate = useNavigate();
  const heute = isoDate(new Date());
  const [spaeter, setSpaeter] = useState(() => leseSpaeter(heute));
  const [weg, setWeg] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('alle');
  const [auswahl, setAuswahl] = useState(0);
  const liste = useRef<HTMLUListElement>(null);

  const alle = useMemo(() => {
    if (!db) return [];
    return sammleEingang(
      { db, anfragen: anfragen.data, erwaehnungen: zusatz?.erwaehnungen, magnetLeads: zusatz?.magnetLeads, todo: zusatz?.todo },
      ich,
      heute,
      new Set(Object.keys(spaeter)),
    );
  }, [db, anfragen.data, zusatz, ich, heute, spaeter]);
  const arten = FILTER.find((f) => f.id === filter)!.arten;
  const sichtbar = alle.filter((e) => !weg.has(e.key) && (!arten || arten.includes(e.art)));
  const zahl = (f: (typeof FILTER)[number]) => alle.filter((e) => !weg.has(e.key) && (!f.arten || f.arten.includes(e.art))).length;
  const aktiv = Math.min(auswahl, Math.max(sichtbar.length - 1, 0));

  /** Takes the item out of the list right away; the write runs behind it. */
  const raus = (key: string) => setWeg((w) => new Set(w).add(key));
  const zurueck = (key: string) =>
    setWeg((w) => {
      const n = new Set(w);
      n.delete(key);
      return n;
    });

  const spaeterLegen = (e: EingangEintrag) => {
    const neu = { ...leseSpaeter(heute), [e.key]: addDays(heute, 1) };
    schreibeSpaeter(neu);
    setSpaeter(neu);
    toast.rueckgaengig(`Auf morgen gelegt: ${e.titel}`, () => {
      const ohne = { ...leseSpaeter(heute) };
      delete ohne[e.key];
      schreibeSpaeter(ohne);
      setSpaeter(ohne);
    });
  };

  const hauptaktion = async (e: EingangEintrag) => {
    if (!service) return;
    try {
      switch (e.art) {
        case 'wiedervorlage': {
          raus(e.key);
          await perform((s) => s.setWiedervorlageErledigt(e.quelleId, true));
          toast.rueckgaengig(`Erledigt: ${e.titel}`, async () => {
            await perform((s) => s.setWiedervorlageErledigt(e.quelleId, false));
            zurueck(e.key);
          });
          return;
        }
        case 'karte': {
          raus(e.key);
          await service.setKarteErledigt(e.quelleId, true);
          void laden();
          toast.rueckgaengig(`Erledigt: ${e.titel}`, async () => {
            await service.setKarteErledigt(e.quelleId, false);
            await laden();
            zurueck(e.key);
          });
          return;
        }
        case 'erwaehnung':
          void service.markiereGelesen([e.quelleId]).then(() => laden());
          navigate(e.pfad);
          return;
        case 'schritt':
        case 'vernetzung':
          if (e.firmaId) blatt.oeffne(e.firmaId, e.dealId);
          else navigate(e.pfad);
          return;
        default:
          navigate(e.pfad);
      }
    } catch (err) {
      zurueck(e.key);
      toast.show(errorMessage(err), 'error');
    }
  };

  const gelesen = async (e: EingangEintrag) => {
    if (!service) return;
    raus(e.key);
    try {
      await service.markiereGelesen([e.quelleId]);
      void laden();
    } catch (err) {
      zurueck(e.key);
      toast.show(errorMessage(err), 'error');
    }
  };

  // J/K move, E main action, S tomorrow, Enter opens – only while nothing else (dialog, sheet, search) is open.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || Date.now() - letzterG.zeit < 1200) return;
      const ziel = ev.target as HTMLElement | null;
      if (ziel && (ziel.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ziel.tagName))) return;
      if (document.querySelector('.overlay, .search-overlay, .blatt.is-offen')) return;
      const e = sichtbar[aktiv];
      const k = ev.key.toLowerCase();
      if (k === 'j' || ev.key === 'ArrowDown') {
        ev.preventDefault();
        setAuswahl(Math.min(aktiv + 1, sichtbar.length - 1));
      } else if (k === 'k' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        setAuswahl(Math.max(aktiv - 1, 0));
      } else if (e && k === 'e') {
        ev.preventDefault();
        void hauptaktion(e);
      } else if (e && k === 's') {
        ev.preventDefault();
        spaeterLegen(e);
      } else if (e && ev.key === 'Enter') {
        ev.preventDefault();
        if (e.firmaId) blatt.oeffne(e.firmaId, e.dealId);
        else navigate(e.pfad);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    liste.current?.querySelector('.ib.is-auswahl')?.scrollIntoView({ block: 'nearest' });
  }, [aktiv]);

  if (!db) return error ? <div className="page"><ErrorBox error={error} onRetry={refresh} /></div> : <Loading />;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Home"
        title="Eingang"
        subtitle={sichtbar.length ? `${sichtbar.length} ${sichtbar.length === 1 ? 'Sache braucht' : 'Dinge brauchen'} heute eine Entscheidung.` : 'Alles entschieden.'}
        actions={
          <div className="segmented" role="radiogroup" aria-label="Filter">
            {FILTER.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} className={filter === f.id ? 'is-active' : ''} onClick={() => { setFilter(f.id); setAuswahl(0); }}>
                {f.label} <span className="segment-zahl">{zahl(f)}</span>
              </button>
            ))}
          </div>
        }
      />
      {anfragen.error && <ErrorBox error={anfragen.error} onRetry={anfragen.reload} />}
      {zusatz && zusatz.fehler.length > 0 && (
        <div className="hint-box warn">Nicht geladen: {zusatz.fehler.join(', ')}. Der Rest ist vollständig.</div>
      )}

      <div className="eingang-raster">
        <div className="card eingang-liste">
          {sichtbar.length === 0 ? (
            <div className="eingang-leer">
              <span className="eingang-leer-blatt" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                  <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
                </svg>
              </span>
              <strong>Eingang leer</strong>
              <span className="muted">{loading ? 'Wird noch aktualisiert …' : 'Alles entschieden. Zeit, die Monstera zu gießen.'}</span>
            </div>
          ) : (
            <ul ref={liste} className="eingang-eintraege">
              {sichtbar.map((e, i) => (
                <li
                  key={e.key}
                  className={`ib${i === aktiv ? ' is-auswahl' : ''}`}
                  onMouseEnter={() => setAuswahl(i)}
                >
                  <span className={`ib-icon art-${e.art} dring-${e.dringlichkeit}`} aria-hidden="true">
                    <WerkzeugIcon id={ICON[e.art]} />
                  </span>
                  <button type="button" className="ib-text" onClick={() => (e.firmaId ? blatt.oeffne(e.firmaId, e.dealId) : navigate(e.pfad))}>
                    <span className="eyebrow-klein">{ART_LABEL[e.art]}</span>
                    <strong>{e.titel}</strong>
                    {e.unter && <span className="muted small">{e.unter}</span>}
                  </button>
                  <div className="ib-rechts">
                    <span className={`badge ${e.dringlichkeit === 'ueberfaellig' ? 'aktion-fehler' : e.dringlichkeit === 'heute' ? 'warn' : 'subtle'}`}>{e.wann}</span>
                    <div className="ib-knoepfe">
                      {e.art === 'erwaehnung' && (
                        <button type="button" className="button small subtle" onClick={() => void gelesen(e)}>
                          Gelesen
                        </button>
                      )}
                      <button type="button" className="button small subtle" onClick={() => spaeterLegen(e)} title="Auf morgen legen (S)">
                        Morgen
                      </button>
                      <button type="button" className="button small primary" onClick={() => void hauptaktion(e)} title="Hauptaktion (E)">
                        {HAUPT[e.art]}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside className="card eingang-hilfe">
          <h2>Schneller mit Tastatur</h2>
          <p className="muted small">Ohne Maus durch den Eingang.</p>
          <dl className="tasten-liste">
            <div><dt>Nächster / vorheriger</dt><dd><kbd>J</kbd> <kbd>K</kbd></dd></div>
            <div><dt>Hauptaktion</dt><dd><kbd>E</kbd></dd></div>
            <div><dt>Auf morgen legen</dt><dd><kbd>S</kbd></dd></div>
            <div><dt>Öffnen</dt><dd><kbd>↵</kbd></dd></div>
            <div><dt>Rückgängig</dt><dd><kbd>Z</kbd></dd></div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
