import { useState } from 'react';
import { Card, ErrorBox, Field, Loading, PageHeader } from '../../components/ui';
import { useCrm } from '../../data/CrmContext';
import { darfEinrichten } from '../../data/instanz';
import { useBaustein, useInstanz } from '../api';
import { BeispielBand, CsvFeld, useAktion, useCreatorApi, useLaden } from './gemeinsam';
import { datum, PLATTFORM_LABEL, type Konto, type Video } from './typen';

interface KanalDaten {
  konten: Konto[];
  einrichtung: Record<string, string[]>;
  studio_felder: string[];
}

const STATUS: Record<Konto['status'], string> = { beispiel: 'Beispielzahlen', verbunden: 'Verbunden', fehler: 'Fehler beim Abruf', getrennt: 'Getrennt' };

/**
 * Punkt 13–16: connect Instagram, YouTube, TikTok (and Twitch) through the official interfaces. Noel signs in once per
 * channel himself; the hub never sees passwords. Plus the TikTok-Studio export for deeper values.
 */
export function AnalyticsKanaele() {
  const r = useLaden<KanalDaten>('/c/analytics/kanaele');
  const api = useCreatorApi();
  const instanz = useInstanz();
  const twitch = useBaustein('twitch');
  const aktion = useAktion();
  const admin = darfEinrichten(instanz.rolle);
  const plattformen = ['instagram', 'youtube', 'tiktok', ...(twitch ? ['twitch'] : [])];

  const verbinden = (plattform: string) =>
    aktion.run(async () => {
      const { url } = await api.post<{ url: string }>('/c/analytics/verbinden', { plattform });
      window.location.href = url;
    });

  return (
    <div className="page">
      <PageHeader eyebrow="Analytics" title="Kanäle" subtitle="Ein kleiner Dienst holt die Zahlen jeden Tag über die offiziellen Schnittstellen ab, ohne Crawler und ohne eure Passwörter." />
      {r.fehler ? <ErrorBox error={r.fehler} onRetry={() => void r.laden()} /> : null}
      {!r.daten && !r.fehler && <Loading />}
      {r.daten && (
        <>
          <BeispielBand an={r.daten.konten.some((k) => k.beispiel)} />
          <Card
            title="Verbundene Kanäle"
            actions={
              admin && (
                <button type="button" className="button small" disabled={aktion.busy} onClick={() => void aktion.run(async () => (await api.post('/c/analytics/abrufen'), await r.laden()), 'Zahlen abgerufen')}>
                  Jetzt abrufen
                </button>
              )
            }
          >
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Kanal</th>
                    <th>Status</th>
                    <th>Letzter Abruf</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {plattformen.map((p) => {
                    const konten = r.daten!.konten.filter((k) => k.plattform === p);
                    const fehlt = r.daten!.einrichtung[p] ?? [];
                    const echt = konten.find((k) => !k.beispiel);
                    return (
                      <tr key={p}>
                        <td>
                          <strong>{PLATTFORM_LABEL[p]}</strong> {echt ? echt.handle || echt.name : ''}
                          {p === 'instagram' && <p className="muted small">Muss ein Business- oder Creator-Konto sein.</p>}
                          {p === 'tiktok' && <p className="muted small">Die Schnittstelle liefert Aufrufe, Likes, Kommentare und Shares je Video; Wiedergabedauer kommt aus dem Studio-Export unten.</p>}
                        </td>
                        <td>
                          {echt ? STATUS[echt.status] : konten.length ? STATUS.beispiel : 'Nicht verbunden'}
                          {echt?.fehler && <p className="small alert error">{echt.fehler}</p>}
                        </td>
                        <td>{datum(echt?.letzte_abholung)}</td>
                        <td>
                          {admin && fehlt.length > 0 ? (
                            <span className="muted small">Noch nicht eingerichtet: {fehlt.join(', ')}</span>
                          ) : (
                            admin && (
                              <div className="filters">
                                <button type="button" className="button small primary" disabled={aktion.busy} onClick={() => void verbinden(p)}>
                                  {echt && echt.status !== 'getrennt' ? 'Neu verbinden' : 'Verbinden'}
                                </button>
                                {echt && echt.status !== 'getrennt' && (
                                  <button
                                    type="button"
                                    className="button small"
                                    disabled={aktion.busy}
                                    onClick={() => window.confirm(`${PLATTFORM_LABEL[p]} wirklich trennen? Die bisherigen Zahlen bleiben.`) && void aktion.run(async () => (await api.post('/c/analytics/trennen', { id: echt.id }), await r.laden()), 'Getrennt')}
                                  >
                                    Trennen
                                  </button>
                                )}
                              </div>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!admin && <p className="muted small">Kanäle verbinden und trennen können Admins.</p>}
            {admin && r.daten.konten.length === 0 && (
              <button type="button" className="button small" disabled={aktion.busy} onClick={() => void aktion.run(async () => (await api.post('/c/analytics/beispiele'), await r.laden()), 'Beispielzahlen eingespielt')}>
                Beispielzahlen einspielen
              </button>
            )}
            {aktion.feedback}
          </Card>
          {admin && <StudioImport felder={r.daten.studio_felder} />}
        </>
      )}
    </div>
  );
}

interface StudioVorschau {
  zuordnung: Record<string, string>;
  spalten: string[];
  zeilen: { nr: number; video_id: string; extern_id: string; datum: string; werte: Record<string, number | null>; fehler: string[] }[];
  gueltig: boolean;
}

/** Punkt 15: deeper TikTok values (watch time, completion) from the export in TikTok Studio. */
function StudioImport({ felder }: { felder: string[] }) {
  const api = useCreatorApi();
  const aktion = useAktion();
  const [csv, setCsv] = useState('');
  const [stichtag, setStichtag] = useState(new Date().toISOString().slice(0, 10));
  const [zuordnung, setZuordnung] = useState<Record<string, string>>({});
  const [vorschau, setVorschau] = useState<StudioVorschau | null>(null);
  const pruefen = (z = zuordnung) =>
    aktion.run(async () => {
      const v = await api.post<StudioVorschau>('/c/analytics/studio/vorschau', { csv, stichtag, zuordnung: z });
      setVorschau(v);
      setZuordnung(v.zuordnung);
    }, 'Vorschau erstellt');

  return (
    <Card title="TikTok-Studio-Export einlesen" className="analytics-import">
      <p className="small">In TikTok Studio die Video-Statistik als CSV exportieren und hier einlesen. Die Spalten werden automatisch erkannt; wo nicht, ordnet ihr sie zu.</p>
      <CsvFeld
        wert={csv}
        setze={(t) => {
          setCsv(t);
          setVorschau(null);
        }}
      />
      <Field label="Stichtag des Exports (wenn die Datei kein Datum enthält)">
        <input type="date" value={stichtag} onChange={(e) => setStichtag(e.target.value)} />
      </Field>
      <div className="form-actions">
        <button type="button" className="button" disabled={!csv.trim() || aktion.busy} onClick={() => void pruefen()}>
          Vorschau prüfen
        </button>
        <button
          type="button"
          className="button primary"
          disabled={!vorschau?.gueltig || aktion.busy}
          onClick={() => void aktion.run(async () => (await api.post('/c/analytics/studio/import', { csv, stichtag, zuordnung }), setCsv(''), setVorschau(null)), 'Export importiert')}
        >
          Geprüfte Werte importieren
        </button>
      </div>
      {aktion.feedback}
      {vorschau && (
        <>
          <div className="analytics-zuordnung">
            {felder.map((f) => (
              <Field key={f} label={f}>
                <select
                  value={zuordnung[f] ?? ''}
                  onChange={(e) => {
                    const z = { ...zuordnung, [f]: e.target.value };
                    setZuordnung(z);
                    void pruefen(z);
                  }}
                >
                  <option value="">nicht zugeordnet</option>
                  {vorschau.spalten.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <div className="analytics-vorschau">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Zeile</th>
                  <th>Video</th>
                  <th>Datum</th>
                  <th>Aufrufe</th>
                  <th>Fehler</th>
                </tr>
              </thead>
              <tbody>
                {vorschau.zeilen.map((z) => (
                  <tr key={z.nr} className={z.fehler.length ? 'analytics-zeile-fehler' : undefined}>
                    <td>{z.nr}</td>
                    <td>{z.extern_id}</td>
                    <td>{z.datum}</td>
                    <td>{z.werte.aufrufe ?? '–'}</td>
                    <td className="small">{z.fehler.join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

interface TwitchDaten {
  videos: Video[];
  vorschlaege: { id: string; video_id: string; start_s: number; ende_s: number; titel: string; begruendung: string; ziel: string; status: string }[];
  boards: { id: string; titel: string }[];
}

const zeitText = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/** Punkt 12: after a stream, clip spots from markers and viewer clips, straight to the cutter as a task. */
export function AnalyticsTwitch() {
  const r = useLaden<TwitchDaten>('/c/analytics/twitch');
  const api = useCreatorApi();
  const { db } = useCrm();
  const aktion = useAktion();
  const [board, setBoard] = useState('');
  const [person, setPerson] = useState('');

  return (
    <div className="page">
      <PageHeader eyebrow="Analytics" title="Twitch" subtitle="Nach dem Stream Vorschläge für Clip-Stellen, die direkt als Aufgabe an den Schnitt gehen." />
      {r.fehler ? <ErrorBox error={r.fehler} onRetry={() => void r.laden()} /> : null}
      {!r.daten && !r.fehler && <Loading />}
      {r.daten && (
        <>
          {r.daten.videos.length === 0 && <p className="muted">Noch keine Streams. Verbindet Twitch unter „Kanäle“.</p>}
          {r.daten.boards.length > 0 && (
            <div className="filters">
              <Field label="Aufgaben auf Board">
                <select value={board} onChange={(e) => setBoard(e.target.value)}>
                  <option value="">Board wählen</option>
                  {r.daten.boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.titel}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Für">
                <select value={person} onChange={(e) => setPerson(e.target.value)}>
                  <option value="">Person wählen</option>
                  {(db?.listen.team ?? []).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          {r.daten.videos.map((v) => {
            const vorschlaege = r.daten!.vorschlaege.filter((c) => c.video_id === v.id);
            return (
              <Card
                key={v.id}
                title={`${v.titel || 'Stream'} · ${datum(v.veroeffentlicht_am)}`}
                actions={
                  <button
                    type="button"
                    className="button small"
                    disabled={aktion.busy}
                    onClick={() => void aktion.run(async () => (await api.post('/c/analytics/twitch/vorschlagen', { video_id: v.id }), await r.laden()), 'Clip-Stellen vorgeschlagen')}
                  >
                    Clip-Stellen vorschlagen
                  </button>
                }
              >
                {vorschlaege.length === 0 && <p className="muted small">Noch keine Vorschläge.</p>}
                <ul className="liste-schlicht">
                  {vorschlaege.map((c) => (
                    <li key={c.id}>
                      <strong>
                        {zeitText(c.start_s)}–{zeitText(c.ende_s)} {c.titel}
                      </strong>{' '}
                      <span className="muted small">
                        · für {PLATTFORM_LABEL[c.ziel] ?? c.ziel} · {c.status}
                      </span>
                      <p className="small">{c.begruendung}</p>
                      {c.status === 'vorschlag' && (
                        <div className="filters">
                          <button
                            type="button"
                            className="button small primary"
                            disabled={!board || !person || aktion.busy}
                            onClick={() => void aktion.run(async () => (await api.post('/c/analytics/twitch/aufgabe', { id: c.id, board_id: board, zustaendig: person }), await r.laden()), 'Aufgabe angelegt')}
                          >
                            Als Aufgabe an den Schnitt
                          </button>
                          <button type="button" className="button small" disabled={aktion.busy} onClick={() => void aktion.run(async () => (await api.post('/c/analytics/twitch/verwerfen', { id: c.id }), await r.laden()), 'Verworfen')}>
                            Verwerfen
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
          {aktion.feedback}
        </>
      )}
    </div>
  );
}
