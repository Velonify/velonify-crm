import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { config, isDemo } from '../config';
import { CloudFrage, DemoFrage, frageHub, istFrage, type FrageErgebnis } from '../data/frage';
import { isoDate } from '../data/ids';
import { errorMessage } from '../lib/errors';
import { useIch } from '../lib/useIch';
import { useBlatt } from './Blatt';
import { WerkzeugIcon } from './Icons';
import { useCrm } from '../data/CrmContext';
import type { CrmService } from '../data/crm';
import { AuthExpiredError } from '../data/errors';
import { befehle, suche, sucheBereiche, type Bereichsdaten, type Treffer, type TrefferArt } from '../data/suche';
import { WERKZEUGE } from '../werkzeuge';
import { useRolle } from '../lib/useRolle';

const ART_LABEL: Record<TrefferArt, string> = {
  firma: 'Firmen', kunde: 'Kunden', kontakt: 'Kontakte', deal: 'Deals', karte: 'To-dos', angebot: 'Angebote',
  inhalt: 'Social-Inhalte', magnet: 'Lead-Magnete', aktion: 'Aktionen', werkzeug: 'Werkzeuge',
};
const REIHENFOLGE: TrefferArt[] = ['firma', 'kunde', 'kontakt', 'deal', 'karte', 'angebot', 'inhalt', 'magnet', 'aktion', 'werkzeug'];

type Bereich = keyof Bereichsdaten;
const BEREICH_LABEL: Record<Bereich, string> = { todo: 'To-dos', angebote: 'Angebote', inhalte: 'Social-Inhalte', magnete: 'Lead-Magnete' };
const LADER: { [B in Bereich]-?: (service: CrmService) => Promise<NonNullable<Bereichsdaten[B]>> } = {
  todo: (s) => s.loadTodoDaten(),
  angebote: async (s) => (await s.loadAngebotsDaten()).angebote,
  inhalte: async (s) => (await s.loadSocialDaten()).inhalte,
  magnete: async (s) => (await s.loadMagnetDaten()).magnete,
};
const BEREICHE = Object.keys(LADER) as Bereich[];

/** Reopening the palette within this time reuses the loaded areas instead of asking the backend again. */
const CACHE_MS = 30_000;
const cache = new Map<Bereich, { service: CrmService; zeit: number; laden: Promise<unknown> }>();

/**
 * Loads the other areas when the palette opens – not with the hub, so opening the hub stays as fast as before.
 * Each area arrives on its own; one that fails is listed in `fehler` and the rest stays searchable.
 */
function useBereichsdaten(service: CrmService | null, siehtGeld: boolean) {
  const { expire } = useAuth();
  const [daten, setDaten] = useState<Bereichsdaten>({});
  const [fehler, setFehler] = useState<Bereich[]>([]);

  useEffect(() => {
    if (!service) return;
    let aktiv = true;
    for (const bereich of BEREICHE) {
      if (bereich === 'angebote' && !siehtGeld) continue;
      let eintrag = cache.get(bereich);
      if (!eintrag || eintrag.service !== service || Date.now() - eintrag.zeit > CACHE_MS) {
        eintrag = { service, zeit: Date.now(), laden: LADER[bereich](service) };
        cache.set(bereich, eintrag);
      }
      const geladen = eintrag;
      geladen.laden.then(
        (wert) => aktiv && setDaten((d) => ({ ...d, [bereich]: wert })),
        (err: unknown) => {
          // A failed load is not kept, so the next open tries again.
          if (cache.get(bereich) === geladen) cache.delete(bereich);
          if (err instanceof AuthExpiredError) expire();
          if (aktiv) setFehler((f) => (f.includes(bereich) ? f : [...f, bereich]));
        },
      );
    }
    return () => {
      aktiv = false;
    };
  }, [service, expire, siehtGeld]);

  return { daten, fehler };
}

