import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { VERNETZUNG_KEINE_REAKTION, VERNETZUNG_TAGE, type VernetzungErgebnis } from '../../data/constants';
import { useCrm } from '../../data/CrmContext';
import type { CrmService } from '../../data/crm';
import { ValidationError } from '../../data/errors';
import { kontaktName, nameAusLinkedin } from '../../data/rules';
import type { Deal, Firma } from '../../data/types';
import { EMPTY_KONTAKT_INPUT } from '../../data/types';
import { fieldOf } from '../../lib/errors';
import { useIch } from '../../lib/useIch';
import { Dialog } from '../Dialog';
import { useToast } from '../Toasts';
import { Field, FormError } from '../ui';

const NEU = '__neu__';

/** Generator link after a request was answered: the deal, its contact and the channel to write on. */
const generatorLink = (deal: Deal, kanal: 'linkedin_nachricht' | 'email') =>
  `/contact?firma=${deal.firma_id}&deal=${deal.id}${deal.kontakt_id ? `&kontakt=${deal.kontakt_id}` : ''}&kanal=${kanal}`;

/**
 * Who the request goes to: an existing contact of the firm or a new one from a pasted LinkedIn link.
 * `ohne` leaves out the person who already got a request.
 */
function usePersonWahl(firma: Firma, vorschlag: string, ohne = '') {
  const { db } = useCrm();
  const kontakte = (db?.kontakte ?? []).filter((k) => k.firma_id === firma.id && !k.archiviert && k.id !== ohne);
  const start = kontakte.find((k) => k.id === vorschlag) ?? kontakte.find((k) => k.hauptkontakt) ?? kontakte[0];
  const [wahl, setWahl] = useState(start?.id ?? NEU);
  const [neu, setNeu] = useState({ linkedin: '', vorname: '', nachname: '', rolle: '' });

  const setLinkedin = (linkedin: string) =>
    setNeu((n) => (n.vorname || n.nachname ? { ...n, linkedin } : { ...n, linkedin, ...nameAusLinkedin(linkedin) }));

  /** Creates the new contact if needed and returns the chosen contact's id. */
  const ermittle = async (s: CrmService) => {
    if (wahl !== NEU) return wahl;
    const kontakt = await s.saveKontakt(firma.id, { ...EMPTY_KONTAKT_INPUT, ...neu });
    return kontakt.id;
  };
  const pruefe = () => {
    if (wahl === NEU && !neu.vorname.trim() && !neu.nachname.trim()) throw new ValidationError('nachname', 'Bitte den Namen der Person angeben oder den LinkedIn-Link einfügen.');
  };

  const felder = (invalid?: string) => (
    <>
      <Field label="An wen?">
        <select value={wahl} onChange={(e) => setWahl(e.target.value)}>
          {kontakte.map((k) => (
            <option key={k.id} value={k.id}>
              {kontaktName(k) || k.email}
              {k.rolle ? ` · ${k.rolle}` : ''}
            </option>
          ))}
          <option value={NEU}>+ Neuer Ansprechpartner …</option>
        </select>
      </Field>
      {wahl === NEU && (
        <div className="grid">
          <Field label="LinkedIn-Profil" wide hint="Link einfügen, der Name wird übernommen">
            <input value={neu.linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://www.linkedin.com/in/…" />
          </Field>
          <Field label="Vorname">
            <input value={neu.vorname} onChange={(e) => setNeu((n) => ({ ...n, vorname: e.target.value }))} />
          </Field>
          <Field label="Nachname" invalid={invalid === 'nachname'}>
            <input value={neu.nachname} onChange={(e) => setNeu((n) => ({ ...n, nachname: e.target.value }))} />
          </Field>
          <Field label="Rolle" wide>
            <input value={neu.rolle} onChange={(e) => setNeu((n) => ({ ...n, rolle: e.target.value }))} placeholder="z. B. Geschäftsführerin, Head of E-Commerce" />
          </Field>
        </div>
      )}
    </>
  );

  return { felder, ermittle, pruefe };
}

/** Asked when a deal moves to "Vernetzung": who got the request. */
export function VernetzungDialog({ deal, firma, onClose }: { deal: Deal; firma: Firma; onClose(): void }) {
  const { db, mutate } = useCrm();
  const toast = useToast();
  const [ich] = useIch(db?.listen.team ?? []);
  const person = usePersonWahl(firma, deal.kontakt_id);
  const [notiz, setNotiz] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const submit = async () => {
    setError(undefined);
    try {
      person.pruefe();
    } catch (err) {
      return setError(err);
    }
    setBusy(true);
    try {
      await mutate(async (s) => s.sendeVernetzung(deal.id, deal.geaendert_am, { kontaktId: await person.ermittle(s), notiz, ich: ich ?? '' }));
      const zugeteilt = deal.phase === 'qualifiziert' && ich && deal.zustaendig !== ich ? ' · dir zugeteilt' : '';
      toast.show(`${firma.name}: Vernetzung angefragt · Erinnerung in ${VERNETZUNG_TAGE} Tagen${zugeteilt}`);
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Dialog title="LinkedIn-Vernetzungsanfrage gesendet" onClose={onClose} onSubmit={submit} submitLabel="Anfrage vermerken" busy={busy}>
      <p className="muted">
        {firma.name} · {deal.titel}
      </p>
      {person.felder(fieldOf(error))}
      <Field label="Notiz (optional)" hint="Landet im Verlauf der Firma">
        <textarea rows={2} value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. über gemeinsamen Kontakt, Bezug auf Magento-Support-Ende" />
      </Field>
      <p className="hint-box">In {VERNETZUNG_TAGE} Tagen erinnert dich „Mein Tag“ daran nachzusehen, ob die Anfrage angenommen wurde.</p>
      <FormError error={error} />
    </Dialog>
  );
}

const WEGE: { wert: Exclude<VernetzungErgebnis, 'angenommen'>; label: string; hinweis: string }[] = [
  { wert: 'email', label: 'Per E-Mail anschreiben', hinweis: 'Deal geht nach „Kontaktiert“, der Contact Generator öffnet mit E-Mail.' },
  { wert: 'warten', label: `Noch ${VERNETZUNG_TAGE} Tage warten`, hinweis: 'Die Anfrage bleibt offen, neue Erinnerung.' },
  { wert: 'andere', label: 'Andere Person anfragen', hinweis: `Neue Vernetzungsanfrage an jemand anderen aus der Firma, Erinnerung in ${VERNETZUNG_TAGE} Tagen.` },
  { wert: 'verloren', label: 'Deal verloren', hinweis: `Deal geht nach „Verloren“ mit Grund „${VERNETZUNG_KEINE_REAKTION}“.` },
];

/** "Nicht angenommen": pick how to go on. */
function NichtAngenommenDialog({ deal, firma, onClose }: { deal: Deal; firma: Firma; onClose(): void }) {
  const { db, mutate } = useCrm();
  const toast = useToast();
  const navigate = useNavigate();
  const [ich] = useIch(db?.listen.team ?? []);
  const [weg, setWeg] = useState<(typeof WEGE)[number]['wert']>('email');
  const person = usePersonWahl(firma, '', deal.kontakt_id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const bisher = db?.kontakte.find((k) => k.id === deal.kontakt_id);

  const submit = async () => {
    setError(undefined);
    try {
      if (weg === 'andere') person.pruefe();
    } catch (err) {
      return setError(err);
    }
    setBusy(true);
    try {
      if (weg === 'andere') {
        await mutate(async (s) => s.sendeVernetzung(deal.id, deal.geaendert_am, { kontaktId: await person.ermittle(s), notiz: '', ich: ich ?? '' }));
        toast.show(`${firma.name}: neue Vernetzungsanfrage vermerkt · Erinnerung in ${VERNETZUNG_TAGE} Tagen`);
      } else {
        await mutate((s) => s.vernetzungErgebnis(deal.id, deal.geaendert_am, weg, ich ?? ''));
        toast.show(
          weg === 'email' ? `${firma.name}: Kontaktiert über E-Mail` : weg === 'warten' ? `${firma.name}: neue Erinnerung in ${VERNETZUNG_TAGE} Tagen` : `${firma.name}: Verloren`,
        );
      }
      onClose();
      if (weg === 'email') navigate(generatorLink(deal, 'email'));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Dialog title="Vernetzung nicht angenommen" onClose={onClose} onSubmit={submit} submitLabel={weg === 'email' ? 'Weiter zum Generator' : 'Übernehmen'} busy={busy}>
      <p className="muted">
        {firma.name} · {deal.titel}
        {bisher && ` · Anfrage an ${kontaktName(bisher)}`}
      </p>
      <fieldset className="plain vernetzung-wege">
        <legend>Wie geht es weiter?</legend>
        {WEGE.map((w) => (
          <label key={w.wert} className="checkbox">
            <input type="radio" name="vernetzung-weg" checked={weg === w.wert} onChange={() => setWeg(w.wert)} />
            <span>
              {w.label}
              <small className="muted">{w.hinweis}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {weg === 'andere' && person.felder(fieldOf(error))}
      <FormError error={error} />
    </Dialog>
  );
}

/**
 * "Angenommen" moves the deal to "Kontaktiert" and opens the Contact Generator for a LinkedIn message;
 * "Nicht angenommen" asks how to go on.
 */
export function VernetzungKnoepfe({ deal, firma }: { deal: Deal; firma: Firma }): ReactNode {
  const { db, perform } = useCrm();
  const navigate = useNavigate();
  const [ich] = useIch(db?.listen.team ?? []);
  const [offen, setOffen] = useState(false);
  const [busy, setBusy] = useState(false);

  const angenommen = async () => {
    setBusy(true);
    const ok = await perform((s) => s.vernetzungErgebnis(deal.id, deal.geaendert_am, 'angenommen', ich ?? ''), `${firma.name}: Vernetzung angenommen · Kontaktiert`);
    setBusy(false);
    if (ok) navigate(generatorLink(deal, 'linkedin_nachricht'));
  };

  return (
    <div className="vernetzung-knoepfe">
      <button type="button" className="button small" onClick={() => void angenommen()} disabled={busy}>
        Angenommen
      </button>
      <button type="button" className="button small subtle" onClick={() => setOffen(true)} disabled={busy}>
        Nicht angenommen
      </button>
      {offen && <NichtAngenommenDialog deal={deal} firma={firma} onClose={() => setOffen(false)} />}
    </div>
  );
}
