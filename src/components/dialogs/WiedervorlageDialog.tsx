import { useMemo, useState } from 'react';
import { useCrm } from '../../data/CrmContext';
import { addDays, isoDate } from '../../data/ids';
import type { Wiedervorlage, WiedervorlageInput } from '../../data/types';
import { fieldOf } from '../../lib/errors';
import { Dialog } from '../Dialog';
import { useToast } from '../Toasts';
import { Field, FormError } from '../ui';

interface Props {
  firmaId?: string;
  dealId?: string;
  wiedervorlage?: Wiedervorlage;
  ich: string | null;
  onClose(): void;
}

export function WiedervorlageDialog({ firmaId, dealId, wiedervorlage, ich, onClose }: Props) {
  const { db, mutate } = useCrm();
  const toast = useToast();
  const heute = isoDate(new Date());
  const [values, setValues] = useState<WiedervorlageInput>(() =>
    wiedervorlage
      ? { firma_id: wiedervorlage.firma_id, deal_id: wiedervorlage.deal_id, titel: wiedervorlage.titel, faellig_am: wiedervorlage.faellig_am, zustaendig: wiedervorlage.zustaendig }
      : { firma_id: firmaId ?? '', deal_id: dealId ?? '', titel: '', faellig_am: addDays(heute, 3), zustaendig: ich ?? '' },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const set = (field: keyof WiedervorlageInput) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: e.target.value }));
  const invalid = fieldOf(error);

  const firmen = useMemo(() => (db?.firmen ?? []).filter((f) => !f.archiviert).sort((a, b) => a.name.localeCompare(b.name, 'de')), [db]);
  const deals = (db?.deals ?? []).filter((d) => d.firma_id === values.firma_id && !d.archiviert);

  const schnell: [string, string][] = [
    ['Morgen', addDays(heute, 1)],
    ['In 3 Tagen', addDays(heute, 3)],
    ['In 1 Woche', addDays(heute, 7)],
    ['In 2 Wochen', addDays(heute, 14)],
  ];

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await mutate((s) => s.saveWiedervorlage(values, wiedervorlage?.id));
      toast.show(wiedervorlage ? 'Wiedervorlage gespeichert' : 'Wiedervorlage angelegt');
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Dialog title={wiedervorlage ? 'Wiedervorlage bearbeiten' : 'Neue Wiedervorlage'} onClose={onClose} onSubmit={save} busy={busy}>
      <div className="grid">
        <Field label="Worum geht es?" wide invalid={invalid === 'titel'}>
          <input value={values.titel} onChange={set('titel')} placeholder="z. B. Nach Budgetfreigabe fragen" />
        </Field>
        {!firmaId && (
          <Field label="Firma" wide>
            <select value={values.firma_id} onChange={(e) => setValues((v) => ({ ...v, firma_id: e.target.value, deal_id: '' }))}>
              <option value="">– ohne Firma –</option>
              {firmen.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Fällig am" invalid={invalid === 'faellig_am'}>
          <input type="date" value={values.faellig_am} onChange={set('faellig_am')} />
        </Field>
        <Field label="Zuständig">
          <select value={values.zustaendig} onChange={set('zustaendig')}>
            <option value="">–</option>
            {(db?.listen.team ?? []).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <div className="quick-dates wide">
          {schnell.map(([label, datum]) => (
            <button key={label} type="button" className={`chip${values.faellig_am === datum ? ' is-active' : ''}`} onClick={() => setValues((v) => ({ ...v, faellig_am: datum }))}>
              {label}
            </button>
          ))}
        </div>
        {deals.length > 0 && (
          <Field label="Zu Deal" wide>
            <select value={values.deal_id} onChange={set('deal_id')}>
              <option value="">–</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.titel}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <FormError error={error} />
    </Dialog>
  );
}
