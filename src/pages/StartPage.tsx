import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, Loading, PageHeader, PhaseBadge, StatusBadge } from '../components/ui';
import { isDemo } from '../config';
import { useCrm } from '../data/CrmContext';
import { driveFolderUrl } from '../data/google/drive';
import { isoDate } from '../data/ids';
import { kennzahlen, meinTag } from '../data/selectors';
import { firmenLinks, schnellzugriff, slackChannelUrl } from '../data/start';
import type { Database } from '../data/types';
import { dateiname } from '../lib/dateiname';
import { faelligText, formatEuro } from '../lib/format';
import { useIch } from '../lib/useIch';
import { istGeplant, WERKZEUGE } from '../werkzeuge';

const MAX_AUFGABEN = 5;

function Werkzeuge({ heute, ueberfaellig, pipelineWert }: { heute: number; ueberfaellig: number; pipelineWert: number }) {
  return (
    <section className="tools" aria-label="Werkzeuge">
      <Link to="/crm" className="tool panel">
        <span className="tool-label">CRM</span>
        <span className="tool-text">Leads, Pipeline und Kundenakte</span>
        <span className="tool-figures">
          <span>
            <strong>{heute}</strong> heute
          </span>
          {ueberfaellig > 0 && (
            <span>
              <strong>{ueberfaellig}</strong> überfällig
            </span>
          )}
          <span>
            <strong>{formatEuro(pipelineWert)}</strong> Pipeline
          </span>
        </span>
        <span className="tool-cta">CRM öffnen →</span>
      </Link>
      {WERKZEUGE.filter(istGeplant).map((w) => (
        <div key={w.id} className="tool is-planned" aria-disabled="true">
          <span className="tool-label">
            {w.name} <span className="badge subtle">In Planung</span>
          </span>
          <span className="tool-text">{w.beschreibung}</span>
        </div>
      ))}
    </section>
  );
}

