import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { config, isDemo } from '../config';
import { DEMO_START, teamEmail } from '../data/demo/agentur';
import { useCrm } from '../data/CrmContext';
import { HERZSCHLAG_MS, PraesenzRaum, andereBei, ortLink, ortText, type Anwesend, type PraesenzArt, type PraesenzMeldung, type PraesenzObjekt } from '../data/praesenz';
import { findeTeamMitglied } from '../data/selectors';
import { kuerzelVon } from '../data/zustaendig';
import { shortUser } from '../lib/format';
import { bereichFuerPfad } from '../werkzeuge';

type Senden = (meldung: PraesenzMeldung | { tab: string; weg: true }) => Promise<Anwesend[]>;

function apiSenden(url: string, getToken: () => Promise<string>): Senden {
  return async (meldung) => {
    const antwort = await fetch(`${url.replace(/\/$/, '')}/praesenz`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(meldung),
      // "Gone" is sent while the tab closes; keepalive lets it finish anyway.
      keepalive: 'weg' in meldung,
    });
    if (!antwort.ok) throw new Error(`Präsenz: ${antwort.status}`);
    return ((await antwort.json()) as { anwesende: Anwesend[] }).anwesende;
  };
}

/** Demo mode has no server: a made-up colleague opens whatever you open, so the hints can be tried out. */
function demoSenden(): Senden {
  const raum = new PraesenzRaum();
  return async (meldung) => {
    if ('weg' in meldung) return [];
    raum.melde(teamEmail('Aylin'), { ...meldung, tab: 'demo' });
    return raum.anwesende(DEMO_START.email);
  };
}

interface PraesenzWert {
  anwesende: Anwesend[];
  setzeObjekt(schluessel: symbol, objekt: PraesenzObjekt | null): void;
}

const PraesenzKontext = createContext<PraesenzWert>({ anwesende: [], setzeObjekt: () => undefined });

/**
 * Tells crm-api where this tab is (page plus open card, company or client) and keeps the list of everyone else.
 * Only visible tabs report; hiding or closing the tab says goodbye right away.
 */
export function PraesenzProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const { pathname } = useLocation();
  const [anwesende, setAnwesende] = useState<Anwesend[]>([]);
  const [objekte, setObjekte] = useState<{ schluessel: symbol; objekt: PraesenzObjekt }[]>([]);
  const tab = useMemo(() => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2), []);
  const senden = useMemo(() => (isDemo ? demoSenden() : apiSenden(config.crmApiUrl, getToken)), [getToken]);

  // The record opened last wins, e.g. a card dialog on top of a client page.
  const objekt = objekte.at(-1)?.objekt ?? null;
  const meldung = useRef<PraesenzMeldung>({ tab, pfad: pathname, bereich: '', objekt });
  meldung.current = { tab, pfad: pathname, bereich: bereichFuerPfad(pathname), objekt };

  const melden = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      setAnwesende(await senden(meldung.current));
    } catch {
      // Offline, signed out or crm-api without the route yet: the hints simply stay away.
      setAnwesende([]);
    }
  }, [senden]);

  const objektSchluessel = objekt ? `${objekt.art}\n${objekt.id}\n${objekt.titel}` : '';
  useEffect(() => {
    // Short pause, so clicking through several pages sends only the last one.
    const timer = window.setTimeout(() => void melden(), 300);
    return () => window.clearTimeout(timer);
  }, [pathname, objektSchluessel, melden]);

  useEffect(() => {
    const timer = window.setInterval(() => void melden(), HERZSCHLAG_MS);
    const weg = () => void senden({ tab, weg: true }).catch(() => undefined);
    const sichtbarkeit = () => (document.visibilityState === 'visible' ? void melden() : weg());
    document.addEventListener('visibilitychange', sichtbarkeit);
    window.addEventListener('pagehide', weg);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', sichtbarkeit);
      window.removeEventListener('pagehide', weg);
    };
  }, [melden, senden, tab]);

  const setzeObjekt = useCallback((schluessel: symbol, neu: PraesenzObjekt | null) => {
    setObjekte((alle) => {
      const ohne = alle.filter((o) => o.schluessel !== schluessel);
      return neu ? [...ohne, { schluessel, objekt: neu }] : ohne;
    });
  }, []);

  const wert = useMemo(() => ({ anwesende, setzeObjekt }), [anwesende, setzeObjekt]);
  return <PraesenzKontext.Provider value={wert}>{children}</PraesenzKontext.Provider>;
}

