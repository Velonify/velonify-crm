import { useState } from 'react';
import { Card, ErrorBox, Loading, PageHeader } from '../../components/ui';
import { darfEinrichten } from '../../data/instanz';
import { useInstanz } from '../api';
import { CsvFeld, herunterladen, useAktion, useCreatorApi, useLaden } from './gemeinsam';
import { datum, PLATTFORM_LABEL, prozent, zahlText } from './typen';

interface BenchKanal {
  id: string;
  name: string;
  plattform: string;
  handle: string;
  notiz: string | null;
  fehler?: string | null;
}
interface BenchWert {
  kanal_id: string;
  datum: string;
  follower: number | null;
  beitraege: number | null;
  aufrufe_schnitt: number | null;
  interaktionen_schnitt: number | null;
  quelle: string;
  import_quelle: string | null;
}
interface BenchDaten {
  kanaele: BenchKanal[];
  werte: BenchWert[];
  zugang: { art: string; handle: string; verbunden_am: string; token_bis: string | null; fehler: string | null } | null;
  csv_felder: string[];
}
interface Vorschau {
  zeilen: { nr: number; plattform: string; handle: string; datum: string; werte: Record<string, number | null>; fehler: string[] }[];
  gueltig: boolean;
}

const QUELLE: Record<string, string> = { api: 'Schnittstelle', manuell: 'manuell' };
const VORLAGE = 'plattform,handle,name,datum,follower,beitraege,aufrufe_schnitt,interaktionen_schnitt\ninstagram,beispiel.creator,Beispiel Creator,2026-10-27,120000,350,45000,0.061\n';

/**
 * Punkt 19: similar creators by public numbers. YouTube through the Data API, Instagram through Business Discovery once
 * Facebook Login is connected, everything (TikTok always) also by hand or as a CSV prepared outside, e.g. with an AI.
 */
