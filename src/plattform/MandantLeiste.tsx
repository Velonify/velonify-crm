import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog } from '../components/Dialog';
import { WerkzeugIcon } from '../components/Icons';
import { useToast } from '../components/Toasts';
import { FEEDBACK_FRAGEN, GRUENDERPREIS_AB_TAG, PAKETE, type FeedbackAnlass, type Paket } from '../data/plattform';
import { useMandant } from './MandantContext';

/** What each package adds, in the order of the booking dialog. Prices and quotas come from PAKETE. */
const PAKET_PUNKTE: Record<Exclude<Paket, 'test'>, string[]> = {
  basis: ['CRM, Pipeline, To-dos und Angebote', 'bis 3 Personen', '50 KI-Aktionen im Monat'],
  pro: ['alles aus Basis', `${PAKETE.pro.leads} neue Leads im Monat aus dem Lead-Markt`, 'Helpdesk- und Technik-Filter', 'Anschreiben und Shop-Audit mit Claude (500 im Monat)', 'bis 10 Personen'],
  agentur: ['alles aus Pro', `${PAKETE.agentur.leads} Leads im Monat`, '1.500 KI-Aktionen', 'unbegrenzt viele Personen', 'eigene Werkzeuge nach Absprache'],
};

const tageText = (n: number) => (n === 1 ? '1 Tag' : `${n} Tagen`);

/**
 * The tenant's bar above every page: trial days left, leads used, and the way to book. From day 20 it offers the
 * founder price; after the trial it says what still works. Velonify's own hub shows nothing.
 */
export function MandantLeiste() {
  const { sicht } = useMandant();
  const [buchen, setBuchen] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackAnlass | null>(null);
  // The due question opens once per session, not on every page.
  useEffect(() => {
    // Not on top of the welcome dialog: the question waits until the terms are confirmed.
    if (!sicht?.feedback_frage || !sicht.mandant.bedingungen_am) return;
    const schluessel = `velonify-hub.frage.${sicht.feedback_frage}`;
    try {
      if (sessionStorage.getItem(schluessel)) return;
      sessionStorage.setItem(schluessel, '1');
    } catch {
      // Storage blocked: the question just comes again after a reload.
    }
    setFeedback(sicht.feedback_frage);
  }, [sicht?.feedback_frage, sicht?.mandant.bedingungen_am]);
  if (!sicht) return null;

  const { mandant, zugriff, tage_uebrig, leads, test_tag } = sicht;
  const gebucht = Boolean(mandant.buchung_am);
  const gruenderpreis = mandant.status === 'test' && test_tag >= GRUENDERPREIS_AB_TAG && zugriff === 'voll';

  let text: string;
  let warn = false;
  if (zugriff === 'gesperrt') {
    text = 'Euer Zugang ist gesperrt. Bucht ein Paket, dann ist alles sofort wieder da.';
    warn = true;
  } else if (zugriff === 'nur_lesen') {
    text = 'Der Test ist vorbei. Ihr könnt alles ansehen, aber nichts mehr ändern. Mit einem Paket arbeitet ihr nahtlos weiter.';
    warn = true;
  } else if (mandant.status === 'test' && tage_uebrig !== null) {
    text = `Test: noch ${tageText(tage_uebrig)} · ${leads.verbraucht} von ${leads.kontingent} Leads freigeschaltet`;
    warn = tage_uebrig <= 5;
  } else {
    text = `${PAKETE[mandant.paket]?.name ?? mandant.paket} · ${leads.verbraucht} von ${leads.kontingent} Leads in diesem Monat`;
  }
  if (mandant.status !== 'test' && zugriff === 'voll' && leads.verbraucht < leads.kontingent) {
    // Paying tenants only see the bar when something needs them.
    return <BedingungenDialog />;
  }

  return (
    <>
      <div className={`mandant-leiste${warn ? ' is-warn' : ''}`} role="status">
        <span className="mandant-leiste-text">
          {text}
          {gruenderpreis && !gebucht && <strong> · Gründerpreis: bucht bis Testende, der Preis bleibt 12 Monate fest.</strong>}
        </span>
        <span className="mandant-leiste-knoepfe">
          <button type="button" className="button small" onClick={() => setFeedback('frei')}>
            Feedback
          </button>
          {gebucht ? (
            <span className="mandant-leiste-hinweis">{PAKETE[mandant.buchung_paket as Paket]?.name ?? 'Paket'} angefragt – wir melden uns mit der Rechnung.</span>
          ) : (
            <button type="button" className="button small primary" onClick={() => setBuchen(true)}>
              Paket buchen
            </button>
          )}
        </span>
      </div>
      {buchen && <BuchenDialog onClose={() => setBuchen(false)} />}
      {feedback && <FeedbackDialog anlass={feedback} onClose={() => setFeedback(null)} />}
      <BedingungenDialog />
    </>
  );
}

