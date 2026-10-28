import { Link } from 'react-router-dom';
import { Card, ErrorBox, Loading, PageHeader } from '../../components/ui';
import { useCreatorApi } from '../api';
import { useLaden } from '../content/gemeinsam';
import type { StartDaten } from './typen';

/**
 * Home of an own instance (Punkt 32): this week's uploads and deadlines, cooperations due, approvals for me, latest numbers,
 * the newest report and news from Velonify (the tour on the first login is CreatorRundgang in the layout). Tiles come from crm-api, only for the person's
 * switched-on tools and building blocks.
 */
export const CREATOR_START_FERTIG = true;

const PLATTFORM: Record<string, string> = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', twitch: 'Twitch' };
const tagText = (s: string) => (s ? new Date(`${s.slice(0, 10)}T12:00:00Z`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' }) : '');
const zahl = (w: number | null) => (w === null ? '–' : new Intl.NumberFormat('de-DE', { notation: w >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(w));
const geld = (w: number | null, waehrung: string) => (w === null ? '' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: waehrung || 'EUR', maximumFractionDigits: 0 }).format(w));

export function CreatorStart() {
  const r = useLaden<StartDaten>('/c/start');
  const api = useCreatorApi();
  const d = r.daten;
  const hat = (k: StartDaten['kacheln'][number]) => d?.kacheln.includes(k) ?? false;
  const neu = d?.neuigkeiten.filter((n) => n.neu) ?? [];

  return (
    <div className="page">
      {r.fehler ? <ErrorBox error={r.fehler} onRetry={() => void r.laden()} /> : null}
      {!d && !r.fehler && <Loading />}
      {d && (
        <>
          <PageHeader eyebrow={`Woche ${tagText(d.woche.von)} – ${tagText(d.woche.bis)}`} title={`Hallo, ${d.person}`} subtitle="Was diese Woche ansteht." />
          {neu.length > 0 && (
            <Card
              title="Neu im Hub"
              actions={
                <button type="button" className="button small" onClick={() => void api.post('/c/start/neuigkeiten/gesehen').then(() => r.laden())}>
                  Gelesen
                </button>
              }
            >
              <ul className="liste-schlicht">
                {neu.map((n) => (
                  <li key={n.id}>
                    <strong>{n.titel}</strong> {n.text && <span className="small">{n.text}</span>} {n.link && <Link to={n.link}>Ansehen</Link>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <div className="start-raster">
            {hat('freigaben') && d.freigaben.length > 0 && (
              <Card title={`Wartet auf deine Freigabe (${d.freigaben.length})`}>
                <ul className="liste-schlicht">
                  {d.freigaben.map((f) => (
                    <li key={f.id}>
                      {f.link ? <Link to={f.link}>{f.titel}</Link> : f.titel} <span className="muted small">· von {f.angefragt_von}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/freigaben" className="small">
                  Alle Freigaben
                </Link>
              </Card>
            )}
            {hat('uploads') && (
              <Card title="Uploads diese Woche">
                {d.uploads.length === 0 && <p className="muted">Nichts geplant.</p>}
                <ul className="liste-schlicht">
                  {d.uploads.map((i) => (
                    <li key={i.id}>
                      <Link to={`/content/inhalte/${i.id}`}>{i.titel}</Link>{' '}
                      <span className="muted small">
                        · {tagText(i.geplant_am)} · {PLATTFORM[i.kanal] ?? i.kanal} · {i.status}
                        {i.zustaendig ? ` · ${i.zustaendig}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {hat('fristen') && (
              <Card title="Fristen">
                {d.fristen.length === 0 && <p className="muted">Keine Fristen in dieser Woche.</p>}
                <ul className="liste-schlicht">
                  {d.fristen.map((f) => (
                    <li key={f.id}>
                      {f.link ? <Link to={f.link}>{f.titel}</Link> : f.titel}{' '}
                      <span className="muted small">
                        · {tagText(f.datum)}
                        {f.uhrzeit ? ` ${f.uhrzeit}` : ''}
                        {f.zustaendig ? ` · ${f.zustaendig}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link to="/fristen" className="small">
                  Zum Kalender
                </Link>
              </Card>
            )}
            {hat('kooperationen') && (
              <Card title="Kooperationen, die anstehen">
                {d.kooperationen.length === 0 && <p className="muted">Nichts fällig.</p>}
                <ul className="liste-schlicht">
                  {d.kooperationen.map((k) => (
                    <li key={k.id}>
                      <Link to="/kooperationen">{k.partner}</Link>{' '}
                      <span className="muted small">
                        · {k.stand}
                        {k.faellig_am ? ` · fällig ${tagText(k.faellig_am)}` : ''}
                        {k.betrag !== null ? ` · ${geld(k.betrag, k.waehrung)} (${k.zahlung})` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {hat('zahlen') && (
              <Card title="Zahlen">
                {d.zahlen.length === 0 && <p className="muted">Noch keine Kanäle.</p>}
                <ul className="liste-schlicht">
                  {d.zahlen.map((k) => (
                    <li key={k.id}>
                      <strong>{PLATTFORM[k.plattform] ?? k.plattform}</strong> {zahl(k.follower)} Follower
                      {k.follower_plus !== null && <span className="small"> ({k.follower_plus >= 0 ? '+' : ''}{zahl(k.follower_plus)} in 7 Tagen)</span>}
                      {k.beispiel && <span className="muted small"> · Beispielzahlen</span>}
                    </li>
                  ))}
                </ul>
                <Link to="/analytics" className="small">
                  Zu Analytics
                </Link>
              </Card>
            )}
            {hat('bericht') && d.bericht && (
              <Card title="Neuester Bericht">
                <p>
                  <Link to={`/analytics/berichte/${d.bericht.id}`}>
                    {d.bericht.typ === 'monat' ? 'Monatsbericht' : 'Wochenbericht'} {tagText(d.bericht.von)} – {tagText(d.bericht.bis)}
                  </Link>{' '}
                  <span className="muted small">· {d.bericht.status === 'freigegeben' ? 'freigegeben' : 'Entwurf'}</span>
                </p>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
