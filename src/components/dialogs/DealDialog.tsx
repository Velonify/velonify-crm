import { useMemo, useState } from 'react';
import { DEFAULT_DEAL_TITEL, EINSTELLUNG, phaseLabel, STANDARD_WAHRSCHEINLICHKEIT, type Phase } from '../../data/constants';
import { useCrm } from '../../data/CrmContext';
import { ValidationError } from '../../data/errors';
import { kontaktName } from '../../data/rules';
import { EMPTY_DEAL_INPUT, type Deal, type DealInput } from '../../data/types';
import { fieldOf } from '../../lib/errors';
import { numberOrNull } from '../../lib/format';
import { Dialog } from '../Dialog';
import { useToast } from '../Toasts';
import { Field, FormError } from '../ui';

interface Props {
  /** Without a firm (e.g. from the pipeline) the dialog asks for one. */
  firmaId?: string;
  deal?: Deal;
  ich: string | null;
  onClose(): void;
}

const zahlText = (n: number | null) => (n === null ? '' : String(n));

export function DealDialog({ firmaId: festeFirma, deal, ich, onClose }: Props) {
  const { db, mutate } = useCrm();
  const toast = useToast();
  const [firmaId, setFirmaId] = useState(deal?.firma_id ?? festeFirma ?? '');
  const [values, setValues] = useState<DealInput>(() => {
    if (deal) {
      const { titel, kontakt_id, wert_eur, wahrscheinlichkeit, zustaendig, naechster_schritt, naechster_schritt_am } = deal;
      return { titel, kontakt_id, wert_eur, wahrscheinlichkeit, zustaendig, naechster_schritt, naechster_schritt_am };
    }
    const firma = db?.firmen.find((f) => f.id === festeFirma);
    return {
      ...EMPTY_DEAL_INPUT,
      titel: db?.einstellungen[EINSTELLUNG.dealTitel] || DEFAULT_DEAL_TITEL,
      zustaendig: firma?.zustaendig || ich || '',
      kontakt_id: db?.kontakte.find((k) => k.firma_id === festeFirma && k.hauptkontakt && !k.archiviert)?.id ?? '',
    };
  });
  const [wertText, setWertText] = useState(zahlText(values.wert_eur));
  const [wahrscheinlichkeitText, setWahrscheinlichkeitText] = useState(zahlText(values.wahrscheinlichkeit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const set = (field: keyof DealInput) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: e.target.value }));
  const invalid = fieldOf(error);

  const firmen = useMemo(() => (db?.firmen ?? []).filter((f) => !f.archiviert).sort((a, b) => a.name.localeCompare(b.name, 'de')), [db]);
  const kontakte = (db?.kontakte ?? []).filter((k) => k.firma_id === firmaId && !k.archiviert);
  const phase = (deal?.phase ?? 'neu') as Phase;

  const save = async () => {
    setError(undefined);
    const wert_eur = numberOrNull(wertText);
    const wahrscheinlichkeit = numberOrNull(wahrscheinlichkeitText);
    if (!firmaId) return setError(new ValidationError('firma', 'Bitte eine Firma auswählen.'));
    if (Number.isNaN(wert_eur)) return setError(new ValidationError('wert_eur', 'Der Angebotswert muss eine Zahl sein.'));
    if (Number.isNaN(wahrscheinlichkeit)) return setError(new ValidationError('wahrscheinlichkeit', 'Die Wahrscheinlichkeit muss eine Zahl sein.'));
    setBusy(true);
    try {
      await mutate((s) => s.saveDeal(firmaId, { ...values, wert_eur, wahrscheinlichkeit }, deal && { id: deal.id, expectedGeaendertAm: deal.geaendert_am }));
      toast.show(deal ? 'Deal gespeichert' : 'Deal angelegt');
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!deal || !window.confirm('Deal archivieren? Er verschwindet aus Pipeline und Kennzahlen, bleibt aber im Sheet erhalten.')) return;
    setBusy(true);
    try {
      await mutate((s) => s.setDealArchiviert(deal.id, true, deal.geaendert_am));
      toast.show('Deal archiviert');
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={deal ? 'Deal bearbeiten' : 'Neuer Deal'}
      onClose={onClose}
      onSubmit={save}
      busy={busy}
      extraActions={
        deal && (
          <button type="button" className="button subtle" onClick={archive} disabled={busy}>
            Archivieren
          </button>
        )
      }
    >
      <div className="grid">
        {!festeFirma && !deal && (
          <Field label="Firma" wide invalid={invalid === 'firma'}>
            <select value={firmaId} onChange={(e) => setFirmaId(e.target.value)}>
              <option value="">Bitte wählen …</option>
              {firmen.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Titel" wide invalid={invalid === 'titel'}>
          <input value={values.titel} onChange={set('titel')} />
        </Field>
        <Field label="Angebotswert (€)" invalid={invalid === 'wert_eur'}>
          <input inputMode="decimal" value={wertText} onChange={(e) => setWertText(e.target.value)} placeholder="z. B. 25000" />
        </Field>
        <Field
          label="Wahrscheinlichkeit (%)"
          invalid={invalid === 'wahrscheinlichkeit'}
          hint={`Leer = Standard für „${phaseLabel(phase)}“: ${STANDARD_WAHRSCHEINLICHKEIT[phase]} %`}
        >
          <input inputMode="numeric" value={wahrscheinlichkeitText} onChange={(e) => setWahrscheinlichkeitText(e.target.value)} placeholder={String(STANDARD_WAHRSCHEINLICHKEIT[phase])} />
        </Field>
        <Field label="Ansprechpartner">
          <select value={values.kontakt_id} onChange={set('kontakt_id')} disabled={!firmaId}>
            <option value="">–</option>
            {kontakte.map((k) => (
              <option key={k.id} value={k.id}>
                {kontaktName(k)}
              </option>
            ))}
          </select>
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
        <Field label="Nächster Schritt" invalid={invalid === 'naechster_schritt'}>
          <input value={values.naechster_schritt} onChange={set('naechster_schritt')} placeholder="z. B. Angebot nachfassen" />
        </Field>
        <Field label="Bis wann" invalid={invalid === 'naechster_schritt_am'}>
          <input type="date" value={values.naechster_schritt_am} onChange={set('naechster_schritt_am')} />
        </Field>
      </div>
      <FormError error={error} />
    </Dialog>
  );
}
