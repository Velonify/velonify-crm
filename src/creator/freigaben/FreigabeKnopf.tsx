import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../components/Toasts';
import { FormError } from '../../components/ui';
import { useCrm } from '../../data/CrmContext';
import { useBaustein, useCreatorApi, useInstanz } from '../api';
import { STATUS_TEXT, type Freigabe } from './typen';

/**
 * Approval of one object, for every module (scripts, briefings, uploads, cooperations, reports): shows the state, asks for
 * an approval (approver of the area by default) and lets the approver decide with one click. Hidden while the building
 * block "Rollen und Freigaben" is off. `onEntschieden` lets the module react, e.g. move a script on.
 */
export function FreigabeKnopf({
  objektTyp,
  objektId,
  titel,
  link,
  bereich,
  onEntschieden,
}: {
  objektTyp: string;
  objektId: string;
  titel: string;
  link?: string;
  bereich: string;
  onEntschieden?(freigabe: Freigabe): void;
}) {
  const an = useBaustein('freigaben');
  const api = useCreatorApi();
  const instanz = useInstanz();
  const { db } = useCrm();
  const { show } = useToast();
  const [freigabe, setFreigabe] = useState<Freigabe | null>(null);
  const [fehler, setFehler] = useState<unknown>();
  const [waehlen, setWaehlen] = useState(false);
  const [freigeber, setFreigeber] = useState('');
  const [kommentar, setKommentar] = useState('');
  const ich = instanz.person;

  const laden = useCallback(async () => {
    if (!an) return;
    try {
      setFreigabe((await api.post<{ freigabe: Freigabe | null }>('/c/freigaben/objekt', { objekt_typ: objektTyp, objekt_id: objektId })).freigabe);
    } catch (err) {
      setFehler(err);
    }
  }, [an, api, objektTyp, objektId]);
  useEffect(() => void laden(), [laden]);
  if (!an) return null;

  const anfragen = async () => {
    setFehler(undefined);
    try {
      const { freigabe: neu } = await api.post<{ freigabe: Freigabe }>('/c/freigaben/anfragen', { objekt_typ: objektTyp, objekt_id: objektId, titel, link, bereich, freigeber: freigeber || undefined });
      setFreigabe(neu);
      setWaehlen(false);
      show(`Freigabe bei ${neu.freigeber} angefragt`);
    } catch (err) {
      setFehler(err);
      setWaehlen(true);
    }
  };

  const entscheiden = async (status: 'freigegeben' | 'abgelehnt') => {
    setFehler(undefined);
    try {
      const { freigabe: neu } = await api.post<{ freigabe: Freigabe }>('/c/freigaben/entscheiden', { id: freigabe!.id, status, kommentar });
      setFreigabe(neu);
      setKommentar('');
      onEntschieden?.(neu);
      show(status === 'freigegeben' ? 'Freigegeben' : 'Abgelehnt');
    } catch (err) {
      setFehler(err);
    }
  };

  const darfEntscheiden = freigabe?.status === 'offen' && (freigabe.freigeber === ich || instanz.rolle === 'admin' || instanz.rolle === 'velonify');

  return (
    <div className="freigabe-knopf">
      {freigabe && (
        <p className="small">
          <strong>{STATUS_TEXT[freigabe.status]}</strong>
          {freigabe.status === 'offen' ? ` bei ${freigabe.freigeber}` : freigabe.entschieden_von ? ` von ${freigabe.entschieden_von}` : ''}
          {freigabe.kommentar ? ` · „${freigabe.kommentar}“` : ''}
        </p>
      )}
      {darfEntscheiden ? (
        <div className="filters">
          <input value={kommentar} onChange={(e) => setKommentar(e.target.value)} placeholder="Kommentar (bei Ablehnung Pflicht)" aria-label="Kommentar zur Freigabe" />
          <button type="button" className="button primary small" onClick={() => void entscheiden('freigegeben')}>
            Freigeben
          </button>
          <button type="button" className="button small" onClick={() => void entscheiden('abgelehnt')}>
            Ablehnen
          </button>
        </div>
      ) : freigabe?.status !== 'offen' ? (
        waehlen ? (
          <div className="filters">
            <select value={freigeber} onChange={(e) => setFreigeber(e.target.value)} aria-label="Wer gibt frei">
              <option value="">Laut Zuständigkeit</option>
              {(db?.listen.team ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button type="button" className="button primary small" onClick={() => void anfragen()}>
              Anfragen
            </button>
          </div>
        ) : (
          <button type="button" className="button small" onClick={() => setWaehlen(true)}>
            {freigabe?.status === 'abgelehnt' ? 'Erneut zur Freigabe' : 'Freigabe anfragen'}
          </button>
        )
      ) : null}
      <FormError error={fehler} />
    </div>
  );
}
