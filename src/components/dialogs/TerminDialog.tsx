import { useState } from 'react';
import { useCrm } from '../../data/CrmContext';
import { addDays, isoDate } from '../../data/ids';
import { kontaktName } from '../../data/rules';
import type { Firma } from '../../data/types';
import { fieldOf } from '../../lib/errors';
import { Dialog } from '../Dialog';
import { useToast } from '../Toasts';
import { Field, FormError } from '../ui';

interface Props {
  firma: Firma;
  kontaktId?: string;
  onClose(): void;
}

const DAUERN = [15, 30, 45, 60, 90];

export function TerminDialog({ firma, kontaktId, onClose }: Props) {
  const { db, mutate } = useCrm();
  const toast = useToast();
  const kontakte = (db?.kontakte ?? []).filter((k) => k.firma_id === firma.id && !k.archiviert);
  const [titel, setTitel] = useState(`Velonify × ${firma.name}`);
  const [ausgewaehlt, setAusgewaehlt] = useState<string[]>(() => {
    const start = kontaktId ?? kontakte.find((k) => k.hauptkontakt && k.email)?.id;
    return start ? [start] : [];
  });
  const [weitere, setWeitere] = useState('');
  const [start, setStart] = useState(`${addDays(isoDate(new Date()), 1)}T10:00`);
  const [dauer, setDauer] = useState(30);
  const [beschreibung, setBeschreibung] = useState('');
  const [einladungSenden, setEinladungSenden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const invalid = fieldOf(error);

  const toggle = (id: string) => setAusgewaehlt((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const termin = await mutate((s) =>
        s.planeTermin({
          firma_id: firma.id,
          kontakt_ids: ausgewaehlt,
          weitere_emails: weitere.split(/[,;\s]+/).filter(Boolean),
          titel,
          start,
          dauer_min: dauer,
          beschreibung,
          einladungSenden,
        }),
      );
      toast.show(`Termin angelegt${einladungSenden ? ', Einladungen verschickt' : ''}${termin.meetLink ? ' · Meet-Link steht im Verlauf' : ''}`);
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Dialog title="Termin mit Google Meet planen" onClose={onClose} onSubmit={save} submitLabel={einladungSenden ? 'Termin anlegen & einladen' : 'Termin anlegen'} busy={busy} wide>
      <div className="grid">
        <Field label="Titel" wide invalid={invalid === 'titel'}>
          <input value={titel} onChange={(e) => setTitel(e.target.value)} />
        </Field>
        <Field label="Beginn" invalid={invalid === 'start'}>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} step={900} />
        </Field>
        <Field label="Dauer">
          <select value={dauer} onChange={(e) => setDauer(Number(e.target.value))}>
            {DAUERN.map((d) => (
              <option key={d} value={d}>
                {d} Minuten
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className={`plain${invalid === 'kontakt_ids' ? ' invalid' : ''}`}>
        <legend className="field-label">Teilnehmende von {firma.name}</legend>
        {kontakte.length === 0 && <p className="muted">Noch keine Kontakte angelegt – unten E-Mail-Adressen eintragen.</p>}
        {kontakte.map((k) => (
          <label key={k.id} className={`checkbox${k.email ? '' : ' is-disabled'}`}>
            <input type="checkbox" checked={ausgewaehlt.includes(k.id)} onChange={() => toggle(k.id)} disabled={!k.email} />
            {kontaktName(k)} <span className="muted">{k.email || 'keine E-Mail'}</span>
          </label>
        ))}
      </fieldset>

      <div className="grid">
        <Field label="Weitere Teilnehmende" wide invalid={invalid === 'weitere_emails'} hint="E-Mail-Adressen, mit Komma getrennt – z. B. Kolleg:innen">
          <input value={weitere} onChange={(e) => setWeitere(e.target.value)} placeholder="julian@velonify.de" />
        </Field>
        <Field label="Beschreibung" wide>
          <textarea rows={3} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} placeholder="Agenda, Vorbereitung …" />
        </Field>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={einladungSenden} onChange={(e) => setEinladungSenden(e.target.checked)} />
        Einladung per E-Mail an alle Teilnehmenden senden
      </label>
      <p className="muted small">Der Termin landet in deinem Google Kalender und bekommt automatisch einen Meet-Link.</p>
      <FormError error={error} />
    </Dialog>
  );
}
