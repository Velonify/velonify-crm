import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, ErrorBox, Field, Loading, PageHeader } from '../../components/ui';
import { darfEinrichten } from '../../data/instanz';
import { useInstanz } from '../api';
import { BeispielBand, MerkmalVergleich, useAktion, useCreatorApi, useLaden } from './gemeinsam';
import { datum, PLATTFORM_LABEL, prozent, zahlText, type Konto, type Vergleich, type Video } from './typen';

interface UebersichtDaten {
  konten: Konto[];
  videos: Video[];
  vergleich: Vergleich[];
  beispiel: boolean;
}

/** Punkt 13/16: all channels in one place, with sample numbers until the first real fetch. */
export function AnalyticsUebersicht() {
  const r = useLaden<UebersichtDaten>('/c/analytics/uebersicht');
  const api = useCreatorApi();
  const instanz = useInstanz();
  const aktion = useAktion();
  const admin = darfEinrichten(instanz.rolle);

  return (
    <div className="page">
      <PageHeader eyebrow="Analytics" title="Übersicht" subtitle="Alle Kanäle zusammengestellt. Details und Video-Performance je Kanal in den Reitern." />
      {r.fehler ? <ErrorBox error={r.fehler} onRetry={() => void r.laden()} /> : null}
      {!r.daten && !r.fehler && <Loading />}
      {r.daten && (
        <>
          <BeispielBand an={r.daten.beispiel} />
          {r.daten.konten.length === 0 ? (
            <Card title="Noch keine Zahlen">
              <p>Verbindet eure Kanäle unter „Verbindungen“. Bis dahin könnt ihr mit klar markierten Beispielzahlen sehen, wie der Hub aussieht.</p>
              {admin && (
                <div className="form-actions">
                  <button type="button" className="button primary" disabled={aktion.busy} onClick={() => void aktion.run(async () => (await api.post('/c/analytics/beispiele'), await r.laden()), 'Beispielzahlen eingespielt')}>
                    Beispielzahlen einspielen
                  </button>
                  <Link to="/analytics/kanaele" className="button">
                    Kanäle verbinden
                  </Link>
                </div>
              )}
              {aktion.feedback}
            </Card>
          ) : (
            <>
            <Summen videos={r.daten.videos} konten={r.daten.konten} />
            <div className="analytics-kacheln">
              {r.daten.konten.map((k) => (
                <Link key={k.id} to={k.plattform === 'twitch' ? '/analytics/twitch' : `/analytics/kanal/${k.plattform}`} className="analytics-kachel card">
                  <p className="small muted">
                    {PLATTFORM_LABEL[k.plattform] ?? k.plattform} · {k.handle || k.name}
                    {k.beispiel ? ' · Beispiel' : ''}
                  </p>
                  <p className="zahl">{zahlText(k.follower)}</p>
                  <p className="small">Follower · Stand {datum(k.datum)}</p>
                  {k.status === 'fehler' && <p className="small alert error">{k.fehler}</p>}
                </Link>
              ))}
            </div>
            </>
          )}
          {r.daten.videos.length > 0 && (
            <Card title="Was funktioniert">
              <MerkmalVergleich vergleich={r.daten.vergleich} />
            </Card>
          )}
          {r.daten.videos.length > 0 && <VideoTabelle videos={besteZuerst(r.daten.videos).slice(0, 10)} titel="Beste Videos über alle Kanäle" />}
        </>
      )}
    </div>
  );
}

const besteZuerst = (videos: Video[]) => [...videos].sort((a, b) => (b.aufrufe ?? -1) - (a.aufrufe ?? -1));
const summe = (werte: (number | null)[]) => (werte.some((w) => w !== null) ? werte.reduce<number>((s, w) => s + (w ?? 0), 0) : null);
const mittel = (werte: (number | null)[]) => {
  const da = werte.filter((w): w is number => w !== null);
  return da.length ? da.reduce((s, w) => s + w, 0) / da.length : null;
};

/** Key figures of a set of channels and their videos (overview: all, channel tab: one platform). */
function Summen({ konten, videos }: { konten: Konto[]; videos: Video[] }) {
  return (
    <dl className="band-zahlen">
      <div><dt>Follower</dt><dd>{zahlText(summe(konten.map((k) => k.follower)))}</dd></div>
      <div><dt>Reichweite</dt><dd>{zahlText(summe(konten.map((k) => k.reichweite)))}</dd></div>
      <div><dt>Videos</dt><dd>{zahlText(videos.length)}</dd></div>
      <div><dt>Aufrufe der Videos</dt><dd>{zahlText(summe(videos.map((v) => v.aufrufe)))}</dd></div>
      <div><dt>Ø Interaktion</dt><dd>{prozent(mittel(videos.map((v) => v.interaktionsrate)))}</dd></div>
    </dl>
  );
}

