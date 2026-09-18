import { useMemo, useState, type ChangeEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { isDemo } from '../../config';
import { useCrm } from '../../data/CrmContext';
import type { CalendarEvent } from '../../data/google/calendar';
import { addDays, isoDate } from '../../data/ids';
import { firmaFuerTermin, neueTerminZeit, terminZeit, verschiebeBeginn, type TerminZeit } from '../../data/kalender';
import { kontaktName } from '../../data/rules';
import type { Firma } from '../../data/types';
import { fieldOf } from '../../lib/errors';
import { Dialog } from '../Dialog';
import { useToast } from '../Toasts';
import { Field, FormError } from '../ui';

interface Props {
  /** Change this appointment; without it a new one is created. */
  termin?: CalendarEvent;
  /** Fixed firm, when opened from a firm's file. */
  firma?: Firma;
  kontaktId?: string;
  /** Day and optionally time of a new appointment; defaults to tomorrow. */
  tag?: string;
  zeit?: string;
  /** Colleague addresses offered for quick selection. */
  kollegen?: string[];
  onClose(): void;
  onGespeichert?(): void;
}

const splitEmails = (text: string) => text.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
const toggle = (liste: string[], wert: string) => (liste.includes(wert) ? liste.filter((x) => x !== wert) : [...liste, wert]);

export function TerminDialog({ termin, firma: festeFirma, kontaktId, tag, zeit, kollegen = [], onClose, onGespeichert }: Props) {
  const { db, mutate } = useCrm();
  const { userEmail } = useAuth();
  const toast = useToast();
  const eigeneEmail = userEmail().toLowerCase();
  const eigeneDomain = eigeneEmail.split('@')[1] ?? '';
  const firmen = useMemo(() => (db?.firmen ?? []).filter((f) => !f.archiviert).sort((a, b) => a.name.localeCompare(b.name, 'de')), [db]);

  // Splits the guests of an existing appointment into the firm's contacts, colleagues and everyone else.
  const [anfang] = useState(() => {
    const firma = festeFirma ?? (termin && db ? firmaFuerTermin(db, termin, eigeneEmail) : undefined);
    const gaeste = (termin?.gaeste ?? []).map((g) => g.email.toLowerCase()).filter((e) => e !== eigeneEmail);
    const firmenKontakte = (db?.kontakte ?? []).filter((k) => k.firma_id === firma?.id && !k.archiviert && k.email);
    const kontakte = termin
      ? firmenKontakte.filter((k) => gaeste.includes(k.email.toLowerCase())).map((k) => k.id)
      : [kontaktId ?? firmenKontakte.find((k) => k.hauptkontakt)?.id].filter((id): id is string => Boolean(id));
    const kontaktEmails = firmenKontakte.filter((k) => kontakte.includes(k.id)).map((k) => k.email.toLowerCase());
    const uebrige = gaeste.filter((e) => !kontaktEmails.includes(e));
    return {
      firmaId: firma?.id ?? '',
      kontakte,
      kollegen: uebrige.filter((e) => e.split('@')[1] === eigeneDomain),
      weitere: uebrige.filter((e) => e.split('@')[1] !== eigeneDomain).join(', '),
    };
  });

  const [titel, setTitel] = useState(termin?.titel ?? (festeFirma ? `Velonify × ${festeFirma.name}` : ''));
  const [zeiten, setZeiten] = useState<TerminZeit>(() =>
    termin ? terminZeit(termin) : neueTerminZeit(tag ?? addDays(isoDate(new Date()), 1), new Date(), zeit, festeFirma ? 30 : 60),
  );
  const [firmaId, setFirmaId] = useState(anfang.firmaId);
  const [ausgewaehlt, setAusgewaehlt] = useState<string[]>(anfang.kontakte);
  const [kollegenAuswahl, setKollegenAuswahl] = useState<string[]>(anfang.kollegen);
  const [weitere, setWeitere] = useState(anfang.weitere);
  const [ort, setOrt] = useState(termin?.ort ?? '');
  const [beschreibung, setBeschreibung] = useState(termin?.beschreibung ?? '');
  const [meet, setMeet] = useState(termin ? Boolean(termin.meetLink) : Boolean(festeFirma));
  const [einladungSenden, setEinladungSenden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const invalid = fieldOf(error);

  const firma = festeFirma ?? firmen.find((f) => f.id === firmaId);
  const kontakte = (db?.kontakte ?? []).filter((k) => k.firma_id === firmaId && !k.archiviert);
  const kollegenListe = [...new Set([...kollegen, ...anfang.kollegen])].filter((e) => e !== eigeneEmail);
  const gaesteAnzahl = ausgewaehlt.length + kollegenAuswahl.length + splitEmails(weitere).length;
  const hatGaeste = gaesteAnzahl > 0 || (termin?.gaeste ?? []).length > 0;

  const setZeit = (feld: keyof TerminZeit) => (e: ChangeEvent<HTMLInputElement>) => {
    const wert = e.target.value;
    setZeiten((z) => {
      if (feld === 'von_zeit') return verschiebeBeginn(z, z.von_datum, wert);
      if (feld === 'von_datum' && !z.ganztaegig) return verschiebeBeginn(z, wert, z.von_zeit);
      if (feld === 'von_datum') return { ...z, von_datum: wert, bis_datum: wert > z.bis_datum ? wert : z.bis_datum };
      return { ...z, [feld]: wert };
    });
  };

  const waehleFirma = (id: string) => {
    setFirmaId(id);
    const haupt = (db?.kontakte ?? []).find((k) => k.firma_id === id && !k.archiviert && k.hauptkontakt && k.email);
    setAusgewaehlt(haupt ? [haupt.id] : []);
    const neu = firmen.find((f) => f.id === id);
    if (neu && !titel.trim()) setTitel(`Velonify × ${neu.name}`);
  };

  const eingabe = () => ({
    firma_id: firma?.id ?? '',
    kontakt_ids: ausgewaehlt,
    weitere_emails: [...kollegenAuswahl, ...splitEmails(weitere)],
    titel,
    ...zeiten,
    ort,
    beschreibung,
    meet,
    einladungSenden,
  });

  const ausfuehren = async (aktion: () => Promise<string>) => {
    setBusy(true);
    setError(undefined);
    try {
      toast.show(await aktion());
      onGespeichert?.();
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const save = () =>
    ausfuehren(async () => {
      const gespeichert = await mutate((s) => (termin ? s.aendereTermin(termin, eingabe()) : s.planeTermin(eingabe())));
      return [
        termin ? 'Termin gespeichert' : 'Termin angelegt',
        einladungSenden && gaesteAnzahl > 0 && (termin ? 'Teilnehmende informiert' : 'Einladungen verschickt'),
        gespeichert.meetLink && !termin?.meetLink && 'mit Meet-Link',
      ]
        .filter(Boolean)
        .join(' · ');
    });

  const loeschen = () => {
    if (!termin) return;
    const absage = einladungSenden && (termin.gaeste ?? []).length > 0;
    if (!window.confirm(`Termin „${termin.titel}“ löschen?${absage ? ' Die Teilnehmenden bekommen eine Absage.' : ''}`)) return;
    void ausfuehren(async () => {
      await mutate((s) => s.loescheTermin(termin, einladungSenden));
      return 'Termin gelöscht';
    });
  };

  const googleLink = !isDemo && termin?.link;

  return (
    <Dialog
      title={termin ? 'Termin bearbeiten' : 'Neuer Termin'}
      onClose={onClose}
      onSubmit={save}
      submitLabel={termin ? 'Speichern' : einladungSenden && gaesteAnzahl > 0 ? 'Anlegen & einladen' : 'Termin anlegen'}
      busy={busy}
      wide
      extraActions={
        termin && (
          <>
            <button type="button" className="button subtle" onClick={loeschen} disabled={busy}>
              Löschen
            </button>
            {googleLink && (
              <a className="button subtle" href={googleLink} target="_blank" rel="noreferrer noopener">
                In Google ↗
              </a>
            )}
          </>
        )
      }
    >
      {termin?.serie && <p className="hint-box warn">Das ist ein Serientermin. Änderungen gelten nur für diesen einen Termin.</p>}
      <div className="grid">
        <Field label="Titel" wide invalid={invalid === 'titel'}>
          <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z. B. Kickoff, Fokuszeit, Urlaub" />
        </Field>
      </div>

      <div className="termin-optionen">
        <label className="checkbox">
          <input type="checkbox" checked={zeiten.ganztaegig} onChange={(e) => setZeiten((z) => ({ ...z, ganztaegig: e.target.checked }))} />
          Ganztägig
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={meet} onChange={(e) => setMeet(e.target.checked)} />
          Google Meet hinzufügen
        </label>
      </div>

      <div className="grid termin-zeiten">
        <Field label={zeiten.ganztaegig ? 'Von' : 'Beginn'} invalid={invalid === 'von_datum'}>
          <input type="date" value={zeiten.von_datum} onChange={setZeit('von_datum')} />
        </Field>
        {!zeiten.ganztaegig && (
          <Field label="Uhrzeit" invalid={invalid === 'von_zeit'}>
            <input type="time" value={zeiten.von_zeit} onChange={setZeit('von_zeit')} step={300} />
          </Field>
        )}
        <Field label={zeiten.ganztaegig ? 'Bis einschließlich' : 'Ende'} invalid={invalid === 'bis_datum'}>
          <input type="date" value={zeiten.bis_datum} min={zeiten.von_datum} onChange={setZeit('bis_datum')} />
        </Field>
        {!zeiten.ganztaegig && (
          <Field label="Uhrzeit" invalid={invalid === 'bis_zeit'}>
            <input type="time" value={zeiten.bis_zeit} onChange={setZeit('bis_zeit')} step={300} />
          </Field>
        )}
      </div>

      <div className="grid">
        {!festeFirma && (
          <Field label="Firma im CRM" hint="Optional – neue Termine erscheinen dann im Verlauf der Firma">
            <select value={firmaId} onChange={(e) => waehleFirma(e.target.value)}>
              <option value="">Keine Firma</option>
              {firmen.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Ort" wide={Boolean(festeFirma)}>
          <input value={ort} onChange={(e) => setOrt(e.target.value)} placeholder="Büro, Adresse …" />
        </Field>
      </div>

      {firma && (
        <fieldset className="plain">
          <legend className="field-label">Teilnehmende von {firma.name}</legend>
          {kontakte.length === 0 && <p className="muted">Noch keine Kontakte angelegt – unten E-Mail-Adressen eintragen.</p>}
          {kontakte.map((k) => (
            <label key={k.id} className={`checkbox${k.email ? '' : ' is-disabled'}`}>
              <input type="checkbox" checked={ausgewaehlt.includes(k.id)} onChange={() => setAusgewaehlt((ids) => toggle(ids, k.id))} disabled={!k.email} />
              {kontaktName(k)} <span className="muted">{k.email || 'keine E-Mail'}</span>
            </label>
          ))}
        </fieldset>
      )}

      {kollegenListe.length > 0 && (
        <fieldset className="plain">
          <legend className="field-label">Kolleg:innen einladen</legend>
          <div className="termin-optionen">
            {kollegenListe.map((email) => (
              <label key={email} className="checkbox">
                <input type="checkbox" checked={kollegenAuswahl.includes(email)} onChange={() => setKollegenAuswahl((l) => toggle(l, email))} />
                {email}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid">
        <Field
          label="Weitere Teilnehmende"
          wide
          invalid={invalid === 'weitere_emails'}
          hint="E-Mail-Adressen, mit Komma getrennt. Eingeladene bekommen den Termin in ihren eigenen Kalender."
        >
          <input value={weitere} onChange={(e) => setWeitere(e.target.value)} placeholder={`name@${eigeneDomain || 'firma.de'}`} />
        </Field>
        <Field label="Beschreibung" wide>
          <textarea rows={3} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} placeholder="Agenda, Vorbereitung …" />
        </Field>
      </div>

      {hatGaeste && (
        <label className="checkbox">
          <input type="checkbox" checked={einladungSenden} onChange={(e) => setEinladungSenden(e.target.checked)} />
          {termin ? 'Teilnehmende per E-Mail über Änderungen oder die Absage informieren' : 'Einladung per E-Mail an alle Teilnehmenden senden'}
        </label>
      )}
      <p className="muted small">Der Termin steht in deinem Google Kalender{meet ? ' und hat einen Meet-Link' : ''}.</p>
      <FormError error={error} />
    </Dialog>
  );
}
