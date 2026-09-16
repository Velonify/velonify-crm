import { useState } from 'react';
import { useCrm } from '../../data/CrmContext';
import type { Firma } from '../../data/types';
import { fieldOf } from '../../lib/errors';
import { Dialog } from '../Dialog';
import { useToast } from '../Toasts';
import { FormError } from '../ui';
import { LeadOrdnerFelder, useLeadOrdnerFelder } from './PhaseChange';

export function LeadOrdnerDialog({ firma, onClose }: { firma: Firma; onClose(): void }) {
  const { db, mutate } = useCrm();
  const toast = useToast();
  const ordner = useLeadOrdnerFelder(firma, db?.firmen ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const save = async () => {
    setError(undefined);
    try {
      ordner.pruefe();
    } catch (err) {
      return setError(err);
    }
    setBusy(true);
    try {
      await mutate((s) => s.legeLeadOrdnerAn(firma.id, ordner.kuerzel, ordner.name));
      toast.show(`Lead-Ordner „${ordner.name}“ angelegt`);
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Dialog title="Lead-Ordner anlegen" onClose={onClose} onSubmit={save} submitLabel="Ordner anlegen" busy={busy}>
      <p className="muted">
        Legt in Google Drive unter 02_Sales/01_Leads einen Ordner für „{firma.name}“ an. Gibt es dort schon einen Ordner mit genau diesem Namen,
        wird er verknüpft statt doppelt angelegt.
      </p>
      <LeadOrdnerFelder firma={firma} {...ordner} invalid={fieldOf(error)} />
      <FormError error={error} />
    </Dialog>
  );
}
