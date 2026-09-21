import { useState } from 'react';
import { useToast } from '../components/Toasts';
import { Card } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { isoDate } from '../data/ids';
import { AUFGABEN_BEREICHE, aufgabenNachBereich, dringlichkeitLabel, istErledigt } from '../data/social';
import type { SocialAufgabe } from '../data/types';
import { errorMessage } from '../lib/errors';
import { faelligText, formatDate } from '../lib/format';
import { AufgabeDialog } from './Dialoge';
import { SocialSeite } from './SocialTeile';
import type { Aendern } from './useSocial';

function AufgabeZeile({ aufgabe, heute, aendern, onBearbeiten }: { aufgabe: SocialAufgabe; heute: string; aendern: Aendern; onBearbeiten(): void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const erledigt = istErledigt(aufgabe);
  const ueberfaellig = !erledigt && aufgabe.faellig_am !== '' && aufgabe.faellig_am < heute;

  const abhaken = async (wert: boolean) => {
    setBusy(true);
    try {
      await aendern((s) => s.setAufgabeErledigt(aufgabe.id, wert, aufgabe.geaendert_am));
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={[erledigt ? 'is-erledigt' : '', ueberfaellig ? 'overdue' : '', aufgabe.archiviert ? 'is-archived' : ''].filter(Boolean).join(' ') || undefined}>
      <input type="checkbox" checked={erledigt} disabled={busy} onChange={(e) => void abhaken(e.target.checked)} aria-label={`${aufgabe.titel} erledigt`} />
      <div className="task-body">
        <button type="button" className="link-button strong" onClick={onBearbeiten}>
          {aufgabe.titel}
        </button>
        {aufgabe.beschreibung && <p className="notiz muted small">{aufgabe.beschreibung}</p>}
        <div className="row-sub">
          {aufgabe.dringlichkeit && <span className={`badge dringlichkeit-${aufgabe.dringlichkeit}`}>{dringlichkeitLabel(aufgabe.dringlichkeit)}</span>}{' '}
          {aufgabe.faellig_am ? `${formatDate(aufgabe.faellig_am)} · ${faelligText(aufgabe.faellig_am, heute)}` : 'ohne Datum'}
          {aufgabe.zustaendig && ` · ${aufgabe.zustaendig}`}
          {erledigt && aufgabe.erledigt_von && ` · erledigt von ${aufgabe.erledigt_von.split('@')[0]}`}
        </div>
      </div>
    </li>
  );
}

const HINWEIS: Record<string, string> = {
  woche1: 'Alles, was vor dem ersten Post am 22.09. stehen muss.',
  fehlt: 'Nach Dringlichkeit sortiert. Ohne Punkt 1 – den Buchungslink – führt jeder CTA ins Leere.',
  ritual: 'Der wöchentliche Ablauf. Nichts zum Abhaken, sondern zum Nachlesen – abgehakt wird trotzdem, wer will.',
};

export function SocialAufgabenPage() {
  const { db } = useCrm();
  const team = db?.listen.team ?? [];
  const heute = isoDate(new Date());
  const [offen, setOffen] = useState<{ aufgabe?: SocialAufgabe; bereich?: string } | null>(null);
  const [erledigte, setErledigte] = useState(false);
  const [archivierte, setArchivierte] = useState(false);

  return (
    <SocialSeite
      title="Aufgaben"
      subtitle="Was vor dem Start stehen muss, was noch fehlt und was jede Woche wiederkommt."
      actions={
        <button type="button" className="button primary" onClick={() => setOffen({})}>
          Aufgabe anlegen
        </button>
      }
    >
      {(daten, aendern) => {
        const gesamtOffen = daten.aufgaben.filter((a) => !a.archiviert && !istErledigt(a)).length;

        return (
          <>
            <div className="filters">
              <label className="checkbox">
                <input type="checkbox" checked={erledigte} onChange={(e) => setErledigte(e.target.checked)} />
                Erledigte zeigen
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={archivierte} onChange={(e) => setArchivierte(e.target.checked)} />
                Archivierte zeigen
              </label>
              <span className="hint">{gesamtOffen} offen</span>
            </div>

            {AUFGABEN_BEREICHE.map((bereich) => {
              const alle = aufgabenNachBereich(daten.aufgaben, bereich.wert, archivierte);
              const liste = erledigte ? alle : alle.filter((a) => !istErledigt(a));
              const offeneAnzahl = alle.filter((a) => !istErledigt(a)).length;

              return (
                <Card
                  key={bereich.wert}
                  title={
                    <>
                      {bereich.label}{' '}
                      <span className="count">
                        {offeneAnzahl} / {alle.length}
                      </span>
                    </>
                  }
                  actions={
                    <button type="button" className="button small" onClick={() => setOffen({ bereich: bereich.wert })}>
                      Hinzufügen
                    </button>
                  }
                >
                  <p className="muted small">{HINWEIS[bereich.wert]}</p>
                  {liste.length === 0 ? (
                    <p className="muted">{alle.length === 0 ? 'Nichts eingetragen.' : 'Alles erledigt.'}</p>
                  ) : (
                    <ul className="task-list social-aufgabenliste">
                      {liste.map((aufgabe) => (
                        <AufgabeZeile key={aufgabe.id} aufgabe={aufgabe} heute={heute} aendern={aendern} onBearbeiten={() => setOffen({ aufgabe })} />
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })}

            {offen && <AufgabeDialog aufgabe={offen.aufgabe} bereich={offen.bereich} team={team} aendern={aendern} onClose={() => setOffen(null)} />}
          </>
        );
      }}
    </SocialSeite>
  );
}
