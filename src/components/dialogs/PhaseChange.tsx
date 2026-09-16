import { useCallback, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { phaseLabel } from '../../data/constants';
import { useCrm } from '../../data/CrmContext';
import { ValidationError } from '../../data/errors';
import { driveFolderName, prepareFirma, suggestKuerzel } from '../../data/rules';
import { driveKonfiguration } from '../../data/selectors';
import type { Deal, Firma } from '../../data/types';
import { errorMessage, fieldOf } from '../../lib/errors';
import { Dialog } from '../Dialog';
import { useToast } from '../Toasts';
import { Field, FormError } from '../ui';

interface Pending {
  deal: Deal;
  phase: string;
  firma: Firma;
  verlustgrund: boolean;
  leadOrdner: boolean;
  nachClients: boolean;
}

/** Kürzel and folder name inputs for creating a lead folder; the name follows the Kürzel until edited by hand. */
export function LeadOrdnerFelder({ firma, kuerzel, setKuerzel, name, setName, invalid }: {
  firma: Firma;
  kuerzel: string;
  setKuerzel(value: string): void;
  name: string;
  setName(value: string | null): void;
  invalid?: string;
}) {
  return (
    <div className="grid">
      <Field label="Kürzel" invalid={invalid === 'kuerzel'} hint="3 Buchstaben, gilt für Drive, Slack und Trello">
        <input value={kuerzel} onChange={(e) => setKuerzel(e.target.value.toUpperCase())} maxLength={3} disabled={Boolean(firma.kuerzel)} />
      </Field>
      <Field label="Ordnername" hint="Liegt dann in 02_Sales/01_Leads">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
    </div>
  );
}

export function useLeadOrdnerFelder(firma: Firma, alleFirmen: readonly Firma[]) {
  const [kuerzel, setKuerzel] = useState(() => firma.kuerzel || suggestKuerzel(firma.name, alleFirmen.map((f) => f.kuerzel).filter(Boolean)));
  const [eigenerName, setEigenerName] = useState<string | null>(null);
  const name = eigenerName ?? (kuerzel ? driveFolderName(kuerzel, firma.name) : '');
  /** Throws ValidationError/DuplicateError before anything is written. */
  const pruefe = () => {
    if (!kuerzel) throw new ValidationError('kuerzel', 'Bitte ein Kürzel angeben.');
    if (!firma.kuerzel) prepareFirma({ kuerzel }, alleFirmen, firma.id);
    if (!name.trim()) throw new ValidationError('name', 'Bitte einen Ordnernamen angeben.');
  };
  return { kuerzel, setKuerzel, name, setName: setEigenerName, pruefe };
}

function PhaseDialog({ pending, onClose }: { pending: Pending; onClose(): void }) {
  const { db, mutate } = useCrm();
  const toast = useToast();
  const { deal, phase, firma } = pending;
  const [grund, setGrund] = useState('');
  const [ordnerAnlegen, setOrdnerAnlegen] = useState(true);
  const [verschieben, setVerschieben] = useState(true);
  const ordner = useLeadOrdnerFelder(firma, db?.firmen ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const submit = async () => {
    setError(undefined);
    try {
      if (pending.verlustgrund && !grund) throw new ValidationError('verlustgrund', 'Bitte einen Grund auswählen.');
      if (pending.leadOrdner && ordnerAnlegen) ordner.pruefe();
    } catch (err) {
      return setError(err);
    }
    setBusy(true);
    const erledigt: string[] = [];
    try {
      await mutate(async (s) => {
        await s.changePhase(deal.id, phase, deal.geaendert_am, grund);
        erledigt.push(`Phase: ${phaseLabel(phase)}`);
        if (pending.leadOrdner && ordnerAnlegen) {
          await s.legeLeadOrdnerAn(firma.id, ordner.kuerzel, ordner.name);
          erledigt.push('Lead-Ordner angelegt');
        }
        if (pending.nachClients && verschieben) {
          await s.verschiebeNachClients(firma.id);
          erledigt.push('Ordner nach 01_Clients verschoben');
        }
      });
      if (phase === 'gewonnen' && firma.status !== 'kunde') erledigt.push(`${firma.name} ist jetzt Kunde`);
      toast.show(erledigt.join(' · '));
      onClose();
    } catch (err) {
      // The phase may already be changed when a Drive step fails – say so instead of implying nothing happened.
      setError(erledigt.length > 0 ? new Error(`${errorMessage(err)} Bereits erledigt: ${erledigt.join(', ')}.`) : err);
      setBusy(false);
    }
  };

  return (
    <Dialog title={`${deal.titel}: ${phaseLabel(deal.phase)} → ${phaseLabel(phase)}`} onClose={onClose} onSubmit={submit} submitLabel="Phase ändern" busy={busy}>
      <p className="muted">{firma.name}</p>
      {pending.verlustgrund && (
        <Field label="Warum ist der Deal verloren?" invalid={fieldOf(error) === 'verlustgrund'}>
          <select value={grund} onChange={(e) => setGrund(e.target.value)}>
            <option value="">Bitte wählen …</option>
            {(db?.listen.verlustgrund ?? []).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
      )}
      {pending.leadOrdner && (
        <div className="option-block">
          <label className="checkbox">
            <input type="checkbox" checked={ordnerAnlegen} onChange={(e) => setOrdnerAnlegen(e.target.checked)} />
            Lead-Ordner in Google Drive anlegen
          </label>
          {ordnerAnlegen && <LeadOrdnerFelder firma={firma} {...ordner} invalid={fieldOf(error)} />}
        </div>
      )}
      {pending.nachClients && (
        <div className="option-block">
          <label className="checkbox">
            <input type="checkbox" checked={verschieben} onChange={(e) => setVerschieben(e.target.checked)} />
            Ordner von 01_Leads nach 01_Clients verschieben und Unterordner aus der Vorlage ergänzen
          </label>
        </div>
      )}
      {phase === 'gewonnen' && firma.status !== 'kunde' && <p className="hint-box">Der Status von „{firma.name}“ wird auf „Kunde“ gesetzt.</p>}
      <FormError error={error} />
    </Dialog>
  );
}

/**
 * Central entry point for moving a deal. Changes that need a decision (reason for losing, Drive folder)
 * open a dialog; everything else happens right away.
 */
export function usePhaseChange(): { request(deal: Deal, phase: string): Promise<void>; element: ReactNode } {
  const { db, service, perform } = useCrm();
  const toast = useToast();
  const [pending, setPending] = useState<Pending | null>(null);

  const request = useCallback(
    async (deal: Deal, phase: string) => {
      if (!db || !service || deal.phase === phase) return;
      const firma = db.firmen.find((f) => f.id === deal.firma_id);
      if (!firma) return;
      const konfig = driveKonfiguration(db.einstellungen);
      const leadOrdner = phase === 'qualifiziert' && !firma.drive_ordner_id && Boolean(konfig);
      let nachClients = false;
      if ((phase === 'angebot' || phase === 'gewonnen') && firma.drive_ordner_id && konfig) {
        try {
          nachClients = (await service.ordnerOrt(db, firma)) === 'leads';
        } catch (err) {
          toast.show(`Drive-Ordner konnte nicht geprüft werden: ${errorMessage(err)}`, 'error');
        }
      }
      if (phase === 'verloren' || leadOrdner || nachClients) {
        setPending({ deal, phase, firma, verlustgrund: phase === 'verloren', leadOrdner, nachClients });
        return;
      }
      const kunde = phase === 'gewonnen' && firma.status !== 'kunde' ? ` · ${firma.name} ist jetzt Kunde` : '';
      await perform((s) => s.changePhase(deal.id, phase, deal.geaendert_am), `${firma.name}: ${phaseLabel(phase)}${kunde}`);
    },
    [db, service, perform, toast],
  );

  return { request, element: pending && <PhaseDialog pending={pending} onClose={() => setPending(null)} /> };
}

export function DriveNichtEingerichtet() {
  return (
    <p className="muted">
      Drive-Ordner sind noch nicht eingerichtet. <Link to="/einrichtung">Zur Einrichtung</Link>
    </p>
  );
}
