import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Schalter } from '../components/Schalter';
import { useHilfe } from '../components/Tastatur';
import { FormError, PageHeader } from '../components/ui';
import { isDemo } from '../config';
import { useCrm } from '../data/CrmContext';
import { ANSICHT_STANDARD, START_BEREICHE, zeigeStart } from '../data/ansicht';
import { useAnsicht } from '../lib/useAnsicht';
import { useIch } from '../lib/useIch';
import { useTheme } from '../lib/useTheme';
import { LEISTE, WERKZEUGE } from '../werkzeuge';
import { useRolle } from '../lib/useRolle';

const ABSCHNITTE = [
  { id: 'leiste', titel: 'Seitenleiste' },
  { id: 'start', titel: 'Startseite' },
  { id: 'seiten', titel: 'Seiten' },
  { id: 'darstellung', titel: 'Darstellung' },
  { id: 'konto', titel: 'Konto' },
];

function Zeile({ titel, text, children }: { titel: string; text?: string; children: ReactNode }) {
  return (
    <div className="einst-zeile">
      <div className="einst-text">
        <span className="einst-titel">{titel}</span>
        {text && <span className="einst-hinweis">{text}</span>}
      </div>
      {children}
    </div>
  );
}

function Abschnitt({ id, titel, hinweis, children }: { id: string; titel: string; hinweis?: string; children: ReactNode }) {
  return (
    <section className="einst-abschnitt" id={`einst-${id}`} aria-labelledby={`einst-${id}-titel`}>
      <h2 id={`einst-${id}-titel`}>{titel}</h2>
      <div className="einst-gruppe">{children}</div>
      {hinweis && <p className="einst-fuss">{hinweis}</p>}
    </section>
  );
}

/** Personal settings: what the sidebar and start page show, how busy pages are, theme and account. */
export function EinstellungenPage() {
  const { state, signOut } = useAuth();
  const user = state.status === 'signedOut' ? null : state.user;
  const { db } = useCrm();
  const [ich, setIch] = useIch(db?.listen.team ?? []);
  const { ansicht, setze, fehler } = useAnsicht();
  const [theme, setTheme] = useTheme();
  const [, setHilfe] = useHilfe();
  const { erlaubt } = useRolle();
  const werkzeuge = LEISTE.flatMap((g) => g.eintraege).filter((e, i, alle) => e.werkzeug !== 'home' && erlaubt(e.werkzeug) && alle.findIndex((x) => x.werkzeug === e.werkzeug) === i);

  const werkzeugAn = (id: string, an: boolean) =>
    setze({ ausgeblendet: an ? ansicht.ausgeblendet.filter((w) => w !== id) : [...new Set([...ansicht.ausgeblendet, id])] });

  return (
    <div className="page einstellungen">
      <PageHeader title="Einstellungen" subtitle="Nur für dich. Änderungen werden sofort gespeichert." />
      <FormError error={fehler ? new Error(`Konnte nicht gespeichert werden: ${fehler}`) : undefined} />
      <div className="einst-raster">
        <div className="einst-spalte">
          <Abschnitt id="leiste" titel="Seitenleiste" hinweis="Ausgeblendete Werkzeuge bleiben über die Suche (⌘K) erreichbar.">
            {werkzeuge.map((e) => (
              <Zeile key={e.werkzeug} titel={e.label} text={WERKZEUGE.find((w) => w.id === e.werkzeug)?.beschreibung}>
                <Schalter an={!ansicht.ausgeblendet.includes(e.werkzeug)} onChange={(an) => werkzeugAn(e.werkzeug, an)} label={`${e.label} in der Seitenleiste`} />
              </Zeile>
            ))}
            <Zeile titel="Braucht Aufmerksamkeit" text="Kunden mit überfälligen Karten und Leads mit überfälliger Wiedervorlage">
              <Schalter an={ansicht.aufmerksamkeit} onChange={(an) => setze({ aufmerksamkeit: an })} label="Braucht Aufmerksamkeit in der Seitenleiste" />
            </Zeile>
          </Abschnitt>

          <Abschnitt id="start" titel="Startseite">
            {START_BEREICHE.map((b) => (
              <Zeile key={b.id} titel={b.label} text={b.beschreibung}>
                <Schalter an={zeigeStart(ansicht, b.id)} onChange={(an) => setze({ start: { ...ansicht.start, [b.id]: an } })} label={`${b.label} auf der Startseite`} />
              </Zeile>
            ))}
          </Abschnitt>

          <Abschnitt id="seiten" titel="Seiten">
            <Zeile titel="Kennzahlen im Seitenkopf" text="Die Zahlenreihe über Pipeline, Mein Tag, Kunden, To-Dos und Co.">
              <Schalter an={ansicht.kennzahlen} onChange={(an) => setze({ kennzahlen: an })} label="Kennzahlen im Seitenkopf" />
            </Zeile>
            <Zeile titel="Erklärtexte" text="Kurze Hinweise unter dem Seitenkopf, z. B. wie man Karten verschiebt">
              <Schalter an={ansicht.erklaerungen} onChange={(an) => setze({ erklaerungen: an })} label="Erklärtexte" />
            </Zeile>
          </Abschnitt>

          <Abschnitt id="darstellung" titel="Darstellung">
            <Zeile titel="Design" text="Gilt für diesen Browser">
              <div className="segmented" role="radiogroup" aria-label="Design">
                <button type="button" role="radio" aria-checked={theme === 'light'} className={theme === 'light' ? 'is-active' : ''} onClick={() => setTheme('light')}>
                  Hell
                </button>
                <button type="button" role="radio" aria-checked={theme === 'dark'} className={theme === 'dark' ? 'is-active' : ''} onClick={() => setTheme('dark')}>
                  Dunkel
                </button>
              </div>
            </Zeile>
            <Zeile titel="Alles zurücksetzen" text="Zurück zur ruhigen Standard-Ansicht">
              <button type="button" className="button small" onClick={() => setze(ANSICHT_STANDARD)}>
                Zurücksetzen
              </button>
            </Zeile>
          </Abschnitt>

          <Abschnitt id="konto" titel="Konto">
            {user && (
              <Zeile titel={user.name} text={user.email}>
                {!isDemo && (
                  <button type="button" className="button small" onClick={signOut}>
                    Abmelden
                  </button>
                )}
              </Zeile>
            )}
            {db && db.listen.team.length > 0 && (
              <Zeile titel="Wer bist du?" text="Bestimmt „Mein Tag“, die Zahlen in der Seitenleiste und Erwähnungen">
                <select value={ich ?? ''} onChange={(e) => setIch(e.target.value)} aria-label="Teammitglied">
                  <option value="">Bitte wählen …</option>
                  {db.listen.team.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Zeile>
            )}
            <Zeile titel="Tastenkürzel" text="Alle Kürzel auf einen Blick, auch mit ? erreichbar">
              <button type="button" className="button small" onClick={() => setHilfe(true)}>
                Anzeigen
              </button>
            </Zeile>
            <Zeile titel="Einrichtung" text="Drive-Ordner, Links, Team und Daten – für alle im Team">
              <Link to="/einrichtung" className="button small">
                Öffnen
              </Link>
            </Zeile>
          </Abschnitt>
        </div>

        <nav className="einst-inhalt" aria-label="Abschnitte">
          {ABSCHNITTE.map((a) => (
            <a key={a.id} href={`#einst-${a.id}`} onClick={(e) => (e.preventDefault(), document.getElementById(`einst-${a.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))}>
              {a.titel}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
