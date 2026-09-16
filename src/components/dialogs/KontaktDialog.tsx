import { useState } from 'react';
import { useCrm } from '../../data/CrmContext';
import { EMPTY_KONTAKT_INPUT, type Kontakt, type KontaktInput } from '../../data/types';
import { fieldOf } from '../../lib/errors';
import { Dialog } from '../Dialog';
import { useToast } from '../Toasts';
import { Field, FormError } from '../ui';

interface Props {
  firmaId: string;
  kontakt?: Kontakt;
  onClose(): void;
}

export function KontaktDialog({ firmaId, kontakt, onClose }: Props) {
  const { mutate } = useCrm();
  const toast = useToast();
  const [values, setValues] = useState<KontaktInput>(() => {
    if (!kontakt) return EMPTY_KONTAKT_INPUT;
    const { vorname, nachname, rolle, email, telefon, linkedin, hauptkontakt, notiz } = kontakt;
    return { vorname, nachname, rolle, email, telefon, linkedin, hauptkontakt, notiz };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const set = (field: keyof KontaktInput) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: e.target.value }));
  const invalid = fieldOf(error);

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await mutate((s) => s.saveKontakt(firmaId, values, kontakt && { id: kontakt.id, expectedGeaendertAm: kontakt.geaendert_am }));
      toast.show(kontakt ? 'Kontakt gespeichert' : 'Kontakt angelegt');
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!kontakt || !window.confirm('Kontakt archivieren? Er bleibt im Sheet erhalten.')) return;
    setBusy(true);
    try {
      await mutate((s) => s.setKontaktArchiviert(kontakt.id, true, kontakt.geaendert_am));
      toast.show('Kontakt archiviert');
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={kontakt ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}
      onClose={onClose}
      onSubmit={save}
      busy={busy}
      extraActions={
        kontakt && (
          <button type="button" className="button subtle" onClick={archive} disabled={busy}>
            Archivieren
          </button>
        )
      }
    >
      <div className="grid">
        <Field label="Vorname">
          <input value={values.vorname} onChange={set('vorname')} autoComplete="off" />
        </Field>
        <Field label="Nachname" invalid={invalid === 'nachname'}>
          <input value={values.nachname} onChange={set('nachname')} autoComplete="off" />
        </Field>
        <Field label="Rolle" wide>
          <input value={values.rolle} onChange={set('rolle')} placeholder="z. B. Geschäftsführer, Head of E-Commerce" />
        </Field>
        <Field label="E-Mail" invalid={invalid === 'email'}>
          <input type="email" value={values.email} onChange={set('email')} autoComplete="off" />
        </Field>
        <Field label="Telefon">
          <input type="tel" value={values.telefon} onChange={set('telefon')} autoComplete="off" />
        </Field>
        <Field label="LinkedIn" wide>
          <input type="url" value={values.linkedin} onChange={set('linkedin')} placeholder="https://www.linkedin.com/in/…" />
        </Field>
        <Field label="Notiz" wide>
          <textarea rows={2} value={values.notiz} onChange={set('notiz')} />
        </Field>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={values.hauptkontakt} onChange={(e) => setValues((v) => ({ ...v, hauptkontakt: e.target.checked }))} />
        Hauptansprechpartner
      </label>
      <FormError error={error} />
    </Dialog>
  );
}