function HeuteDran({ db, ich, heute }: { db: Database; ich: string | null; heute: string }) {
  const tag = useMemo(() => meinTag(db, ich, heute), [db, ich, heute]);
  const aufgaben = [...tag.ueberfaellig, ...tag.heute];
  return (
    <Card
      title={
        <>
          Heute dran <span className="count">{aufgaben.length}</span>
        </>
      }
      actions={
        <Link to="/crm" className="button small">
          Mein Tag
        </Link>
      }
      className="task-card"
    >
      {aufgaben.length === 0 ? (
        <p className="muted">
          Für heute ist nichts offen.
          {tag.naechsteTage.length > 0 && ` In den nächsten 7 Tagen: ${tag.naechsteTage.length}.`}
        </p>
      ) : (
        <ul className="task-list">
          {aufgaben.slice(0, MAX_AUFGABEN).map((a) => (
            <li key={a.key} className={a.faellig < heute ? 'overdue' : 'today'}>
              <span className="task-kind" aria-hidden="true" />
              <div className="task-body">
                <span>{a.titel}</span>
                <div className="row-sub">
                  {a.firma && <Link to={`/crm/firmen/${a.firma.id}`}>{a.firma.name}</Link>}
                  {a.zustaendig && <> · {a.zustaendig}</>}
                  {a.faellig < heute && <> · {faelligText(a.faellig, heute)}</>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {aufgaben.length > MAX_AUFGABEN && (
        <p className="hint">
          Und {aufgaben.length - MAX_AUFGABEN} weitere – <Link to="/crm">alle in Mein Tag</Link>
        </p>
      )}
    </Card>
  );
}

function Kunden({ db }: { db: Database }) {
  const eintraege = useMemo(() => schnellzugriff(db), [db]);
  const phase = (firmaId: string) => db.deals.find((d) => d.firma_id === firmaId && d.phase === 'angebot' && !d.archiviert);
  return (
    <Card
      title={
        <>
          Kunden & Angebote <span className="count">{eintraege.length}</span>
        </>
      }
      actions={
        <Link to="/crm/firmen?status=kunde" className="button small">
          Alle Firmen
        </Link>
      }
    >
      {eintraege.length === 0 ? (
        <p className="muted">Noch keine Kunden und keine offenen Angebote.</p>
      ) : (
        <ul className="client-list">
          {eintraege.map(({ firma: f, art }) => {
            // Drive links are simulated in demo mode, so they are shown without a target.
            const links: { label: string; url?: string; title?: string }[] = [];
            if (f.drive_ordner_id) links.push({ label: 'Drive', url: isDemo ? undefined : driveFolderUrl(f.drive_ordner_id) });
            if (f.slack_channel) links.push({ label: 'Slack', url: slackChannelUrl(db.einstellungen, f.slack_channel), title: `#${f.slack_channel}` });
            if (f.trello_url) links.push({ label: 'Trello', url: f.trello_url });
            return (
              <li key={f.id}>
                <span className="client-kuerzel">{f.kuerzel ? <span className="kuerzel">{f.kuerzel}</span> : <span className="muted">–</span>}</span>
                <div className="client-main">
                  <Link to={`/crm/firmen/${f.id}`} className="row-title">
                    {f.name}
                  </Link>
                  <div className="row-sub">
                    {art === 'kunde' ? <StatusBadge status="kunde" /> : <PhaseBadge phase={phase(f.id)?.phase ?? 'angebot'} />}
                    {f.zustaendig && <> {f.zustaendig}</>}
                  </div>
                </div>
                <div className="client-links">
                  {links.length === 0 && <span className="muted small">Keine Links</span>}
                  {links.map((l) =>
                    l.url ? (
                      <a key={l.label} href={l.url} target="_blank" rel="noreferrer noopener" title={l.title}>
                        {l.label} ↗
                      </a>
                    ) : (
                      <span key={l.label} className="muted" title="Im Demo-Modus simuliert">
                        {l.label}
                      </span>
                    ),
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Links({ db }: { db: Database }) {
  const links = firmenLinks(db.einstellungen);
  return (
    <Card title="Links">
      <ul className="link-list">
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.url} target="_blank" rel="noreferrer noopener">
              {l.label} <span aria-hidden="true">↗</span>
            </a>
          </li>
        ))}
      </ul>
      {links.length < 5 && (
        <p className="hint">
          Weitere Links unter <Link to="/einrichtung">Einrichtung</Link>.
        </p>
      )}
    </Card>
  );
}

function Dateiname({ db, heute }: { db: Database; heute: string }) {
  const toast = useToast();
  const [datum, setDatum] = useState(heute);
  const [kuerzel, setKuerzel] = useState('');
  const [thema, setThema] = useState('');
  const [version, setVersion] = useState(1);
  const name = dateiname({ datum: datum || heute, kuerzel, thema, version });
  const kuerzelListe = useMemo(() => [...new Set(db.firmen.filter((f) => f.kuerzel && !f.archiviert).map((f) => f.kuerzel))].sort(), [db]);

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(name);
      toast.show('Dateiname kopiert');
    } catch {
      toast.show('Kopieren ging nicht – bitte markieren und von Hand kopieren.', 'error');
    }
  };

  return (
    <Card title="Dateiname">
      <p className="muted small">Nach dem Schema der Shared Drive: Datum, Kürzel, Thema, Version.</p>
      <div className="filename-form">
        <label className="field">
          <span className="field-label">Datum</span>
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Kürzel</span>
          <input value={kuerzel} onChange={(e) => setKuerzel(e.target.value)} list="start-kuerzel" placeholder="leer = firmenweit" />
          <datalist id="start-kuerzel">
            {kuerzelListe.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </label>
        <label className="field wide">
          <span className="field-label">Thema</span>
          <input value={thema} onChange={(e) => setThema(e.target.value)} placeholder="z. B. Kalkulation Shopify-Migration" />
        </label>
        <label className="field">
          <span className="field-label">Version</span>
          <input type="number" min={1} max={99} value={version} onChange={(e) => setVersion(Number(e.target.value))} />
        </label>
      </div>
      <div className="filename-result">
        <code>{name}</code>
        <button type="button" className="button small primary" onClick={kopieren} disabled={!thema.trim()}>
          Kopieren
        </button>
      </div>
    </Card>
  );
}

export function StartPage() {
  const { db, loading, error, refresh } = useCrm();
  const [ich] = useIch(db?.listen.team ?? []);
  const heute = isoDate(new Date());

  const zahlen = useMemo(() => {
    if (!db) return null;
    const tag = meinTag(db, ich, heute);
    const firmen = new Map(db.firmen.map((f) => [f.id, f]));
    const deals = db.deals.filter((d) => !firmen.get(d.firma_id)?.archiviert && (!ich || d.zustaendig === ich));
    return { heute: tag.heute.length, ueberfaellig: tag.ueberfaellig.length, pipelineWert: kennzahlen(deals, heute).pipelineWert };
  }, [db, ich, heute]);

  if (!db || !zahlen) return <div className="page">{error ? <ErrorBox error={error} onRetry={refresh} /> : loading && <Loading />}</div>;

  const stunde = new Date().getHours();
  const begruessung = stunde < 11 ? 'Guten Morgen' : stunde < 18 ? 'Hallo' : 'Guten Abend';

  return (
    <div className="page">
      <PageHeader
        eyebrow={new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${begruessung}${ich ? `, ${ich}` : ''}`}
        subtitle="CRM, Kunden und interne Werkzeuge an einem Ort."
      />
      {error && <ErrorBox error={error} onRetry={refresh} />}
      <Werkzeuge {...zahlen} />
      <div className="start-grid">
        <div className="start-main">
          <HeuteDran db={db} ich={ich} heute={heute} />
          <Kunden db={db} />
        </div>
        <div className="start-side">
          <Links db={db} />
          <Dateiname db={db} heute={heute} />
        </div>
      </div>
    </div>
  );
}