export function AnalyticsBenchmark() {
  const r = useLaden<BenchDaten>('/c/analytics/benchmark');
  const api = useCreatorApi();
  const instanz = useInstanz();
  const aktion = useAktion();
  const admin = darfEinrichten(instanz.rolle);
  const [kanal, setKanal] = useState({ plattform: 'instagram', handle: '', name: '' });
  const [wert, setWert] = useState({ kanal_id: '', datum: new Date().toISOString().slice(0, 10), follower: '', beitraege: '', aufrufe_schnitt: '', interaktionen_schnitt: '' });
  const [csv, setCsv] = useState('');
  const [vorschau, setVorschau] = useState<Vorschau | null>(null);

  const letzter = (id: string) => r.daten?.werte.find((w) => w.kanal_id === id);

  return (
    <div className="page">
      <PageHeader eyebrow="Analytics" title="Wettbewerbs-Benchmarking" subtitle="Regelmäßiger Vergleich mit ähnlichen Creatorn anhand öffentlicher Zahlen." />
      {r.fehler ? <ErrorBox error={r.fehler} onRetry={() => void r.laden()} /> : null}
      {!r.daten && !r.fehler && <Loading />}
      {r.daten && (
        <>
          <Card
            title="Vergleichskanäle"
            actions={
              <button type="button" className="button small" disabled={aktion.busy} onClick={() => void aktion.run(async () => (await api.post('/c/analytics/benchmark/abrufen'), await r.laden()), 'Öffentliche Zahlen abgerufen')}>
                Jetzt abrufen
              </button>
            }
          >
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Creator</th>
                    <th>Kanal</th>
                    <th>Follower</th>
                    <th>Beiträge</th>
                    <th>Ø Aufrufe</th>
                    <th>Ø Interaktion</th>
                    <th>Stand</th>
                    <th>Quelle</th>
                  </tr>
                </thead>
                <tbody>
                  {r.daten.kanaele.map((k) => {
                    const w = letzter(k.id);
                    return (
                      <tr key={k.id}>
                        <td>
                          {k.name}
                          {k.fehler && <p className="small alert error">{k.fehler}</p>}
                        </td>
                        <td>
                          {PLATTFORM_LABEL[k.plattform] ?? k.plattform} {k.handle}
                        </td>
                        <td>{zahlText(w?.follower)}</td>
                        <td>{zahlText(w?.beitraege)}</td>
                        <td>{zahlText(w?.aufrufe_schnitt)}</td>
                        <td>{prozent(w?.interaktionen_schnitt)}</td>
                        <td>{datum(w?.datum)}</td>
                        <td className="small">{w ? `${QUELLE[w.quelle] ?? w.quelle}${w.import_quelle === 'csv' ? ' (CSV)' : ''}` : '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="muted small">
              YouTube kommt über die offizielle Data API. Für TikTok gibt es keine offizielle öffentliche Schnittstelle, dort tragt ihr die Zahlen ein. Instagram geht über Facebook Login
              (Business Discovery) oder ebenfalls manuell.
            </p>
            <div className="filters">
              <select value={kanal.plattform} onChange={(e) => setKanal((k) => ({ ...k, plattform: e.target.value }))} aria-label="Plattform">
                {['instagram', 'tiktok', 'youtube', 'twitch'].map((p) => (
                  <option key={p} value={p}>
                    {PLATTFORM_LABEL[p]}
                  </option>
                ))}
              </select>
              <input value={kanal.handle} onChange={(e) => setKanal((k) => ({ ...k, handle: e.target.value }))} placeholder="Handle ohne URL" aria-label="Handle" />
              <input value={kanal.name} onChange={(e) => setKanal((k) => ({ ...k, name: e.target.value }))} placeholder="Name" aria-label="Name" />
              <button
                type="button"
                className="button small"
                disabled={!kanal.handle.trim()}
                onClick={() => void aktion.run(async () => (await api.post('/c/analytics/benchmark/kanal', kanal), setKanal((k) => ({ ...k, handle: '', name: '' })), await r.laden()), 'Kanal hinzugefügt')}
              >
                Kanal hinzufügen
              </button>
            </div>
            {aktion.feedback}
          </Card>

          <Card title="Instagram über Facebook Login">
            {r.daten.zugang ? (
              <p>
                Verbunden als {r.daten.zugang.handle} seit {datum(r.daten.zugang.verbunden_am)}.{r.daten.zugang.fehler && <span className="alert error"> {r.daten.zugang.fehler}</span>}
              </p>
            ) : (
              <p className="muted">Nicht verbunden. Instagram-Vergleiche funktionieren auch ohne, dann mit manuellen Zahlen oder CSV.</p>
            )}
            {admin && (
              <button
                type="button"
                className="button small"
                disabled={aktion.busy}
                onClick={() =>
                  void aktion.run(async () => {
                    const { url } = await api.post<{ url: string }>('/c/analytics/verbinden', { plattform: 'facebook' });
                    window.location.href = url;
                  })
                }
              >
                {r.daten.zugang ? 'Neu verbinden' : 'Mit Facebook verbinden'}
              </button>
            )}
          </Card>

          <Card title="Zahlen von Hand eintragen">
            <div className="filters">
              <select value={wert.kanal_id} onChange={(e) => setWert((w) => ({ ...w, kanal_id: e.target.value }))} aria-label="Vergleichskanal">
                <option value="">Kanal wählen</option>
                {r.daten.kanaele.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({PLATTFORM_LABEL[k.plattform] ?? k.plattform})
                  </option>
                ))}
              </select>
              <input type="date" value={wert.datum} onChange={(e) => setWert((w) => ({ ...w, datum: e.target.value }))} aria-label="Datum" />
              {(['follower', 'beitraege', 'aufrufe_schnitt', 'interaktionen_schnitt'] as const).map((f) => (
                <input key={f} inputMode="decimal" value={wert[f]} onChange={(e) => setWert((w) => ({ ...w, [f]: e.target.value }))} placeholder={{ follower: 'Follower', beitraege: 'Beiträge', aufrufe_schnitt: 'Ø Aufrufe', interaktionen_schnitt: 'Ø Interaktion (0–1)' }[f]} aria-label={f} />
              ))}
              <button
                type="button"
                className="button small"
                disabled={!wert.kanal_id}
                onClick={() => void aktion.run(async () => (await api.post('/c/analytics/benchmark/wert', { ...wert, interaktionen_schnitt: wert.interaktionen_schnitt.replace(',', '.') }), await r.laden()))}
              >
                Speichern
              </button>
            </div>
          </Card>

          <Card title="CSV importieren">
            <p className="small">
              Für viele Werte auf einmal, z. B. von einer KI aus Screenshots oder Notizen aufbereitet. Spalten: <code>{r.daten.csv_felder.join(', ')}</code>. Datum als JJJJ-MM-TT, Interaktion als Anteil (0,061) oder Prozent.
              Dieselbe Kombination aus Kanal und Datum wird beim erneuten Import aktualisiert, nicht doppelt angelegt.
            </p>
            <button type="button" className="button small" onClick={() => herunterladen('benchmark-vorlage.csv', VORLAGE)}>
              CSV-Vorlage laden
            </button>
            <CsvFeld
              wert={csv}
              setze={(t) => {
                setCsv(t);
                setVorschau(null);
              }}
            />
            <div className="form-actions">
              <button type="button" className="button" disabled={!csv.trim() || aktion.busy} onClick={() => void aktion.run(async () => setVorschau(await api.post<Vorschau>('/c/analytics/benchmark/vorschau', { csv })), 'Vorschau erstellt')}>
                Vorschau prüfen
              </button>
              <button
                type="button"
                className="button primary"
                disabled={!vorschau?.gueltig || aktion.busy}
                onClick={() => void aktion.run(async () => (await api.post('/c/analytics/benchmark/import', { csv }), setCsv(''), setVorschau(null), await r.laden()), 'Importiert')}
              >
                Geprüfte CSV importieren
              </button>
            </div>
            {vorschau && (
              <div className="analytics-vorschau">
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Zeile</th>
                      <th>Kanal</th>
                      <th>Datum</th>
                      <th>Follower</th>
                      <th>Fehler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vorschau.zeilen.map((z) => (
                      <tr key={z.nr} className={z.fehler.length ? 'analytics-zeile-fehler' : undefined}>
                        <td>{z.nr}</td>
                        <td>
                          {z.plattform} {z.handle}
                        </td>
                        <td>{z.datum}</td>
                        <td>{zahlText(z.werte.follower)}</td>
                        <td className="small">{z.fehler.join(' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