/** Package choice. Booking sends a request; Velonify writes the invoice and switches the tenant to active. */
export function BuchenDialog({ onClose, grund }: { onClose(): void; grund?: string }) {
  const { api, sicht, neuLaden } = useMandant();
  const { show } = useToast();
  const [wahl, setWahl] = useState<Exclude<Paket, 'test'>>('pro');
  const [busy, setBusy] = useState(false);
  const gruenderpreis = sicht?.mandant.status === 'test' && (sicht?.test_tag ?? 0) >= GRUENDERPREIS_AB_TAG;

  const absenden = async () => {
    setBusy(true);
    try {
      await api.buchen(wahl);
      await neuLaden();
      show(`${PAKETE[wahl].name} angefragt. Wir melden uns mit der Rechnung, eure Daten bleiben, wie sie sind.`);
      onClose();
    } catch (err) {
      show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Paket buchen" onClose={onClose} onSubmit={absenden} submitLabel={`${PAKETE[wahl].name} anfragen`} busy={busy} wide>
      {grund && <p className="alert">{grund}</p>}
      <div className="paket-raster" role="radiogroup" aria-label="Paket">
        {(['basis', 'pro', 'agentur'] as const).map((id) => (
          <button key={id} type="button" role="radio" aria-checked={wahl === id} className={`paket-karte${wahl === id ? ' is-aktiv' : ''}`} onClick={() => setWahl(id)}>
            <span className="paket-name">
              {PAKETE[id].name}
              {id === 'pro' && <span className="paket-marke">Empfohlen</span>}
            </span>
            <span className="paket-preis">{PAKETE[id].preis}</span>
            <ul>
              {PAKET_PUNKTE[id].map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </button>
        ))}
      </div>
      <p className="field-hint">
        Zahlung per Rechnung.{gruenderpreis ? ' Gründerpreis: Wer bis Testende bucht, behält den Preis 12 Monate fest.' : ''} Alles, was ihr im Test angelegt habt, bleibt.
      </p>
    </Dialog>
  );
}

export function FeedbackDialog({ anlass, onClose }: { anlass: FeedbackAnlass; onClose(): void }) {
  const { api, neuLaden } = useMandant();
  const { show } = useToast();
  const frage = anlass === 'frei' ? null : FEEDBACK_FRAGEN[anlass];
  const [wert, setWert] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const absenden = async () => {
    if (!text.trim() && wert === null) return;
    setBusy(true);
    try {
      await api.feedback(anlass, wert, text);
      await neuLaden();
      show('Danke! Das liest Lukas direkt.');
      onClose();
    } catch (err) {
      show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={frage ? 'Kurze Frage' : 'Feedback an Velonify'} onClose={onClose} onSubmit={absenden} submitLabel="Senden" busy={busy}>
      <p>{frage?.frage ?? 'Was fehlt, was nervt, was gefällt? Jede Zeile hilft uns.'}</p>
      {frage?.skala && (
        <div className="skala" role="radiogroup" aria-label={frage.frage}>
          <span className="skala-ende">{frage.skala.links}</span>
          {Array.from({ length: frage.skala.max - frage.skala.min + 1 }, (_, i) => frage.skala!.min + i).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={wert === n} className={`skala-punkt${wert === n ? ' is-aktiv' : ''}`} onClick={() => setWert(n)}>
              {n}
            </button>
          ))}
          <span className="skala-ende">{frage.skala.rechts}</span>
        </div>
      )}
      <label className="field wide">
        <span className="field-label">{frage?.skala ? 'Warum?' : 'Deine Antwort'}</span>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
    </Dialog>
  );
}

/** The trial terms, confirmed once per tenant before the first lead is unlocked. */
function BedingungenDialog() {
  const { api, sicht, neuLaden } = useMandant();
  const [busy, setBusy] = useState(false);
  if (!sicht || sicht.mandant.bedingungen_am) return null;
  const bestaetigen = async () => {
    setBusy(true);
    try {
      await api.bedingungen();
      await neuLaden();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Willkommen im Velonify Hub" onClose={() => undefined} onSubmit={bestaetigen} submitLabel="Verstanden, los geht’s" busy={busy}>
      <p>Schön, dass ihr den Hub testet. Drei Dinge vorab:</p>
      <ul className="bedingungen">
        <li>
          <strong>{sicht.tage_uebrig ?? 30} Tage</strong> mit allen Werkzeugen und <strong>{sicht.leads.kontingent} Leads</strong> aus dem Lead-Markt. Danach könnt ihr eine Woche lang alles ansehen, aber nichts mehr ändern, bis ihr ein Paket bucht.
        </li>
        <li>
          Die Leads sind <strong>nur für euch</strong>: Keine Weitergabe an Dritte, kein Export in andere Systeme. Jeder Lead geht nur an ein Team.
        </li>
        <li>Was ihr selbst anlegt, gehört euch. Eure Daten liegen in einer eigenen Datenbank, die niemand sonst sieht.</li>
      </ul>
      <p className="field-hint">Mit „Verstanden“ bestätigst du diese Testbedingungen für {sicht.mandant.name}.</p>
    </Dialog>
  );
}

/** Shown in place of a page whose tool is off for this tenant. */
export function Gesperrt({ titel }: { titel: string }) {
  const [buchen, setBuchen] = useState(false);
  const { sicht } = useMandant();
  return (
    <div className="page">
      <div className="leer-hinweis gesperrt">
        <WerkzeugIcon id="schloss" />
        <h1>{titel}</h1>
        <p>{sicht ? 'Dieses Werkzeug ist in eurem Paket nicht enthalten.' : 'Diese Seite gibt es hier nicht.'}</p>
        {sicht && (
          <button type="button" className="button primary" onClick={() => setBuchen(true)}>
            Pakete ansehen
          </button>
        )}
        <Link to="/" className="button">
          Zur Startseite
        </Link>
      </div>
      {buchen && <BuchenDialog onClose={() => setBuchen(false)} />}
    </div>
  );
}

