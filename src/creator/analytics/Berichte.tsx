import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, ErrorBox, Field, Loading, PageHeader } from '../../components/ui';
import { FreigabeKnopf } from '../freigaben/FreigabeKnopf';
import { useBaustein } from '../api';
import { BeispielBand, MerkmalVergleich, useAktion, useCreatorApi, useLaden } from './gemeinsam';
import { VideoTabelle } from './Uebersicht';
import { datum, PLATTFORM_LABEL, zahlText, type Bericht } from './typen';

const TYP = { woche: 'Wochenbericht', monat: 'Monatsbericht' } as const;

/** Punkt 18: weekly and monthly report instead of five platform dashboards. */
export function AnalyticsBerichte() {
  const r = useLaden<{ berichte: Bericht[] }>('/c/analytics/berichte');
  const api = useCreatorApi();
  const aktion = useAktion();
  const erstellen = (typ: 'woche' | 'monat') => aktion.run(async () => (await api.post('/c/analytics/berichte/erstellen', { typ }), await r.laden()), 'Bericht erstellt');
  return (
    <div className="page">
      <PageHeader eyebrow="Analytics" title="Berichte" subtitle="Jeden Montag der Wochenbericht, am Monatsersten der Monatsbericht – als Entwurf, den ihr einschätzt und freigebt." />
      {r.fehler ? <ErrorBox error={r.fehler} onRetry={() => void r.laden()} /> : null}
      {!r.daten && !r.fehler && <Loading />}
      {r.daten && (
        <Card
          title="Alle Berichte"
          actions={
            <div className="filters">
              <button type="button" className="button small" disabled={aktion.busy} onClick={() => void erstellen('woche')}>
                Letzte Woche jetzt erstellen
              </button>
              <button type="button" className="button small" disabled={aktion.busy} onClick={() => void erstellen('monat')}>
                Letzten Monat jetzt erstellen
              </button>
            </div>
          }
        >
          {aktion.feedback}
          {r.daten.berichte.length === 0 && <p className="muted">Noch keine Berichte.</p>}
          <ul className="liste-schlicht">
            {r.daten.berichte.map((b) => (
              <li key={b.id}>
                <Link to={`/analytics/berichte/${b.id}`}>
                  {TYP[b.typ]} {datum(b.von)} – {datum(b.bis)}
                </Link>{' '}
                <span className="muted small">
                  · {b.status === 'freigegeben' ? `freigegeben von ${b.freigegeben_von}` : 'Entwurf'}
                  {b.beispiel ? ' · mit Beispielzahlen' : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export function AnalyticsBericht() {
  const { id = '' } = useParams();
  const r = useLaden<{ bericht: Bericht }>(`/c/analytics/berichte/${encodeURIComponent(id)}`);
  const api = useCreatorApi();
  const aktion = useAktion();
  const ableitungenAn = useBaustein('ableitungen');
  const [einschaetzung, setEinschaetzung] = useState<string | null>(null);
  const b = r.daten?.bericht;
  const text = einschaetzung ?? b?.einschaetzung ?? '';

  return (
    <div className="page">
      {r.fehler ? <ErrorBox error={r.fehler} onRetry={() => void r.laden()} /> : null}
      {!b && !r.fehler && <Loading />}
      {b && (
        <>
          <PageHeader eyebrow={b.status === 'freigegeben' ? 'Freigegeben' : 'Entwurf'} title={`${TYP[b.typ]} ${datum(b.von)} – ${datum(b.bis)}`} />
          <BeispielBand an={b.beispiel} />
          <div className="form-actions analytics-nicht-drucken">
            <Link to="/analytics/berichte" className="button small">
              Alle Berichte
            </Link>
            <button type="button" className="button small" onClick={() => window.print()}>
              Drucken / als PDF
            </button>
          </div>
          {b.inhalt.text && (
            <Card title="Zusammenfassung">
              {b.inhalt.text.split(/\n{2,}/).map((absatz, i) => (
                <p key={i}>{absatz}</p>
              ))}
              {b.inhalt.hinweis && <p className="muted small">{b.inhalt.hinweis}</p>}
            </Card>
          )}
          {b.inhalt.kanaele && (
            <Card title="Kanäle">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Kanal</th>
                    <th>Follower</th>
                    <th>Veränderung</th>
                    <th>Aufrufe im Zeitraum</th>
                    <th>Neue Videos</th>
                  </tr>
                </thead>
                <tbody>
                  {b.inhalt.kanaele.map((k) => (
                    <tr key={`${k.plattform}-${k.handle}`}>
                      <td>
                        {PLATTFORM_LABEL[k.plattform] ?? k.plattform} {k.handle}
                      </td>
                      <td>{zahlText(k.follower)}</td>
                      <td>{k.follower_delta === null ? '–' : `${k.follower_delta >= 0 ? '+' : ''}${zahlText(k.follower_delta)}`}</td>
                      <td>{zahlText(k.aufrufe)}</td>
                      <td>{k.videos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          {b.inhalt.tops && b.inhalt.tops.length > 0 && <VideoTabelle videos={b.inhalt.tops} titel="Tops" />}
          {b.inhalt.flops && b.inhalt.flops.length > 0 && <VideoTabelle videos={b.inhalt.flops} titel="Flops" />}
          {b.inhalt.merkmale && b.inhalt.merkmale.length > 0 && (
            <Card title="Merkmale im Zeitraum">
              <MerkmalVergleich vergleich={b.inhalt.merkmale} />
            </Card>
          )}

          {b.ableitungen.length > 0 && (
            <Card title="Ableitungen für den Content-Plan">
              <ul className="liste-schlicht">
                {b.ableitungen.map((a, index) => (
                  <li key={index}>
                    <strong>{a.titel}</strong> <span className="muted small">· {PLATTFORM_LABEL[a.kanal] ?? a.kanal} · {a.format}</span>
                    <p className="small">{a.begruendung}</p>
                    {a.inhalt_id ? (
                      <Link to={`/content/inhalte/${a.inhalt_id}`} className="small">
                        Im Content-Plan
                      </Link>
                    ) : (
                      ableitungenAn &&
                      b.status === 'freigegeben' && (
                        <button
                          type="button"
                          className="button small analytics-nicht-drucken"
                          disabled={aktion.busy}
                          onClick={() => void aktion.run(async () => (await api.post('/c/analytics/berichte/ableitung', { bericht_id: b.id, index }), await r.laden()), 'Im Content-Plan angelegt')}
                        >
                          In den Content-Plan
                        </button>
                      )
                    )}
                  </li>
                ))}
              </ul>
              {ableitungenAn && b.status !== 'freigegeben' && <p className="muted small">Vorschläge lassen sich übernehmen, sobald der Bericht freigegeben ist.</p>}
            </Card>
          )}

          <Card title="Einschätzung des Teams">
            <Field label="Was sagt ihr zu den Zahlen?">
              <textarea rows={5} value={text} onChange={(e) => setEinschaetzung(e.target.value)} disabled={b.status === 'freigegeben'} />
            </Field>
            {b.status !== 'freigegeben' && (
              <div className="form-actions analytics-nicht-drucken">
                <button
                  type="button"
                  className="button"
                  disabled={aktion.busy || !text.trim() || text === b.einschaetzung}
                  onClick={() => void aktion.run(async () => (await api.post('/c/analytics/berichte/einschaetzen', { id: b.id, einschaetzung: text }), setEinschaetzung(null), await r.laden()))}
                >
                  Einschätzung speichern
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={aktion.busy || !b.einschaetzung}
                  onClick={() => void aktion.run(async () => (await api.post('/c/analytics/berichte/freigeben', { id: b.id }), await r.laden()), 'Bericht freigegeben')}
                >
                  Bericht freigeben
                </button>
              </div>
            )}
            {b.einschaetzung && b.status !== 'freigegeben' && (
              <div className="analytics-nicht-drucken">
                <FreigabeKnopf objektTyp="bericht" objektId={b.id} titel={`${TYP[b.typ]} ${datum(b.von)}`} link={`/analytics/berichte/${b.id}`} bereich="content" />
              </div>
            )}
            {aktion.feedback}
          </Card>
        </>
      )}
    </div>
  );
}
