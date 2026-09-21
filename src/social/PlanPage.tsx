import { useState } from 'react';
import { useToast } from '../components/Toasts';
import { Card } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { isoDate } from '../data/ids';
import { KANAELE, SAEULEN, formatLabel, inhaltById, istVeroeffentlicht, kanalLabel, planNachWochen } from '../data/social';
import type { SocialDaten, SocialPlanEintrag } from '../data/types';
import { errorMessage } from '../lib/errors';
import { formatDate, formatDayShort } from '../lib/format';
import { PlanDialog } from './Dialoge';
import { InhaltLink, PlanStatusBadge, SaeuleBadge, SocialSeite } from './SocialTeile';
import type { Aendern } from './useSocial';

function Zeile({ eintrag, daten, heute, aendern, onBearbeiten }: { eintrag: SocialPlanEintrag; daten: SocialDaten; heute: string; aendern: Aendern; onBearbeiten(): void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const erledigt = istVeroeffentlicht(eintrag);

  const abhaken = async (wert: boolean) => {
    setBusy(true);
    try {
      await aendern((s) => s.setPlanErledigt(eintrag.id, wert, eintrag.geaendert_am));
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const offenUndVorbei = !erledigt && eintrag.datum < heute;

  return (
    <tr className={`${erledigt ? 'is-erledigt' : ''} ${eintrag.archiviert ? 'is-archived' : ''}`.trim() || undefined}>
      <td>
        <input type="checkbox" checked={erledigt} disabled={busy} onChange={(e) => void abhaken(e.target.checked)} aria-label={`${eintrag.thema} veröffentlicht`} />
      </td>
      <td className={offenUndVorbei ? 'social-ueberfaellig' : undefined}>
        <span className="row-title">{formatDayShort(eintrag.datum)}</span>
        <span className="row-sub">{eintrag.uhrzeit || 'live'}</span>
      </td>
      <td>{kanalLabel(eintrag.kanal)}</td>
      <td>{formatLabel(eintrag.format)}</td>
      <td>
        <SaeuleBadge nr={eintrag.saeule} />
      </td>
      <td>
        <button type="button" className="link-button strong" onClick={onBearbeiten}>
          {eintrag.thema}
        </button>
        {eintrag.hinweis && <div className="row-sub">{eintrag.hinweis}</div>}
      </td>
      <td>
        <InhaltLink inhalt={inhaltById(daten.inhalte, eintrag.inhalt_id)} />
      </td>
      <td>
        <PlanStatusBadge status={eintrag.status} />
      </td>
      <td>{eintrag.zustaendig || <span className="muted">–</span>}</td>
    </tr>
  );
}

export function SocialPlanPage() {
  const { db } = useCrm();
  const team = db?.listen.team ?? [];
  const heute = isoDate(new Date());
  const [offen, setOffen] = useState<{ eintrag?: SocialPlanEintrag } | null>(null);
  const [kanal, setKanal] = useState('');
  const [saeule, setSaeule] = useState('');
  const [nurOffene, setNurOffene] = useState(false);
  const [archivierte, setArchivierte] = useState(false);

  return (
    <SocialSeite
      title="Redaktionsplan"
      subtitle="Posting-Tage auf Instagram sind Dienstag, Donnerstag und Samstag um 07:30. Stories Montag bis Freitag, LinkedIn mittwochs als reine Zweitverwertung."
      breit
      actions={
        <button type="button" className="button primary" onClick={() => setOffen({})}>
          Termin anlegen
        </button>
      }
    >
      {(daten, aendern) => {
        const wochen = planNachWochen(daten.plan, archivierte)
          .map((woche) => ({
            ...woche,
            eintraege: woche.eintraege.filter(
              (e) => (!kanal || e.kanal === kanal) && (!saeule || String(e.saeule ?? '') === saeule) && (!nurOffene || !istVeroeffentlicht(e)),
            ),
          }))
          .filter((woche) => woche.eintraege.length > 0);

        return (
          <>
            <div className="filters">
              <select value={kanal} onChange={(e) => setKanal(e.target.value)} aria-label="Kanal">
                <option value="">Alle Kanäle</option>
                {KANAELE.map((k) => (
                  <option key={k.wert} value={k.wert}>
                    {k.label}
                  </option>
                ))}
              </select>
              <select value={saeule} onChange={(e) => setSaeule(e.target.value)} aria-label="Säule">
                <option value="">Alle Säulen</option>
                {SAEULEN.map((s) => (
                  <option key={s.nr} value={s.nr}>
                    {s.nr} · {s.name}
                  </option>
                ))}
              </select>
              <label className="checkbox">
                <input type="checkbox" checked={nurOffene} onChange={(e) => setNurOffene(e.target.checked)} />
                Nur offene
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={archivierte} onChange={(e) => setArchivierte(e.target.checked)} />
                Archivierte zeigen
              </label>
            </div>

            {wochen.length === 0 ? (
              <Card title="Nichts gefunden">
                <p className="muted">Mit diesen Filtern steht nichts im Plan.</p>
              </Card>
            ) : (
              wochen.map((woche) => {
                const erledigt = woche.eintraege.filter(istVeroeffentlicht).length;
                return (
                  <Card
                    key={woche.start}
                    title={
                      <>
                        Woche ab {formatDate(woche.start)}{' '}
                        <span className="count">
                          {erledigt} / {woche.eintraege.length}
                        </span>
                      </>
                    }
                  >
                    <div className="table-wrap">
                      <table className="table compact social-plan-tabelle">
                        <thead>
                          <tr>
                            <th aria-label="Veröffentlicht" />
                            <th>Tag</th>
                            <th>Kanal</th>
                            <th>Format</th>
                            <th>Säule</th>
                            <th>Thema</th>
                            <th>Inhalt</th>
                            <th>Status</th>
                            <th>Wer</th>
                          </tr>
                        </thead>
                        <tbody>
                          {woche.eintraege.map((eintrag) => (
                            <Zeile key={eintrag.id} eintrag={eintrag} daten={daten} heute={heute} aendern={aendern} onBearbeiten={() => setOffen({ eintrag })} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                );
              })
            )}

            {offen && <PlanDialog eintrag={offen.eintrag} heute={heute} inhalte={daten.inhalte} team={team} aendern={aendern} onClose={() => setOffen(null)} />}
          </>
        );
      }}
    </SocialSeite>
  );
}