/** One channel: its insights (account values, totals) and the performance of every video, best first. */
export function AnalyticsKanal() {
  const { plattform = '' } = useParams();
  const r = useLaden<UebersichtDaten>('/c/analytics/uebersicht');
  const [suche, setSuche] = useState('');
  const konten = (r.daten?.konten ?? []).filter((k) => k.plattform === plattform);
  const alle = (r.daten?.videos ?? []).filter((v) => v.plattform === plattform);
  const videos = besteZuerst(alle.filter((v) => !suche || `${v.titel} ${v.thema} ${v.format} ${v.hook}`.toLowerCase().includes(suche.toLowerCase())));
  const label = PLATTFORM_LABEL[plattform] ?? plattform;
  return (
    <div className="page">
      <PageHeader eyebrow="Analytics" title={label} subtitle={`Insights und Video-Performance von ${label}.`} />
      {r.fehler ? <ErrorBox error={r.fehler} onRetry={() => void r.laden()} /> : null}
      {!r.daten && !r.fehler && <Loading />}
      {r.daten && (
        <>
          <BeispielBand an={konten.some((k) => k.beispiel)} />
          {konten.length === 0 ? (
            <Card title="Noch nicht verbunden">
              <p>{label} ist noch nicht verbunden. Das geht unter <Link to="/analytics/kanaele">Verbindungen</Link>.</p>
            </Card>
          ) : (
            <>
              <Summen konten={konten} videos={alle} />
              <div className="analytics-kacheln">
                {konten.map((k) => (
                  <div key={k.id} className="analytics-kachel card">
                    <p className="small muted">{k.handle || k.name}{k.beispiel ? ' · Beispiel' : ''}</p>
                    <p className="zahl">{zahlText(k.follower)}</p>
                    <p className="small">Follower · Aufrufe {zahlText(k.aufrufe)} · Reichweite {zahlText(k.reichweite)} · Stand {datum(k.datum)}</p>
                    {k.status === 'fehler' && <p className="small alert error">{k.fehler}</p>}
                  </div>
                ))}
              </div>
              <div className="filters">
                <Field label="Suche">
                  <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Titel oder Merkmal" />
                </Field>
              </div>
              <VideoTabelle videos={videos} titel={`${videos.length} Videos, die besten zuerst`} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Punkt 15: every video with its latest values (API, or TikTok-Studio export where newer). */
export function AnalyticsVideos() {
  const r = useLaden<UebersichtDaten>('/c/analytics/uebersicht');
  const [plattform, setPlattform] = useState('');
  const [suche, setSuche] = useState('');
  const videos = useMemo(
    () => (r.daten?.videos ?? []).filter((v) => (!plattform || v.plattform === plattform) && (!suche || `${v.titel} ${v.thema} ${v.format} ${v.hook}`.toLowerCase().includes(suche.toLowerCase()))),
    [r.daten, plattform, suche],
  );
  return (
    <div className="page">
      <PageHeader eyebrow="Analytics" title="Videos" subtitle="Alle Videos, Reels und Streams mit ihren aktuellen Werten." />
      {r.fehler ? <ErrorBox error={r.fehler} onRetry={() => void r.laden()} /> : null}
      {!r.daten && !r.fehler && <Loading />}
      {r.daten && (
        <>
          <BeispielBand an={r.daten.beispiel} />
          <div className="filters">
            <Field label="Kanal">
              <select value={plattform} onChange={(e) => setPlattform(e.target.value)}>
                <option value="">Alle</option>
                {[...new Set(r.daten.videos.map((v) => v.plattform))].map((p) => (
                  <option key={p} value={p}>
                    {PLATTFORM_LABEL[p] ?? p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Suche">
              <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Titel oder Merkmal" />
            </Field>
          </div>
          <VideoTabelle videos={videos} titel={`${videos.length} Videos`} />
        </>
      )}
    </div>
  );
}

export function VideoTabelle({ videos, titel }: { videos: Video[]; titel: string }) {
  return (
    <Card title={titel}>
      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr>
              <th>Video</th>
              <th>Kanal</th>
              <th>Datum</th>
              <th>Aufrufe</th>
              <th>Likes</th>
              <th>Kommentare</th>
              <th>Shares</th>
              <th>Ø Ansehdauer</th>
              <th>Interaktion</th>
              <th>Merkmale</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v) => (
              <tr key={v.id}>
                <td>
                  {v.url ? (
                    <a href={v.url} target="_blank" rel="noreferrer">
                      {v.titel || 'Ohne Titel'}
                    </a>
                  ) : (
                    v.titel || 'Ohne Titel'
                  )}
                  {v.beispiel && <span className="muted small"> · Beispiel</span>}
                </td>
                <td>{PLATTFORM_LABEL[v.plattform] ?? v.plattform}</td>
                <td>{datum(v.veroeffentlicht_am)}</td>
                <td>{zahlText(v.aufrufe)}</td>
                <td>{zahlText(v.likes)}</td>
                <td>{zahlText(v.kommentare)}</td>
                <td>{zahlText(v.shares)}</td>
                <td>{v.durchschnitt_s === null ? '–' : `${Math.round(v.durchschnitt_s)} s`}</td>
                <td>{prozent(v.interaktionsrate)}</td>
                <td className="small">{[v.thema, v.format, v.hook].filter(Boolean).join(' · ') || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
