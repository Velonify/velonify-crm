import { useMemo, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { Card, ErrorBox, Loading, PageHeader, StatusBadge } from '../components/ui';
import { isDemo } from '../config';
import { useCrm } from '../data/CrmContext';
import { driveFolderUrl, isFolder, type DriveFile } from '../data/google/drive';
import { addDays, isoDate } from '../data/ids';
import { CLIENT_SHARE_ORDNER, erledigtAlsTicker, hubWerkzeuge, sortiereTicker, kundenListe, LINK_ART_LABEL, linksVon, ordnerReiter, ticker, type TickerEintrag } from '../data/kunden';
import { kontaktName } from '../data/rules';
import { slackChannelUrl } from '../data/start';
import type { Database, Firma, KundenDaten, KundenLink, KundenLinkArt } from '../data/types';
import { formatDateTime, websiteUrl } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import { LinkDialog, NewsDialog, type Aendern } from './Dialoge';
import { TickerBand, TickerListe } from './Ticker';
import { useKundenDaten } from './useKundenDaten';
import { useToast } from '../components/Toasts';
import { boardVon, kuerzlichErledigt } from '../data/todos';
import { errorMessage } from '../lib/errors';
import { BoardAnsicht } from '../todo/BoardAnsicht';
import { useTodoDaten } from '../todo/useTodoDaten';

/** Finished cards of the client board stay in the ticker for a week. */
const ERLEDIGT_TAGE = 7;

const BEREICHE = [
  { pfad: '', label: 'Übersicht' },
  { pfad: 'todos', label: 'To-dos' },
  { pfad: 'dateien', label: 'Dateien' },
  { pfad: 'tools', label: 'Tools & Ressourcen' },
  { pfad: 'news', label: 'News' },
] as const;

const driveLink = (file: DriveFile) => (isDemo ? undefined : file.webViewLink ?? driveFolderUrl(file.id));

/** Recent files in the client share; they show up in the ticker. Empty without a client folder. */
function useClientShare(firma: Firma | undefined) {
  const { service } = useCrm();
  return useLoad(async () => {
    if (!service || !firma?.drive_ordner_id) return [];
    const share = (await service.ordnerDateien(firma.drive_ordner_id)).find((f) => isFolder(f) && f.name === CLIENT_SHARE_ORDNER);
    return share ? (await service.ordnerDateien(share.id)).filter((f) => !isFolder(f)) : [];
  }, [service, firma?.drive_ordner_id]);
}

export function KundePage() {
  const { id = '', bereich = '' } = useParams();
  const { db, error: dbError, refresh } = useCrm();
  const daten = useKundenDaten();
  const firma = db?.firmen.find((f) => f.id === id);
  const share = useClientShare(firma);
  const heute = isoDate(new Date());
  const todos = useTodoDaten();
  const board = todos.data ? boardVon(todos.data.boards, id) : undefined;
  const eintraege = useMemo(() => {
    if (!daten.data) return [];
    const erledigt = board && todos.data ? erledigtAlsTicker(kuerzlichErledigt(todos.data.aufgaben, board.id, addDays(heute, -ERLEDIGT_TAGE))) : [];
    return sortiereTicker([...ticker(daten.data.news, id, heute, share.data ?? []), ...erledigt]);
  }, [daten.data, id, heute, share.data, board, todos.data]);

  if (!db) return <div className="page">{dbError ? <ErrorBox error={dbError} onRetry={refresh} /> : <Loading />}</div>;
  if (!firma) {
    return (
      <div className="page">
        <PageHeader eyebrow="Kunden" title="Kunde nicht gefunden" />
        <p>
          Diese Firma gibt es nicht (mehr). <Link to="/kunden">Zur Kundenliste</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="page wide">
      <PageHeader
        eyebrow={
          <nav aria-label="Pfad">
            <Link to="/kunden">Kunden</Link>
          </nav>
        }
        title={firma.name}
        subtitle={
          <span className="badges">
            <StatusBadge status={firma.status} />
            {firma.kuerzel && <span className="kuerzel">{firma.kuerzel}</span>}
            {firma.zustaendig && <span>Zuständig: {firma.zustaendig}</span>}
          </span>
        }
        actions={
          <Link to={`/crm/firmen/${firma.id}`} className="button">
            CRM-Akte
          </Link>
        }
      />
      {firma.status !== 'kunde' && <div className="hint-box warn">Diese Firma ist im CRM nicht als Kunde markiert und steht deshalb nicht in der Kundenliste.</div>}

      <TickerBand eintraege={eintraege} />

      <nav className="segmented kunden-reiter" aria-label="Bereiche">
        {BEREICHE.map((b) => (
          <NavLink key={b.pfad} to={`/kunden/${firma.id}${b.pfad ? `/${b.pfad}` : ''}`} end className={({ isActive }) => (isActive ? 'is-active' : '')}>
            {b.label}
          </NavLink>
        ))}
      </nav>

      {daten.error && <ErrorBox error={daten.error} onRetry={daten.reload} />}
      {bereich === '' && <Uebersicht firma={firma} db={db} daten={daten.data} eintraege={eintraege} aendern={daten.aendern} />}
      {bereich === 'todos' && <KundenTodos firma={firma} team={db.listen.team ?? []} todos={todos} />}
      {bereich === 'dateien' && <Dateien firma={firma} />}
      {bereich === 'tools' && (daten.data ? <ToolsUndRessourcen firma={firma} daten={daten.data} aendern={daten.aendern} /> : !daten.error && <Loading />)}
      {bereich === 'news' && (daten.data ? <News firma={firma} db={db} daten={daten.data} heute={heute} aendern={daten.aendern} /> : !daten.error && <Loading />)}
    </div>
  );
}

function Uebersicht({ firma, db, daten, eintraege, aendern }: { firma: Firma; db: Database; daten?: KundenDaten; eintraege: TickerEintrag[]; aendern: Aendern }) {
  const [newsDialog, setNewsDialog] = useState(false);
  const angeheftet = daten ? linksVon(daten.links, firma.id).filter((l) => l.angeheftet) : [];
  const kontakte = db.kontakte.filter((k) => k.firma_id === firma.id && !k.archiviert).sort((a, b) => Number(b.hauptkontakt) - Number(a.hauptkontakt));

  return (
    <div className="akte">
      <div className="akte-main">
        <Card
          title="Neuigkeiten"
          actions={
            <>
              <Link to={`/kunden/${firma.id}/news`} className="button small">
                Alle
              </Link>
              <button type="button" className="button small" onClick={() => setNewsDialog(true)} disabled={!daten}>
                + Meldung
              </button>
            </>
          }
        >
          {!daten && <Loading />}
          {daten && eintraege.length === 0 && <p className="muted">Noch keine Meldungen. Neue Dateien in {CLIENT_SHARE_ORDNER} erscheinen hier automatisch.</p>}
          {daten && <TickerListe eintraege={eintraege.slice(0, 6)} />}
        </Card>
        <Card
          title="Angeheftet"
          actions={
            <Link to={`/kunden/${firma.id}/tools`} className="button small">
              Alle Links
            </Link>
          }
        >
          {!daten && <Loading />}
          {daten && angeheftet.length === 0 && <p className="muted">Unter „Tools & Ressourcen“ Links anheften, die ihr täglich braucht.</p>}
          {angeheftet.length > 0 && (
            <ul className="link-list">
              {angeheftet.map((l) => (
                <li key={l.id}>
                  <a href={l.url} target="_blank" rel="noreferrer noopener" title={l.beschreibung || undefined}>
                    {l.titel} <span aria-hidden="true">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="akte-side">
        <Card title="Steckbrief">
          <dl className="items">
            <div className="item">
              <dt>Shop</dt>
              <dd>{firma.domain ? <a href={websiteUrl(firma.domain)} target="_blank" rel="noreferrer noopener">{firma.domain} ↗</a> : <span className="muted">–</span>}</dd>
            </div>
            <div className="item">
              <dt>Slack</dt>
              <dd>{firma.slack_channel ? <a href={slackChannelUrl(db.einstellungen, firma.slack_channel)} target="_blank" rel="noreferrer noopener">#{firma.slack_channel.replace(/^#/, '')} ↗</a> : <span className="muted">–</span>}</dd>
            </div>
            <div className="item">
              <dt>Drive</dt>
              <dd>{firma.drive_ordner_id ? (isDemo ? <span className="muted">Kundenordner (Demo)</span> : <a href={driveFolderUrl(firma.drive_ordner_id)} target="_blank" rel="noreferrer noopener">Kundenordner ↗</a>) : <span className="muted">–</span>}</dd>
            </div>
            <div className="item">
              <dt>Kontakte</dt>
              <dd>
                {kontakte.length === 0 && <span className="muted">–</span>}
                {kontakte.map((k) => (
                  <div key={k.id}>
                    {kontaktName(k)}
                    {k.rolle && <span className="muted"> · {k.rolle}</span>}
                    {k.email && (
                      <>
                        {' · '}
                        <a href={`mailto:${k.email}`}>{k.email}</a>
                      </>
                    )}
                  </div>
                ))}
              </dd>
            </div>
          </dl>
        </Card>
        <Card title="Im Hub">
          <ul className="link-list">
            {hubWerkzeuge(firma).map((w) => (
              <li key={w.pfad}>
                <Link to={w.pfad}>{w.label}</Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {newsDialog && <NewsDialog firmaId={firma.id} kunden={kundenListe(db)} aendern={aendern} onClose={() => setNewsDialog(false)} />}
    </div>
  );
}

/** The client folder in Drive: template subfolders as tabs, then click through. */
function Dateien({ firma }: { firma: Firma }) {
  const { service } = useCrm();
  const wurzel = useLoad(async () => (service && firma.drive_ordner_id ? service.ordnerDateien(firma.drive_ordner_id) : []), [service, firma.drive_ordner_id]);
  const reiter = useMemo(() => ordnerReiter(wurzel.data ?? [], isFolder), [wurzel.data]);
  const [pfad, setPfad] = useState<DriveFile[]>([]);
  const aktuell = pfad[pfad.length - 1];
  const inhalt = useLoad(async () => (service && aktuell ? service.ordnerDateien(aktuell.id) : null), [service, aktuell?.id]);

  if (!firma.drive_ordner_id) {
    return (
      <Card title="Dateien">
        <p className="muted">
          Noch kein Drive-Ordner verknüpft. In der <Link to={`/crm/firmen/${firma.id}`}>CRM-Akte</Link> anlegen oder verlinken.
        </p>
      </Card>
    );
  }
  if (wurzel.error) return <ErrorBox error={wurzel.error} onRetry={wurzel.reload} />;
  if (!wurzel.data) return <Loading label="Ordner wird geladen …" />;

  const lose = wurzel.data.filter((f) => !isFolder(f));
  const dateien = aktuell ? inhalt.data : lose;

  return (
    <div className="dateien">
      <nav className="chips" aria-label="Ordner">
        <button type="button" className={`chip${!aktuell ? ' is-active' : ''}`} onClick={() => setPfad([])}>
          Hauptordner
        </button>
        {reiter.map((r) => (
          <button key={r.id} type="button" className={`chip${pfad[0]?.id === r.id ? ' is-active' : ''}`} onClick={() => setPfad([r])}>
            {r.name}
          </button>
        ))}
      </nav>
      <Card
        title={
          <span className="ordner-pfad">
            {aktuell ? (
              pfad.map((p, i) =>
                i < pfad.length - 1 ? (
                  <span key={p.id}>
                    <button type="button" className="link-button" onClick={() => setPfad(pfad.slice(0, i + 1))}>
                      {p.name}
                    </button>
                    {' / '}
                  </span>
                ) : (
                  <span key={p.id}>{p.name}</span>
                ),
              )
            ) : (
              'Hauptordner'
            )}
          </span>
        }
        actions={
          <a className="button small" href={isDemo ? undefined : driveFolderUrl(aktuell?.id ?? firma.drive_ordner_id)} target="_blank" rel="noreferrer noopener" aria-disabled={isDemo}>
            In Drive öffnen ↗
          </a>
        }
      >
        {aktuell?.name === CLIENT_SHARE_ORDNER && <p className="hint">Was hier liegt, sieht später der Kunde im Portal. Neue Dateien laufen 14 Tage im News-Ticker.</p>}
        {aktuell && inhalt.error && <ErrorBox error={inhalt.error} onRetry={inhalt.reload} />}
        {aktuell && inhalt.loading && !inhalt.data && <Loading label="Ordner wird geladen …" />}
        {dateien && dateien.length === 0 && <p className="muted">{aktuell ? 'Der Ordner ist leer.' : 'Keine losen Dateien im Hauptordner – oben einen Unterordner wählen.'}</p>}
        {dateien && dateien.length > 0 && (
          <ul className="file-list">
            {dateien.map((d) => (
              <li key={d.id}>
                <span className="file-kind">{isFolder(d) ? 'Ordner' : 'Datei'}</span>
                {isFolder(d) ? (
                  <button type="button" className="link-button datei-name" onClick={() => setPfad([...pfad, d])}>
                    {d.name}
                  </button>
                ) : (
                  <a href={driveLink(d)} target="_blank" rel="noreferrer noopener">
                    {d.name}
                  </a>
                )}
                {!isFolder(d) && d.modifiedTime && <span className="muted small">{formatDateTime(d.modifiedTime)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ToolsUndRessourcen({ firma, daten, aendern }: { firma: Firma; daten: KundenDaten; aendern: Aendern }) {
  const [archiv, setArchiv] = useState(false);
  const [dialog, setDialog] = useState<{ art: KundenLinkArt; link?: KundenLink } | null>(null);
  const alle = linksVon(daten.links, firma.id, archiv);
  const aktive = linksVon(daten.links, firma.id);

  const verschieben = (link: KundenLink, richtung: -1 | 1) => void aendern((s) => s.verschiebeKundenLink(link.id, richtung));

  const spalte = (art: KundenLinkArt) => {
    const liste = alle.filter((l) => l.art === art);
    const reihenfolge = aktive.filter((l) => l.art === art);
    return (
      <Card
        title={
          <>
            {art === 'tool' ? 'Tools' : 'Ressourcen'} <span className="count">{reihenfolge.length}</span>
          </>
        }
        actions={
          <button type="button" className="button small" onClick={() => setDialog({ art })}>
            + {LINK_ART_LABEL[art]}
          </button>
        }
      >
        {liste.length === 0 && <p className="muted">{art === 'tool' ? 'Shopify-Admin, GA4, Klaviyo, Staging …' : 'Briefings, Brand-Guidelines, Roadmap …'}</p>}
        <ul className="kunden-links">
          {liste.map((l) => {
            const index = reihenfolge.findIndex((r) => r.id === l.id);
            return (
              <li key={l.id} className={l.archiviert ? 'is-archived' : ''}>
                <div className="kunden-link-text">
                  <a href={l.url} target="_blank" rel="noreferrer noopener" className="row-title">
                    {l.titel} ↗
                  </a>
                  <div className="row-sub">
                    {l.angeheftet && <span className="badge subtle">Angeheftet</span>}
                    {l.sichtbar_kunde && <span className="badge ok">Für Kunde sichtbar</span>}
                    {l.archiviert && <span className="badge archived">Archiviert</span>}
                    {l.beschreibung}
                  </div>
                </div>
                <div className="card-actions">
                  {!l.archiviert && (
                    <>
                      <button type="button" className="button small subtle" onClick={() => verschieben(l, -1)} disabled={index <= 0} aria-label={`${l.titel} nach oben`}>
                        ↑
                      </button>
                      <button type="button" className="button small subtle" onClick={() => verschieben(l, 1)} disabled={index === reihenfolge.length - 1} aria-label={`${l.titel} nach unten`}>
                        ↓
                      </button>
                    </>
                  )}
                  <button type="button" className="button small" onClick={() => setDialog({ art, link: l })}>
                    Bearbeiten
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    );
  };

  return (
    <>
      <div className="akte">
        <div className="akte-main">{spalte('tool')}</div>
        <div className="akte-side">{spalte('ressource')}</div>
      </div>
      <label className="checkbox archiv-schalter">
        <input type="checkbox" checked={archiv} onChange={(e) => setArchiv(e.target.checked)} />
        Archivierte zeigen
      </label>
      {dialog && <LinkDialog firma={firma} art={dialog.art} link={dialog.link} aendern={aendern} onClose={() => setDialog(null)} />}
    </>
  );
}

function News({ firma, db, daten, heute, aendern }: { firma: Firma; db: Database; daten: KundenDaten; heute: string; aendern: Aendern }) {
  const [archiv, setArchiv] = useState(false);
  const [dialog, setDialog] = useState<{ eintrag?: TickerEintrag } | null>(null);
  const aktive = ticker(daten.news, firma.id, heute);
  const eintraege = ticker(daten.news, firma.id, heute, [], archiv);

  return (
    <>
      <Card
        title={
          <>
            News <span className="count">{aktive.length}</span>
          </>
        }
        actions={
          <button type="button" className="button small" onClick={() => setDialog({})}>
            + Meldung
          </button>
        }
      >
        {aktive.length === 0 && <p className="muted">Noch keine Meldungen für {firma.kuerzel || firma.name}.</p>}
        <TickerListe eintraege={eintraege} onBearbeiten={(e) => setDialog({ eintrag: e })} />
      </Card>
      <label className="checkbox archiv-schalter">
        <input type="checkbox" checked={archiv} onChange={(e) => setArchiv(e.target.checked)} />
        Archivierte zeigen
      </label>
      {dialog && <NewsDialog news={dialog.eintrag?.news} firmaId={firma.id} kunden={kundenListe(db)} aendern={aendern} onClose={() => setDialog(null)} />}
    </>
  );
}

function KundenTodos({ firma, team, todos }: { firma: Firma; team: readonly string[]; todos: ReturnType<typeof useTodoDaten> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (todos.error) return <ErrorBox error={todos.error} onRetry={todos.reload} />;
  if (!todos.data) return <Loading />;
  const board = boardVon(todos.data.boards, firma.id);
  if (!board) {
    const anlegen = async () => {
      setBusy(true);
      try {
        await todos.aendern((s) => s.boardFuer(firma.id));
      } catch (err) {
        toast.show(errorMessage(err), 'error');
      } finally {
        setBusy(false);
      }
    };
    return (
      <Card title="To-dos">
        <p className="muted">{firma.kuerzel || firma.name} hat noch kein Board.</p>
        <button type="button" className="button primary" onClick={() => void anlegen()} disabled={busy}>
          {busy ? 'Legt an …' : 'Board anlegen'}
        </button>
      </Card>
    );
  }
  return (
    <>
      <p className="hint">
        <Link to={`/todo/${board.id}`}>Board in voller Breite öffnen</Link>
      </p>
      <BoardAnsicht board={board} daten={todos.data} setDaten={todos.setData} team={team} aendern={todos.aendern} />
    </>
  );
}