export const istMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Search button for the sidebar plus the ⌘K / Ctrl+K dialog. */
export function Suche() {
  const [offen, setOffen] = useState(false);
  const { pathname } = useLocation();
  // Another page (a shortcut, a link in an answer): the palette belonged to the old one.
  useEffect(() => setOffen(false), [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOffen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button type="button" className="search-trigger" onClick={() => setOffen(true)} aria-label="Suchen" title={`Suchen (${istMac ? '⌘K' : 'Strg+K'})`}>
        <span aria-hidden="true">⌕</span>
        <span className="search-trigger-label">Suchen oder fragen</span>
        <kbd>{istMac ? '⌘K' : 'Strg K'}</kbd>
      </button>
      {/* Rendered at body level, so it follows the page theme, not the sidebar. */}
      {offen && createPortal(<SuchDialog onClose={() => setOffen(false)} />, document.body)}
    </>
  );
}

type FrageStand = { frage: string; laeuft: true } | { frage: string; laeuft: false; ergebnis?: FrageErgebnis; fehler?: string };

function SuchDialog({ onClose }: { onClose(): void }) {
  const { db, service } = useCrm();
  const { getToken } = useAuth();
  const [ich] = useIch(db?.listen.team ?? []);
  const blatt = useBlatt();
  const [frageStand, setFrageStand] = useState<FrageStand | null>(null);
  const frageApi = useMemo(() => (isDemo || !config.contactGeneratorUrl ? new DemoFrage() : new CloudFrage(config.contactGeneratorUrl, getToken)), [getToken]);
  const { erlaubt, siehtGeld } = useRolle();
  const { daten, fehler } = useBereichsdaten(service, siehtGeld);
  const navigate = useNavigate();
  const [eingabe, setEingabe] = useState('');
  const [aktiv, setAktiv] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Grouped for display, flat for keyboard navigation.
  const gruppen = useMemo(() => {
    const treffer = [...(db ? [...suche(db, eingabe), ...sucheBereiche(db, daten, eingabe)] : []), ...befehle(eingabe, WERKZEUGE.filter((w) => erlaubt(w.id)))];
    return REIHENFOLGE.map((art) => ({ art, treffer: treffer.filter((t) => t.art === art) })).filter((g) => g.treffer.length > 0);
  }, [db, daten, eingabe, erlaubt]);
  const flach = gruppen.flatMap((g) => g.treffer);
  // "Frag den Hub" is index -1: first for questions, otherwise reachable with ↑ above the first hit.
  const fragbar = eingabe.trim().length > 2;
  const frageZuerst = fragbar && (istFrage(eingabe) || flach.length === 0);

  const fragen = async () => {
    if (!db || !service) return;
    const frage = eingabe.trim();
    setFrageStand({ frage, laeuft: true });
    try {
      const ergebnis = await frageHub(frageApi, frage, { db, heute: isoDate(new Date()), ich, todo: () => service.loadTodoDaten() });
      setFrageStand({ frage, laeuft: false, ergebnis });
    } catch (err) {
      setFrageStand({ frage, laeuft: false, fehler: errorMessage(err) });
    }
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setAktiv(frageZuerst ? -1 : 0);
    setFrageStand(null);
  }, [eingabe, frageZuerst]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [aktiv]);

  const oeffne = (t: Treffer) => {
    onClose();
    navigate(t.pfad ?? `/crm/firmen/${t.firmaId}`);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setAktiv((i) => Math.min(i + 1, flach.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setAktiv((i) => Math.max(i - 1, fragbar ? -1 : 0));
    } else if (event.key === 'Enter' && aktiv === -1 && fragbar) {
      event.preventDefault();
      void fragen();
    } else if (event.key === 'Enter' && flach[aktiv]) {
      event.preventDefault();
      oeffne(flach[aktiv]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  let index = -1;
  return (
    <div className="overlay search-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-dialog" role="dialog" aria-modal="true" aria-label="Suche">
        <div className="search-input-row">
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Suchen oder fragen, z. B. „Wer braucht heute eine Aktion?“"
            role="combobox"
            aria-expanded={flach.length > 0}
            aria-controls={listId}
            aria-activedescendant={flach[aktiv] ? `${listId}-${aktiv}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>

        {fragbar && (
          <button
            type="button"
            className={`frage-zeile${aktiv === -1 ? ' is-active' : ''}`}
            onMouseMove={() => aktiv !== -1 && setAktiv(-1)}
            onClick={() => void fragen()}
          >
            <span className="frage-zeichen" aria-hidden="true">
              <WerkzeugIcon id="frage" />
            </span>
            <span className="search-text">
              <span className="search-title">Frag den Hub: „{eingabe.trim()}“</span>
              <span className="search-details">Claude Haiku liest Pipeline, Fälliges, Firmen und To-dos und antwortet kurz</span>
            </span>
            <kbd>↵</kbd>
          </button>
        )}
        {frageStand && (
          <div className="frage-antwort" aria-live="polite">
            <span className="eyebrow-klein">Frag den Hub{isDemo ? ' · Demo' : ''}</span>
            {frageStand.laeuft ? (
              <span className="frage-tippt" aria-label="Claude denkt nach"><i /><i /><i /></span>
            ) : frageStand.fehler ? (
              <p className="frage-fehler">{frageStand.fehler}</p>
            ) : (
              <>
                <p className="frage-text">{frageStand.ergebnis?.text}</p>
                {frageStand.ergebnis && frageStand.ergebnis.firmen.length > 0 && (
                  <div className="frage-firmen">
                    {frageStand.ergebnis.firmen.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className="chip"
                        onClick={() => {
                          onClose();
                          blatt.oeffne(f.id);
                        }}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {!db && <p className="search-empty">Daten werden geladen …</p>}
        {eingabe.trim() === '' && <p className="search-empty">Firmen, Kunden, To-dos, Angebote und Social-Inhalte finden oder direkt etwas starten. ↑ ↓ zum Auswählen, Enter zum Öffnen.</p>}
        {eingabe.trim() !== '' && flach.length === 0 && !fragbar && <p className="search-empty">Nichts gefunden für „{eingabe}“.</p>}

        {flach.length > 0 && !frageStand && (
          <ul ref={listRef} id={listId} role="listbox" className="search-results" aria-label="Suchergebnisse">
            {gruppen.map((gruppe) => (
              <li key={gruppe.art} role="presentation">
                <div className="search-group" role="presentation">
                  {ART_LABEL[gruppe.art]}
                </div>
                <ul role="presentation">
                  {gruppe.treffer.map((t) => {
                    index++;
                    const i = index;
                    return (
                      <li
                        key={`${t.art}-${t.id}`}
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={i === aktiv}
                        className={`search-result${i === aktiv ? ' is-active' : ''}${t.archiviert ? ' is-archived' : ''}`}
                        onMouseMove={() => aktiv !== i && setAktiv(i)}
                        onClick={() => oeffne(t)}
                      >
                        <span className="search-text">
                          <span className="search-title">{t.titel}</span>
                          <span className="search-details">
                            {t.details}
                            {t.archiviert && ' · archiviert'}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {eingabe.trim() !== '' && fehler.length > 0 && (
          <p className="search-empty">Nicht durchsucht, weil das Laden fehlschlug: {fehler.map((b) => BEREICH_LABEL[b]).join(', ')}.</p>
        )}
      </div>
    </div>
  );
}
