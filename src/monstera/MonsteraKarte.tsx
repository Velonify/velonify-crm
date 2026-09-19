import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toasts';
import { Card } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { AuthExpiredError } from '../data/errors';
import { addDays } from '../data/ids';
import { monsteraStand, NAME_SCHLUESSEL, PUNKTE, wuchsform, type MonsteraStand } from '../data/monstera';
import type { Database, MonsteraEintrag } from '../data/types';
import { errorMessage } from '../lib/errors';
import { Pflanze } from './Pflanze';

function statusText(name: string, stand: MonsteraStand, heute: string): string {
  switch (stand.zustand) {
    case 'praechtig':
      if (stand.heuteGegossen.length > 0) return `${name} ist rundum zufrieden.`;
      return stand.letzterGiesstag === addDays(heute, -1) || stand.letzterGiesstag === heute ? `${name} geht es gut – heute freut sie sich trotzdem über Wasser.` : `${name} geht es gut.`;
    case 'durstig':
      return `${name} hat Durst – einen Werktag lang hat niemand gegossen.`;
    case 'welk':
      return `${name} lässt die Blätter hängen. Seit ${stand.durst} Werktagen kein Wasser!`;
    default:
      return `${name} ist ganz schlapp. Bitte dringend gießen!`;
  }
}

/** The team plant: water it once a day, let it grow with real work. */
export function MonsteraKarte({
  eintraege,
  db,
  ich,
  heute,
  neuLaden,
}: {
  eintraege: readonly MonsteraEintrag[];
  db: Database;
  ich: string | null;
  heute: string;
  neuLaden: () => void;
}) {
  const { service, perform } = useCrm();
  const { expire } = useAuth();
  const toast = useToast();
  const [giesst, setGiesst] = useState(false);
  const [gegossen, setGegossen] = useState(0);
  const [benennen, setBenennen] = useState(false);
  const [neuerName, setNeuerName] = useState('');

  const stand = useMemo(() => monsteraStand(eintraege, db.firmen, db.deals, heute), [eintraege, db.firmen, db.deals, heute]);
  const name = db.einstellungen[NAME_SCHLUESSEL] || 'Die Monstera';

  const schonGegossen = Boolean(ich && stand.heuteGegossen.includes(ich));

  const giessen = async () => {
    if (!service || !ich) return;
    setGiesst(true);
    try {
      await service.giesseMonstera(ich);
      setGegossen((n) => n + 1);
      neuLaden();
    } catch (err) {
      if (err instanceof AuthExpiredError) expire();
      toast.show(`Gießen ging nicht: ${errorMessage(err)}`, 'error');
    } finally {
      setGiesst(false);
    }
  };

  const speichereName = async (e: FormEvent) => {
    e.preventDefault();
    const wert = neuerName.trim().slice(0, 40);
    if (!wert) return;
    const ok = await perform(async (s) => (await s.saveEinstellungen({ [NAME_SCHLUESSEL]: wert }), true), `Die Monstera heißt jetzt ${wert}.`);
    if (ok !== undefined) setBenennen(false);
  };

  return (
    <Card
      className="monstera-karte"
      title={
        <>
          {name} <span className="count">{wuchsform(stand.blaetter)}</span>
        </>
      }
      actions={
        !benennen && (
          <button type="button" className="button small" onClick={() => (setNeuerName(db.einstellungen[NAME_SCHLUESSEL] ?? ''), setBenennen(true))}>
            {db.einstellungen[NAME_SCHLUESSEL] ? 'Umbenennen' : 'Namen geben'}
          </button>
        )
      }
    >
      {benennen && (
        <form className="monstera-name" onSubmit={speichereName}>
          <input value={neuerName} onChange={(e) => setNeuerName(e.target.value)} placeholder="Wie soll sie heißen?" maxLength={40} autoFocus aria-label="Name der Monstera" />
          <button type="submit" className="button small primary" disabled={!neuerName.trim()}>
            Speichern
          </button>
          <button type="button" className="button small" onClick={() => setBenennen(false)}>
            Abbrechen
          </button>
        </form>
      )}
      <div className="monstera">
        <div className="monstera-bild">
          <Pflanze blaetter={stand.blaetter} zustand={stand.zustand} gegossen={gegossen} />
        </div>
        <div className="monstera-info">
          <>
              <p className={`monstera-status zustand-${stand.zustand}`}>{statusText(name, stand, heute)}</p>
              <p className="muted small">{stand.heuteGegossen.length > 0 ? `Heute gegossen von ${stand.heuteGegossen.join(', ')}.` : 'Heute hat noch niemand gegossen.'}</p>
              <button type="button" className="button primary" onClick={giessen} disabled={!ich || schonGegossen || giesst}>
                {schonGegossen ? 'Heute schon gegossen' : giesst ? 'Gießt …' : 'Gießen'}
              </button>
              {!ich && <p className="hint">Wähle unter „Mein Tag“, wer du bist, dann kannst du gießen.</p>}
              <dl className="monstera-wachstum">
                <div>
                  <dt>Blätter</dt>
                  <dd>{stand.blaetter}</dd>
                </div>
                <div>
                  <dt>Bis zum nächsten</dt>
                  <dd>
                    {stand.bisBlatt} {stand.bisBlatt === 1 ? 'Punkt' : 'Punkte'}
                  </dd>
                </div>
              </dl>
              <p className="hint">
                Wächst mit echter Arbeit: neuer Lead +{PUNKTE.lead}, gewonnener Deal +{PUNKTE.deal}, jeder Gießtag +{PUNKTE.giesstag}. Bisher {stand.quellen.leads} Leads,{' '}
                {stand.quellen.deals} {stand.quellen.deals === 1 ? 'Deal' : 'Deals'} und {stand.quellen.giesstage} {stand.quellen.giesstage === 1 ? 'Gießtag' : 'Gießtage'}.
              </p>
          </>
        </div>
      </div>
    </Card>
  );
}
