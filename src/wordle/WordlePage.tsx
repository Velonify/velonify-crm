import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, Loading, PageHeader } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { isoDate } from '../data/ids';
import type { WordleErgebnis } from '../data/types';
import { MAX_VERSUCHE, muster, normalisiere, raetselNummer, rangliste, tastenFarben, teilenText, wortDesTages, WORT_LAENGE } from '../data/wordle';
import { errorMessage } from '../lib/errors';
import { useIch } from '../lib/useIch';
import { MiniMuster, Spielbrett, Tastatur } from './Spielbrett';
import { leseVersuche, speichereVersuche, useWordleErgebnisse, useWordleSpeichern } from './useWordle';

const LOB = ['Unglaublich!', 'Genial!', 'Stark!', 'Gut gemacht!', 'Knapp, aber drin!', 'Puh, gerade noch!'];

/** Hours and minutes until midnight, when the next word comes. */
function bisMorgen(jetzt: Date): string {
  const morgen = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + 1);
  const minuten = Math.ceil((morgen.getTime() - jetzt.getTime()) / 60_000);
  const h = Math.floor(minuten / 60);
  return h > 0 ? `${h} Std. ${minuten % 60} Min.` : `${minuten} Min.`;
}

export const formatSchnitt = (wert: number | null) => (wert === null ? '–' : wert.toLocaleString('de-DE', { maximumFractionDigits: 1 }));

interface Zustand {
  versuche: string[];
  eingabe: string;
  /** Counts rejected Enter presses; each one shakes the row. */
  abgelehnt: number;
}

type Aktion = { typ: 'taste'; taste: string; loesung: string } | { typ: 'laden'; versuche: string[] };

/** Pure key handling, so fast typing never works on an outdated input. */
function spielen(z: Zustand, a: Aktion): Zustand {
  if (a.typ === 'laden') return { versuche: a.versuche, eingabe: '', abgelehnt: 0 };
  if (z.versuche.includes(a.loesung) || z.versuche.length >= MAX_VERSUCHE) return z;
  if (a.taste === 'BACKSPACE') return { ...z, eingabe: z.eingabe.slice(0, -1) };
  if (a.taste === 'ENTER') {
    if (z.eingabe.length < WORT_LAENGE) return { ...z, abgelehnt: z.abgelehnt + 1 };
    return { ...z, versuche: [...z.versuche, z.eingabe], eingabe: '' };
  }
  if (/^[A-Z]$/.test(a.taste) && z.eingabe.length < WORT_LAENGE) return { ...z, eingabe: z.eingabe + a.taste };
  return z;
}

