import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toasts';
import { Card } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { isoDate } from '../data/ids';
import {
  SAEULEN,
  dmsJeStichwort,
  inhaltById,
  istVeroeffentlicht,
  montag,
  naechsteEintraege,
  offeneAufgaben,
  sortierePlan,
  ueberfaelligeEintraege,
} from '../data/social';
import type { SocialDaten, SocialPlanEintrag } from '../data/types';
import { errorMessage } from '../lib/errors';
import { formatDate, formatDayShort } from '../lib/format';
import { useIch } from '../lib/useIch';
import { DmDialog, PlanDialog } from './Dialoge';
import { InhaltLink, SaeuleBadge, SocialSeite } from './SocialTeile';
import type { Aendern } from './useSocial';

const MAX_ZEILEN = 6;

/** One row of the "next up" and "overdue" lists: tick it off, or open it. */
function PlanZeile({ eintrag, daten, heute, aendern, onBearbeiten }: { eintrag: SocialPlanEintrag; daten: SocialDaten; heute: string; aendern: Aendern; onBearbeiten(): void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const abhaken = async (erledigt: boolean) => {
    setBusy(true);
    try {
      await aendern((s) => s.setPlanErledigt(eintrag.id, erledigt, eintrag.geaendert_am));
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={eintrag.datum < heute ? 'overdue' : eintrag.datum === heute ? 'today' : undefined}>
      <input type="checkbox" checked={istVeroeffentlicht(eintrag)} disabled={busy} onChange={(e) => void abhaken(e.target.checked)} aria-label="Veröffentlicht" />
      <div className="task-body">
        <button type="button" className="link-button strong" onClick={onBearbeiten}>
          {eintrag.thema}
        </button>
        <div className="row-sub">
          <SaeuleBadge nr={eintrag.saeule} /> {formatDayShort(eintrag.datum)}
          {eintrag.uhrzeit && ` · ${eintrag.uhrzeit}`} · <InhaltLink inhalt={inhaltById(daten.inhalte, eintrag.inhalt_id)} />
          {eintrag.hinweis && ` · ${eintrag.hinweis}`}
        </div>
      </div>
      <span className="task-due">{eintrag.zustaendig || '–'}</span>
    </li>
  );
}

export function SocialUebersichtPage() {
  const { db } = useCrm();
  const team = db?.listen.team ?? [];
  const [ich] = useIch(team);
  const heute = isoDate(new Date());
  const [dialog, setDialog] = useState<{ art: 'plan'; eintrag?: SocialPlanEintrag } | { art: 'dm' } | null>(null);

  return (
    <SocialSeite
      title="Social Media"
      subtitle="Der 90-Tage-Plan vom 22.09. bis 20.12.2026. Drei Posts und fünf Stories pro Woche, Instagram als Hauptkanal, LinkedIn als Zweitverwertung."
      actions={
        <>
          <button type="button" className="button" onClick={() => setDialog({ art: 'plan' })}>
            Termin anlegen
          </button>
          <button type="button" className="button primary" onClick={() => setDialog({ art: 'dm' })}>
            DM erfassen
          </button>
        </>
      }
    >
      {(daten, aendern) => {
        const plan = sortierePlan(daten.plan);
        const veroeffentlicht = plan.filter(istVeroeffentlicht).length;
        const naechste = naechsteEintraege(daten.plan, heute, MAX_ZEILEN);
        const ueberfaellig = ueberfaelligeEintraege(daten.plan, heute);
        const offen = offeneAufgaben(daten.aufgaben);
        const dieseWoche = montag(heute);
        const dms = dmsJeStichwort(daten.dms, dieseWoche, heute);
        const dmsGesamt = dms.reduce((n, d) => n + d.anzahl, 0);

        return (
          <>
            <section className="kpis" aria-label="Kennzahlen">
              <div className="kpi panel">
                <span className="kpi-label">Veröffentlicht</span>
                <span className="kpi-value">
                  {veroeffentlicht} / {plan.length}
                </span>
                <span className="kpi-sub">Termine im Plan</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">Überfällig</span>
                <span className="kpi-value">{ueberfaellig.length}</span>
                <span className="kpi-sub">{ueberfaellig.length === 0 ? 'Alles abgehakt' : 'Tag vorbei, nicht abgehakt'}</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">Offene Aufgaben</span>
                <span className="kpi-value">{offen.length}</span>
                <span className="kpi-sub">Erste Woche und „Was fehlt“</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">DMs diese Woche</span>
                <span className="kpi-value">{dmsGesamt}</span>
                <span className="kpi-sub">{dms.length > 0 ? dms.map((d) => `${d.stichwort} ${d.anzahl}`).join(' · ') : 'seit ' + formatDate(dieseWoche)}</span>
              </div>
            </section>

            <div className="start-grid">
              <div className="start-main">
                {ueberfaellig.length > 0 && (
                  <Card
                    title={
                      <>
                        Überfällig <span className="count">{ueberfaellig.length}</span>
                      </>
                    }
                    className="task-card overdue"
                  >
                    <ul className="task-list">
                      {ueberfaellig.slice(0, MAX_ZEILEN).map((eintrag) => (
                        <PlanZeile key={eintrag.id} eintrag={eintrag} daten={daten} heute={heute} aendern={aendern} onBearbeiten={() => setDialog({ art: 'plan', eintrag })} />
                      ))}
                    </ul>
                    {ueberfaellig.length > MAX_ZEILEN && (
                      <p className="muted small">
                        Und {ueberfaellig.length - MAX_ZEILEN} weitere. <Link to="/social/plan">Zum Redaktionsplan</Link>
                      </p>
                    )}
                  </Card>
                )}

                <Card
                  title={
                    <>
                      Als Nächstes dran <span className="count">{naechste.length}</span>
                    </>
                  }
                  actions={
                    <Link to="/social/plan" className="button small">
                      Redaktionsplan
                    </Link>
                  }
                  className="task-card"
                >
                  {naechste.length === 0 ? (
                    <p className="muted">Nichts mehr geplant. Der Plan reicht bis zum 21.10. – danach plant ihr Woche 5 bis 8.</p>
                  ) : (
                    <ul className="task-list">
                      {naechste.map((eintrag) => (
                        <PlanZeile key={eintrag.id} eintrag={eintrag} daten={daten} heute={heute} aendern={aendern} onBearbeiten={() => setDialog({ art: 'plan', eintrag })} />
                      ))}
                    </ul>
                  )}
                </Card>

                <Card
                  title={
                    <>
                      Offene Aufgaben <span className="count">{offen.length}</span>
                    </>
                  }
                  actions={
                    <Link to="/social/aufgaben" className="button small">
                      Alle Aufgaben
                    </Link>
                  }
                >
                  {offen.length === 0 ? (
                    <p className="muted">Nichts offen.</p>
                  ) : (
                    <ul className="social-aufgaben">
                      {offen.slice(0, MAX_ZEILEN).map((aufgabe) => (
                        <li key={aufgabe.id}>
                          <span className="row-title">{aufgabe.titel}</span>
                          <span className="row-sub">
                            {aufgabe.faellig_am ? formatDate(aufgabe.faellig_am) : 'ohne Datum'}
                            {aufgabe.zustaendig && ` · ${aufgabe.zustaendig}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>

              <div className="start-side">
                <Card title="Säulen" actions={<Link to="/social/strategie" className="button small">Strategie</Link>}>
                  <p className="muted small">Anteil an allen Posts, und wie viele Termine im Plan gerade darauf entfallen.</p>
                  <ul className="social-saeulen">
                    {SAEULEN.map((s) => {
                      const anzahl = plan.filter((e) => e.saeule === s.nr).length;
                      const ist = plan.length > 0 ? Math.round((anzahl / plan.length) * 100) : 0;
                      return (
                        <li key={s.nr}>
                          <div className="social-saeule-kopf">
                            <SaeuleBadge nr={s.nr} />
                            <span className="row-title">{s.name}</span>
                            <span className="task-due">
                              {ist} % / {s.anteil} %
                            </span>
                          </div>
                          <div className="social-balken" aria-hidden="true">
                            <span style={{ width: `${Math.min(100, ist)}%` }} />
                          </div>
                          <p className="muted small">{s.zweck}</p>
                        </li>
                      );
                    })}
                  </ul>
                </Card>

                <Card
                  title="Letzte DMs"
                  actions={
                    <Link to="/social/messung" className="button small">
                      Messung
                    </Link>
                  }
                >
                  {daten.dms.length === 0 ? (
                    <p className="muted">Noch keine DM erfasst. Wer eine beantwortet, trägt sie am selben Tag hier ein.</p>
                  ) : (
                    <ul className="social-dms">
                      {[...daten.dms]
                        .sort((a, b) => b.datum.localeCompare(a.datum))
                        .slice(0, 5)
                        .map((dm) => (
                          <li key={dm.id}>
                            <span className="row-title">
                              {dm.stichwort || 'ohne Stichwort'} {dm.qualifiziert && <span className="badge ok">qualifiziert</span>}
                            </span>
                            <span className="row-sub">
                              {formatDate(dm.datum)} · {dm.name || 'ohne Namen'}
                              {dm.beantwortet_von && ` · ${dm.beantwortet_von}`}
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </Card>
              </div>
            </div>

            {dialog?.art === 'plan' && (
              <PlanDialog eintrag={dialog.eintrag} heute={heute} inhalte={daten.inhalte} team={team} aendern={aendern} onClose={() => setDialog(null)} />
            )}
            {dialog?.art === 'dm' && <DmDialog heute={heute} ich={ich} inhalte={daten.inhalte} team={team} aendern={aendern} onClose={() => setDialog(null)} />}
          </>
        );
      }}
    </SocialSeite>
  );
}
