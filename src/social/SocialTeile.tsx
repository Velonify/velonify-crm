import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, Loading, PageHeader } from '../components/ui';
import { SchemaError } from '../data/errors';
import { inhaltName, inhaltStatusLabel, planStatusLabel, saeule } from '../data/social';
import type { SocialDaten, SocialInhalt } from '../data/types';
import { errorMessage } from '../lib/errors';
import { useSocial, type Aendern } from './useSocial';

/** Coloured square with the pillar number; the tooltip names it. */
export function SaeuleBadge({ nr }: { nr: number | null }) {
  const gefunden = saeule(nr);
  if (!gefunden) return <span className="muted">–</span>;
  return (
    <span className={`badge saeule saeule-${gefunden.nr}`} title={`${gefunden.nr} · ${gefunden.name}`}>
      {gefunden.kurz}
    </span>
  );
}

export function PlanStatusBadge({ status }: { status: string }) {
  return <span className={`badge social-status status-${status || 'geplant'}`}>{planStatusLabel(status)}</span>;
}

export function InhaltStatusBadge({ status }: { status: string }) {
  return <span className={`badge social-status status-${status || 'idee'}`}>{inhaltStatusLabel(status)}</span>;
}

/** Link to a piece of content, or a dash when a plan entry stands on its own. */
export function InhaltLink({ inhalt }: { inhalt: SocialInhalt | null }) {
  if (!inhalt) return <span className="muted">–</span>;
  return <Link to={`/social/inhalte/${inhalt.id}`}>{inhaltName(inhalt)}</Link>;
}

/** Offered while the tabs are still empty: takes the 90-day plan over in one go. */
function Startzustand({ aendern }: { aendern: Aendern }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const uebernehmen = async () => {
    setBusy(true);
    try {
      const anzahl = await aendern((s) => s.uebernimmSocialPlan());
      toast.show(`Plan übernommen: ${anzahl.plan} Termine, ${anzahl.inhalte} Inhalte, ${anzahl.aufgaben} Aufgaben.`);
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Noch leer">
      <p>
        Hier liegt der 90-Tage-Plan vom 21.09.2026: vier Säulen, zwölf fertige Posts, zehn Stories, der Redaktionsplan bis zum 21.10., die
        Hook-Bibliothek und die Aufgaben aus „Erste Woche“ und „Was fehlt“.
      </p>
      <p className="muted">
        Einmal übernehmen, danach wird nur noch hier gepflegt. Das Dokument im Vault bleibt der Stand vom 21.09. und wird nicht mehr
        nachgezogen.
      </p>
      <div className="empty-actions">
        <button type="button" className="button primary" disabled={busy} onClick={uebernehmen}>
          {busy ? 'Übernimmt …' : 'Plan übernehmen'}
        </button>
      </div>
    </Card>
  );
}

interface RahmenProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Wider page for the tables of the plan and the measurements. */
  breit?: boolean;
  children(daten: SocialDaten, aendern: Aendern): ReactNode;
}

/**
 * Shell of every social page: header, loading, the hint towards the setup and the start list. The page body
 * only runs once there is data, so no page has to handle the empty state itself.
 */
export function SocialSeite({ title, subtitle, actions, breit, children }: RahmenProps) {
  const { data, error, loading, reload, aendern } = useSocial();
  const leer =
    data && data.plan.length === 0 && data.inhalte.length === 0 && data.aufgaben.length === 0 && data.texte.length === 0 && data.hooks.length === 0;

  return (
    <div className={breit ? 'page wide' : 'page'}>
      <PageHeader eyebrow="Social Media" title={title} subtitle={subtitle} actions={data && !leer ? actions : undefined} />
      {error instanceof SchemaError ? (
        <Card title="Noch nicht eingerichtet">
          <p>{error.message}</p>
          <p className="muted">
            Die Einrichtung legt die sieben Tabellenblätter an, die Social Media braucht. Sie kann gefahrlos mehrfach laufen.
          </p>
          <div className="empty-actions">
            <Link to="/einrichtung" className="button primary">
              Zur Einrichtung
            </Link>
          </div>
        </Card>
      ) : !data ? (
        error ? (
          <ErrorBox error={error} onRetry={reload} />
        ) : (
          loading && <Loading label="Social Media wird geladen …" />
        )
      ) : leer ? (
        <Startzustand aendern={aendern} />
      ) : (
        <>
          {error && <ErrorBox error={error} onRetry={reload} />}
          {children(data, aendern)}
        </>
      )}
    </div>
  );
}