function Spiel({ tag, spieler, ergebnis, onGespeichert }: { tag: string; spieler: string; ergebnis: WordleErgebnis | undefined; onGespeichert: () => void }) {
  const toast = useToast();
  const speichern = useWordleSpeichern();
  const loesung = wortDesTages(tag);
  const [{ versuche, eingabe, abgelehnt }, dispatch] = useReducer(spielen, undefined, () => ({ versuche: leseVersuche(tag, spieler), eingabe: '', abgelehnt: 0 }));
  const [wackelt, setWackelt] = useState(false);
  const [zuKurz, setZuKurz] = useState(false);
  const [aufgedeckt, setAufgedeckt] = useState<number | null>(null);
  const [status, setStatus] = useState<'bereit' | 'speichert' | 'fehler'>('bereit');

  // Another player on the same computer has their own board.
  const geladen = useRef(`${tag}|${spieler}`);
  useEffect(() => {
    if (geladen.current === `${tag}|${spieler}`) return;
    geladen.current = `${tag}|${spieler}`;
    gesichert.current = false;
    dispatch({ typ: 'laden', versuche: leseVersuche(tag, spieler) });
  }, [tag, spieler]);

  const geloest = versuche.includes(loesung);
  const lokalFertig = geloest || versuche.length >= MAX_VERSUCHE;
  const fertig = lokalFertig || Boolean(ergebnis);
  // Finished elsewhere: this browser only knows the colours from the sheet.
  const fremdesMuster = ergebnis && !lokalFertig ? ergebnis.muster : undefined;
  const farben = useMemo(() => tastenFarben(versuche, loesung), [versuche, loesung]);

  const sichern = useCallback(
    async (alle: string[]) => {
      setStatus('speichert');
      try {
        await speichern({ datum: tag, spieler, versuche: alle.length, geloest: alle.includes(loesung), muster: muster(alle, loesung) });
        setStatus('bereit');
        onGespeichert();
      } catch (err) {
        setStatus('fehler');
        toast.show(`Ergebnis nicht gespeichert: ${errorMessage(err)}`, 'error');
      }
    },
    [speichern, tag, spieler, loesung, onGespeichert, toast],
  );

  // A new attempt: remember it in this browser, flip the row open and store the result once the game is over.
  const bekannt = useRef(versuche.length);
  useEffect(() => {
    if (versuche.length <= bekannt.current) {
      bekannt.current = versuche.length;
      return;
    }
    bekannt.current = versuche.length;
    speichereVersuche(tag, spieler, versuche);
    setAufgedeckt(versuche.length - 1);
  }, [versuche, tag, spieler]);

  // Stores the finished game once – also when the tab was closed during the last save.
  const gesichert = useRef(false);
  useEffect(() => {
    if (!lokalFertig || ergebnis || gesichert.current) return;
    gesichert.current = true;
    void sichern(versuche);
  }, [lokalFertig, ergebnis, versuche, sichern]);

  useEffect(() => {
    if (abgelehnt === 0) return;
    setZuKurz(true);
    setWackelt(true);
    const timer = window.setTimeout(() => setWackelt(false), 450);
    return () => window.clearTimeout(timer);
  }, [abgelehnt]);

  // The hint stays until the next letter.
  useEffect(() => setZuKurz(false), [eingabe]);

  const taste = useCallback((t: string) => !fertig && dispatch({ typ: 'taste', taste: t, loesung }), [fertig, loesung]);

  // Physical keyboard, unless someone is typing into a field.
  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const t = e.key === 'Enter' ? 'ENTER' : e.key === 'Backspace' ? 'BACKSPACE' : normalisiere(e.key);
      if (t === 'ENTER' || t === 'BACKSPACE' || t.length === 1) {
        // Enter on a focused button would click it as well.
        e.preventDefault();
        taste(t);
      }
    };
    window.addEventListener('keydown', beiTaste);
    return () => window.removeEventListener('keydown', beiTaste);
  }, [taste]);

  const kopieren = async () => {
    const quelle = ergebnis ?? { geloest, versuche: versuche.length, muster: muster(versuche, loesung) };
    try {
      await navigator.clipboard.writeText(teilenText(tag, quelle));
      toast.show('Ergebnis kopiert – ab damit in Slack');
    } catch {
      toast.show('Kopieren ging nicht.', 'error');
    }
  };

  const gewonnen = ergebnis ? ergebnis.geloest : geloest;
  const anzahl = ergebnis ? ergebnis.versuche : versuche.length;

  return (
    <div className="wordle-spiel">
      <Spielbrett versuche={versuche} loesung={loesung} eingabe={eingabe} fertig={fertig} fremdesMuster={fremdesMuster} aufgedeckt={aufgedeckt} wackelt={wackelt} />
      <div className="wordle-meldung" role="status" aria-live="polite">
        {fertig ? (
          <>
            <strong>{gewonnen ? LOB[anzahl - 1] : `Schade – gesucht war ${loesung}.`}</strong>
            <span className="muted">
              {gewonnen && `In ${anzahl} ${anzahl === 1 ? 'Versuch' : 'Versuchen'}. `}Nächstes Wort in {bisMorgen(new Date())}
            </span>
          </>
        ) : (
          zuKurz && <strong>Das Wort hat {WORT_LAENGE} Buchstaben.</strong>
        )}
      </div>
      {fertig ? (
        <div className="wordle-aktionen">
          {status === 'fehler' && !ergebnis ? (
            <button type="button" className="button primary" onClick={() => void sichern(versuche)}>
              Erneut speichern
            </button>
          ) : (
            <button type="button" className="button primary" onClick={kopieren} disabled={status === 'speichert'}>
              {status === 'speichert' ? 'Wird gespeichert …' : 'Ergebnis kopieren'}
            </button>
          )}
        </div>
      ) : (
        <Tastatur farben={farben} onTaste={taste} gesperrt={status === 'speichert'} />
      )}
    </div>
  );
}

