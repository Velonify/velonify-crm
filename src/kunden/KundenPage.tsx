import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, ErrorBox, Loading, PageHeader } from '../components/ui';
import { isDemo } from '../config';
import { useCrm } from '../data/CrmContext';
import { driveFolderUrl } from '../data/google/drive';
import { addDays, isoDate } from '../data/ids';
import { kundenListe, linksVon, ticker, type TickerEintrag } from '../data/kunden';
import { slackChannelUrl } from '../data/start';
import { websiteUrl } from '../lib/format';
import { NewsDialog } from './Dialoge';
import { TickerListe } from './Ticker';
import { useKundenDaten } from './useKundenDaten';

/** All clients as cards, plus the ticker across all of them. */
export function KundenPage() {
  const { db, error: dbError, refresh } = useCrm();
  const { data, error, reload, aendern } = useKundenDaten();
  const [dialog, setDialog] = useState<{ eintrag?: TickerEintrag } | null>(null);
  const kunden = useMemo(() => (db ? kundenListe(db) : []), [db]);
  const heute = isoDate(new Date());

  if (!db) return <div className="page">{dbError ? <ErrorBox error={dbError} onRetry={refresh} /> : <Loading />}</div>;

  const alleNews = data ? ticker(data.news, null, heute) : [];
  const kuerzelVon = (e: TickerEintrag) => {
    const f = db.firmen.find((k) => k.id === e.news?.firma_id);
    return f?.kuerzel || f?.name || '';
  };

  return (
    <div className="page wide">
      <PageHeader
        title="Kunden"
        zahlen={[
          { wert: kunden.length, label: kunden.length === 1 ? 'Kunde' : 'Kunden' },
          { wert: alleNews.filter((e) => e.datum >= addDays(heute, -7)).length, label: 'News in den letzten 7 Tagen' },
          ...(data ? [{ wert: data.links.filter((l) => !l.archiviert).length, label: 'Tools & Ressourcen' }] : []),
        ]}
        ueberlappen
        actions={
          <button type="button" className="button primary" onClick={() => setDialog({})} disabled={!data}>
            + Meldung
          </button>
        }
      />
      {error && <ErrorBox error={error} onRetry={reload} />}

      <div className="start-grid">
        <div className="start-main">
          {kunden.length === 0 ? (
            <Card title="Noch keine Kunden">
              <p className="muted">
                Sobald eine Firma im CRM den Status „Kunde“ hat, bekommt sie hier ihre Seite. <Link to="/crm/firmen">Zu den Firmen</Link>
              </p>
            </Card>
          ) : (
            <ul className="kunden-karten">
              {kunden.map((k) => {
                const neueste = data ? ticker(data.news, k.id, heute).find((e) => !e.alleKunden) : undefined;
                const anzahl = data ? linksVon(data.links, k.id).length : null;
                return (
                  <li key={k.id} className="kunden-karte">
                    <Link to={`/kunden/${k.id}`} className="kunden-karte-kopf">
                      <span className="kuerzel">{k.kuerzel || '–'}</span>
                      <span className="kunden-karte-name">{k.name}</span>
                    </Link>
                    <p className="row-sub">
                      {k.zustaendig ? `Zuständig: ${k.zustaendig}` : 'Niemand zuständig'}
                      {anzahl !== null && ` · ${anzahl} ${anzahl === 1 ? 'Link' : 'Links'}`}
                    </p>
                    <p className="kunden-karte-news">{neueste ? neueste.titel : <span className="muted">Noch keine News</span>}</p>
                    <div className="client-links">
                      {k.drive_ordner_id && (isDemo ? <span className="muted">Drive</span> : <a href={driveFolderUrl(k.drive_ordner_id)} target="_blank" rel="noreferrer noopener">Drive ↗</a>)}
                      {k.slack_channel && <a href={slackChannelUrl(db.einstellungen, k.slack_channel)} target="_blank" rel="noreferrer noopener">Slack ↗</a>}
                      {k.domain && <a href={websiteUrl(k.domain)} target="_blank" rel="noreferrer noopener">Shop ↗</a>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="start-side">
          <Card title={<>News <span className="count">{alleNews.length}</span></>}>
            {!data && !error && <Loading />}
            {data && alleNews.length === 0 && <p className="muted">Noch keine Meldungen.</p>}
            {data && <TickerListe eintraege={alleNews.slice(0, 12)} onBearbeiten={(e) => setDialog({ eintrag: e })} zeigeKunde={kuerzelVon} />}
          </Card>
        </div>
      </div>

      {dialog && <NewsDialog news={dialog.eintrag?.news} firmaId="" kunden={kunden} aendern={aendern} onClose={() => setDialog(null)} />}
    </div>
  );
}