/** Reports that this tab has a record open while the component is mounted, e.g. the card dialog. */
export function useAnwesenheit(objekt: PraesenzObjekt | null) {
  const { setzeObjekt } = useContext(PraesenzKontext);
  const art = objekt?.art;
  const id = objekt?.id;
  const titel = objekt?.titel;
  useEffect(() => {
    if (!art || !id) return;
    const schluessel = Symbol(id);
    setzeObjekt(schluessel, { art, id, titel: titel ?? '' });
    return () => setzeObjekt(schluessel, null);
  }, [art, id, titel, setzeObjekt]);
}

export function useAnwesende(): Anwesend[] {
  return useContext(PraesenzKontext).anwesende;
}

/** Team name of someone in the list: from crm-api, else guessed from the address like everywhere in the hub. */
export function nameVon(a: Pick<Anwesend, 'email' | 'name'>, team: readonly string[]): string {
  return a.name || findeTeamMitglied(team, '', a.email) || shortUser(a.email);
}

/** Names of the others who have this record open, for badges on cards. */
export function useOffenBei(art: PraesenzArt): Map<string, string[]> {
  const anwesende = useAnwesende();
  const { db } = useCrm();
  const team = db?.listen.team ?? [];
  const namen = new Map<string, string[]>();
  for (const a of anwesende) {
    if (a.objekt?.art !== art) continue;
    namen.set(a.objekt.id, [...(namen.get(a.objekt.id) ?? []), nameVon(a, team)]);
  }
  return namen;
}

const WAS: Record<PraesenzArt, string> = { karte: 'diese Karte', firma: 'diese Firma', kunde: 'diesen Kunden' };

function aufzaehlen(namen: string[]): string {
  return namen.length <= 1 ? (namen[0] ?? '') : `${namen.slice(0, -1).join(', ')} und ${namen.at(-1)}`;
}

/** Hint at the top of a card, company or client: who else has it open right now. */
export function AuchOffen({ art, id }: { art: PraesenzArt; id: string | undefined }) {
  const anwesende = useAnwesende();
  const { db } = useCrm();
  const andere = andereBei(anwesende, art, id);
  if (andere.length === 0) return null;
  const namen = andere.map((a) => nameVon(a, db?.listen.team ?? []));
  return (
    <div className="hint-box warn auch-offen" role="status">
      <span className="anwesend-punkt" aria-hidden="true" />
      <span>
        <strong>{aufzaehlen(namen)}</strong> {namen.length === 1 ? 'hat' : 'haben'} {WAS[art]} gerade auch offen. Sprecht euch kurz ab, bevor ihr beide etwas ändert.
      </span>
    </div>
  );
}

/** Sidebar list: who else is in the hub and where; a click goes there. */
export function GeradeOnline() {
  const anwesende = useAnwesende();
  const { db } = useCrm();
  const team = db?.listen.team ?? [];
  if (anwesende.length === 0) return null;
  return (
    <nav className="anwesende" aria-label="Gerade online">
      <span className="nav-abschnitt">Gerade online</span>
      {anwesende.map((a) => {
        const name = nameVon(a, team);
        const ort = ortText(a);
        return (
          <Link key={a.email} to={ortLink(a)} className="anwesend" title={`${name}: ${ort}`}>
            <span className="anwesend-avatar" aria-hidden="true">
              {kuerzelVon(name)[0] ?? name.slice(0, 2)}
            </span>
            <span className="anwesend-text">
              <span className="anwesend-name">{name}</span>
              <span className="anwesend-ort">{ort}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