export function WordlePage() {
  const { db, error: crmError, refresh } = useCrm();
  const team = db?.listen.team ?? [];
  const [ich, setIch] = useIch(team);
  const ergebnisse = useWordleErgebnisse();
  const heute = isoDate(new Date());
  const stand = useMemo(() => rangliste(ergebnisse.data ?? [], team, heute), [ergebnisse.data, team, heute]);
  const meins = stand.find((s) => s.spieler === ich);

  return (
    <div className="page">
      <PageHeader eyebrow="Home" title="Wort des Tages" subtitle={`Nr. ${raetselNummer(heute)} · Fünf Buchstaben, sechs Versuche, jeden Tag ein neues Wort für alle.`} />
      {crmError && <ErrorBox error={crmError} onRetry={refresh} />}
      {ergebnisse.error ? (
        <ErrorBox error={ergebnisse.error} onRetry={ergebnisse.reload} />
      ) : !db || (ergebnisse.loading && !ergebnisse.data) ? (
        <Loading />
      ) : (
        <div className="wordle-layout">
          <div>
            {ich ? (
              <Spiel tag={heute} spieler={ich} ergebnis={meins?.heute} onGespeichert={ergebnisse.reload} />
            ) : (
              <div className="hint-box ich-auswahl">
                <span>Wer spielt? Dein Ergebnis landet in der Team-Wertung.</span>
                <select value="" onChange={(e) => setIch(e.target.value)} aria-label="Teammitglied auswählen">
                  <option value="">Bitte wählen …</option>
                  {team.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="wordle-seite">
            <Card title="Team heute">
              <table className="wordle-rangliste">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Heute</th>
                    <th className="zahl" title="Gelöste Werktage in Folge">
                      Serie
                    </th>
                    <th className="zahl" title="Versuche im Schnitt bei gelösten Wörtern">
                      Schnitt
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stand.map((s) => (
                    <tr key={s.spieler} className={s.spieler === ich ? 'is-ich' : ''}>
                      <td>{s.spieler}</td>
                      <td>
                        {s.heute ? (
                          <span className="wordle-heute">
                            <MiniMuster muster={s.heute.muster} />
                            <span>{s.heute.geloest ? `${s.heute.versuche}/${MAX_VERSUCHE}` : 'X'}</span>
                          </span>
                        ) : (
                          <span className="muted">offen</span>
                        )}
                      </td>
                      <td className="zahl">{s.serie}</td>
                      <td className="zahl">{formatSchnitt(s.schnitt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint">Die Serie zählt Werktage; am Wochenende darf man pausieren. Gespeichert werden nur die Farben, nie die Buchstaben.</p>
            </Card>
            <Card title="So geht's">
              <ul className="wordle-regeln">
                <li>
                  <span className="wordle-feld feld-g klein">K</span> Buchstabe steht an der richtigen Stelle.
                </li>
                <li>
                  <span className="wordle-feld feld-y klein">A</span> Kommt im Wort vor, aber woanders.
                </li>
                <li>
                  <span className="wordle-feld feld-x klein">S</span> Kommt im Wort nicht vor.
                </li>
              </ul>
              <p className="hint">Die Wörter kommen aus Agentur- und Shop-Alltag. Umlaute gibt es keine.</p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
