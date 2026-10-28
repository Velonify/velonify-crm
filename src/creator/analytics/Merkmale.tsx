import { useState } from 'react';
import { Card, ErrorBox, Field, Loading, PageHeader } from '../../components/ui';
import { darfEinrichten } from '../../data/instanz';
import { useInstanz } from '../api';
import { BeispielBand, MerkmalVergleich, useAktion, useCreatorApi, useLaden } from './gemeinsam';
import { PLATTFORM_LABEL, type Vergleich, type Video } from './typen';

interface MerkmalDaten {
  listen: { art: string; wert: string }[];
  videos: Video[];
  vergleich: Vergleich[];
}

const ARTEN = [
  { art: 'thema', label: 'Thema' },
  { art: 'format', label: 'Format' },
  { art: 'hook', label: 'Hook' },
] as const;

/** Punkt 17: every video gets topic, format and hook; Claude suggests from the maintained lists, the team confirms. */
export function AnalyticsMerkmale() {
  const r = useLaden<MerkmalDaten>('/c/analytics/merkmale');
  const api = useCreatorApi();
  const instanz = useInstanz();
  const aktion = useAktion();
  const [neu, setNeu] = useState<Record<string, string>>({});
  const [nurOffen, setNurOffen] = useState(true);
  const admin = darfEinrichten(instanz.rolle);
  const neuLaden = () => r.laden();

  return (
    <div className="page">
      <PageHeader eyebrow="Analytics" title="Merkmale je Video" subtitle="Thema, Format und Hook je Video: nach wenigen Wochen wird sichtbar, was funktioniert." />
      {r.fehler ? <ErrorBox error={r.fehler} onRetry={() => void r.laden()} /> : null}
      {!r.daten && !r.fehler && <Loading />}
      {r.daten && (
        <>
          <BeispielBand an={r.daten.videos.some((v) => v.beispiel)} />
          <Card title="Vergleich nach Merkmal">
            <MerkmalVergleich vergleich={r.daten.vergleich} />
          </Card>

          <Card
            title="Videos einordnen"
            actions={
              <button
                type="button"
                className="button small"
                disabled={aktion.busy}
                onClick={() => void aktion.run(async () => (await api.post('/c/analytics/merkmale/vorschlagen'), await neuLaden()), 'Vorschläge von Claude eingetragen')}
              >
                Claude vorschlagen lassen
              </button>
            }
          >
            <label className="small">
              <input type="checkbox" checked={nurOffen} onChange={(e) => setNurOffen(e.target.checked)} /> Nur noch nicht bestätigte
            </label>
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Video</th>
                    {ARTEN.map((a) => (
                      <th key={a.art}>{a.label}</th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {r.daten.videos
                    .filter((v) => !nurOffen || !v.bestaetigt)
                    .slice(0, 100)
                    .map((v) => (
                      <MerkmalZeile key={v.id} video={v} listen={r.daten!.listen} gespeichert={neuLaden} />
                    ))}
                </tbody>
              </table>
            </div>
            {aktion.feedback}
          </Card>

          <Card title="Auswahllisten">
            <p className="muted small">Claude vergibt nur Werte aus diesen Listen. {admin ? '' : 'Pflegen können Admins.'}</p>
            <div className="analytics-vergleich">
              {ARTEN.map((a) => (
                <section key={a.art}>
                  <h3 className="small">{a.label}</h3>
                  <ul className="liste-schlicht small">
                    {r.daten!.listen
                      .filter((l) => l.art === a.art)
                      .map((l) => (
                        <li key={l.wert}>{l.wert}</li>
                      ))}
                  </ul>
                  {admin && (
                    <div className="filters">
                      <input value={neu[a.art] ?? ''} onChange={(e) => setNeu((n) => ({ ...n, [a.art]: e.target.value }))} placeholder={`Neues ${a.label}`} aria-label={`Neues ${a.label}`} />
                      <button
                        type="button"
                        className="button small"
                        disabled={!neu[a.art]?.trim()}
                        onClick={() => void aktion.run(async () => (await api.post('/c/analytics/merkmale/liste', { art: a.art, wert: neu[a.art] }), setNeu((n) => ({ ...n, [a.art]: '' })), await neuLaden()))}
                      >
                        Hinzufügen
                      </button>
                    </div>
                  )}
                </section>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function MerkmalZeile({ video, listen, gespeichert }: { video: Video; listen: { art: string; wert: string }[]; gespeichert(): Promise<void> }) {
  const api = useCreatorApi();
  const aktion = useAktion();
  const [werte, setWerte] = useState({ thema: video.thema, format: video.format, hook: video.hook });
  return (
    <tr>
      <td>
        {video.titel || 'Ohne Titel'} <span className="muted small">· {PLATTFORM_LABEL[video.plattform] ?? video.plattform}</span>
        {aktion.feedback}
      </td>
      {ARTEN.map((a) => (
        <td key={a.art}>
          <Field label={a.label}>
            <select value={werte[a.art]} onChange={(e) => setWerte((w) => ({ ...w, [a.art]: e.target.value }))}>
              <option value="">–</option>
              {listen
                .filter((l) => l.art === a.art)
                .map((l) => (
                  <option key={l.wert} value={l.wert}>
                    {l.wert}
                  </option>
                ))}
            </select>
          </Field>
        </td>
      ))}
      <td>
        <button
          type="button"
          className="button small"
          disabled={aktion.busy || !werte.thema || !werte.format || !werte.hook}
          onClick={() => void aktion.run(async () => (await api.post('/c/analytics/merkmale/speichern', { video_id: video.id, ...werte }), await gespeichert()), 'Bestätigt')}
        >
          {video.bestaetigt ? 'Speichern' : 'Bestätigen'}
        </button>
      </td>
    </tr>
  );
}
