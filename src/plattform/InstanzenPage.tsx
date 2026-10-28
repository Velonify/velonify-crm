import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Schalter } from '../components/Schalter';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, Field, FormError, Loading, PageHeader } from '../components/ui';
import { config } from '../config';
import { BAUSTEINE, type BausteinId } from '../data/instanz';
import type { InstanzCommit, InstanzLauf, InstanzNeuigkeit, InstanzProtokoll, InstanzStatus, PlattformInstanz } from '../data/plattform';
import { anfrage } from './api';

/**
 * Admin tool "Plattform" → Instanzen (Bauplan Abschnitt 3): own hubs of customers with their own project and database.
 * Velonify sees only metadata (version, logins, channel status, KI usage), switches building blocks, posts news and rolls
 * out updates (tag + workflow instanz.yml in the instance's repo). Contents of an instance never reach this page.
 */

interface Stand {
  status: InstanzStatus | null;
  fehler: string;
  tag: string;
}

function useAdmin() {
  const { getToken } = useAuth();
  return useMemo(
    () => ({
      get: <T,>(pfad: string) => anfrage<T>(getToken, config.crmApiUrl, pfad),
      post: <T,>(pfad: string, body: unknown) => anfrage<T>(getToken, config.crmApiUrl, pfad, body),
    }),
    [getToken],
  );
}

const zeit = (iso: string | undefined) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');
const kurzSha = (sha: string) => (sha ? sha.slice(0, 7) : 'unbekannt');

export function InstanzenPage() {
  const api = useAdmin();
  const { show } = useToast();
  const [daten, setDaten] = useState<{ instanzen: ({ instanz: PlattformInstanz } & Stand)[]; github: boolean; tokens_fehler: string } | null>(null);
  const [fehler, setFehler] = useState<unknown>();
  const [neu, setNeu] = useState({ kennung: '', name: '', domain: '', api_url: '', repo: '' });

  const laden = useCallback(async () => {
    try {
      setDaten(await api.get('/plattform/instanzen'));
      setFehler(undefined);
    } catch (err) {
      setFehler(err);
    }
  }, [api]);
  useEffect(() => void laden(), [laden]);

  return (
    <div className="page">
      <PageHeader eyebrow="Plattform" title="Instanzen" subtitle="Eigene Hubs mit eigenem Projekt und eigener Datenbank. Hier steht nur, was die Instanz über sich meldet, nie ihre Inhalte." />
      {fehler && !daten ? <ErrorBox error={fehler} onRetry={() => void laden()} /> : null}
      {!daten && !fehler && <Loading />}
      {daten && (
        <>
          {daten.tokens_fehler && <p className="alert error">{daten.tokens_fehler}</p>}
          {!daten.github && <p className="alert">GITHUB_TOKEN_INSTANZEN fehlt: Status geht, Updates ausrollen nicht.</p>}
          <Card title="Alle Instanzen">
            {daten.instanzen.length === 0 && <p className="muted">Noch keine Instanz angelegt.</p>}
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Instanz</th>
                    <th>Version</th>
                    <th>Zugänge</th>
                    <th>Kanäle</th>
                    <th>KI diesen Monat</th>
                    <th>Stand</th>
                  </tr>
                </thead>
                <tbody>
                  {daten.instanzen.map(({ instanz, status, fehler: f, tag }) => (
                    <tr key={instanz.kennung} className={instanz.aktiv ? undefined : 'is-archiviert'}>
                      <td>
                        <Link to={`/plattform/instanzen/${instanz.kennung}`}>{instanz.name}</Link>
                        <p className="muted small">{instanz.domain}</p>
                      </td>
                      <td className="small">{status ? tag || kurzSha(status.version) : '–'}</td>
                      <td className="small">{status ? `${status.zugaenge.aktiv} aktiv · ${status.zugaenge.aktiv_7_tage} in 7 Tagen` : '–'}</td>
                      <td className="small">{status ? status.kanaele.map((k) => `${k.plattform}: ${k.beispiel ? 'Beispiel' : k.status}`).join(', ') || '–' : '–'}</td>
                      <td className="small">{status ? `${status.ki.aufrufe} Aufrufe` : '–'}</td>
                      <td className="small">{f ? <span className="alert error">{f}</span> : zeit(status?.stand)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Instanz eintragen">
            <p className="muted small">Erst nach der Einrichtung laut INSTANZ.md eintragen. Das Steuer-Token kommt aus dem Secret INSTANZ_STEUER_TOKENS, nicht von hier.</p>
            <div className="filters">
              {(
                [
                  ['kennung', 'Kennung (z. B. beispiel)'],
                  ['name', 'Name'],
                  ['domain', 'Domain'],
                  ['api_url', 'API-URL (https)'],
                  ['repo', 'Repo (Velonify/velonify-hub-…)'],
                ] as const
              ).map(([f, label]) => (
                <input key={f} value={neu[f]} onChange={(e) => setNeu((n) => ({ ...n, [f]: e.target.value }))} placeholder={label} aria-label={label} />
              ))}
              <button
                type="button"
                className="button primary small"
                disabled={!neu.kennung || !neu.name}
                onClick={() =>
                  void api
                    .post('/plattform/instanz', neu)
                    .then(() => (show('Instanz eingetragen'), setNeu({ kennung: '', name: '', domain: '', api_url: '', repo: '' }), laden()))
                    .catch(setFehler)
                }
              >
                Eintragen
              </button>
            </div>
            <FormError error={fehler} />
          </Card>
        </>
      )}
    </div>
  );
}

interface Detail extends Stand {
  instanz: PlattformInstanz;
  neuigkeiten: InstanzNeuigkeit[];
  protokoll: InstanzProtokoll[];
  github: boolean;
  token: boolean;
}

export function InstanzPage() {
  const { kennung = '' } = useParams();
  const api = useAdmin();
  const { show } = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [fehler, setFehler] = useState<unknown>();
  const [commits, setCommits] = useState<{ version: string; tag: string; branch: string; commits: InstanzCommit[]; ziel: string | null; zurueck: number; url: string } | null>(null);
  const [laeufe, setLaeufe] = useState<InstanzLauf[] | null>(null);
  const [nachricht, setNachricht] = useState({ titel: '', text: '', link: '' });
  const [busy, setBusy] = useState(false);
  const q = `kennung=${encodeURIComponent(kennung)}`;

  const laden = useCallback(async () => {
    try {
      setD(await api.get<Detail>(`/plattform/instanz?${q}`));
      setFehler(undefined);
    } catch (err) {
      setFehler(err);
    }
  }, [api, q]);
  useEffect(() => void laden(), [laden]);

  const los = async (arbeit: () => Promise<unknown>, meldung: string) => {
    setBusy(true);
    setFehler(undefined);
    try {
      await arbeit();
      show(meldung);
      await laden();
    } catch (err) {
      setFehler(err);
    } finally {
      setBusy(false);
    }
  };

  const status = d?.status;
  const bausteine = new Set(status?.bausteine ?? []);

  return (
    <div className="page">
      {!d && !fehler && <Loading />}
      {fehler && !d ? <ErrorBox error={fehler} onRetry={() => void laden()} /> : null}
      {d && (
        <>
          <PageHeader eyebrow="Instanz" title={d.instanz.name} subtitle={`${d.instanz.domain} · ${d.instanz.repo}`} />
          {!d.token && <p className="alert error">Für diese Instanz fehlt das Steuer-Token in INSTANZ_STEUER_TOKENS.</p>}
          {d.fehler && <p className="alert error">Die Instanz antwortet nicht: {d.fehler}</p>}
          <FormError error={fehler} />
          {status && (
            <Card title="Status">
              <ul className="liste-schlicht small">
                <li>Version: {d.tag || kurzSha(status.version)}</li>
                <li>
                  Zugänge: {status.zugaenge.aktiv} aktiv, {status.zugaenge.aktiv_7_tage} in den letzten 7 Tagen, letzter Login {zeit(status.zugaenge.letzter_login)}
                </li>
                <li>Velonify-Zugang: {status.velonify_zugang ? 'an' : 'von der Instanz abgeschaltet'}</li>
                <li>
                  KI {status.ki.monat}: {status.ki.aufrufe} Aufrufe, {status.ki.tokens_ein.toLocaleString('de-DE')} Tokens ein, {status.ki.tokens_aus.toLocaleString('de-DE')} aus
                </li>
                <li>Datenbank: {(status.speicher.datenbank_bytes / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB</li>
                {status.kanaele.map((k) => (
                  <li key={k.plattform}>
                    {k.plattform}: {k.beispiel ? 'Beispielzahlen' : k.status}, letzter Abruf {zeit(k.letzte_abholung)}
                    {k.fehler && <span className="alert error"> {k.fehler}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {status && (
            <Card title="Bausteine">
              {[...new Set(BAUSTEINE.map((b) => b.bereich))].map((bereich) => (
                <section key={bereich}>
                  <p className="small">
                    <strong>{bereich}</strong>
                  </p>
                  <ul className="liste-schlicht">
                    {BAUSTEINE.filter((b) => b.bereich === bereich).map((b) => (
                      <li key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>
                          {b.label}
                          {b.start && <span className="muted small"> · Start-Umfang</span>}
                        </span>
                        <Schalter
                          an={bausteine.has(b.id)}
                          disabled={busy}
                          label={`Baustein ${b.label}`}
                          onChange={(an) => void los(() => api.post('/plattform/instanz/bausteine', { kennung, bausteine: { [b.id as BausteinId]: an } }), 'Baustein gespeichert')}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </Card>
          )}
          <Card
            title="Update ausrollen"
            actions={
              <button type="button" className="button small" disabled={busy} onClick={() => void api.get<NonNullable<typeof commits>>(`/plattform/instanz/commits?${q}`).then(setCommits, setFehler)}>
                Änderungen laden
              </button>
            }
          >
            {commits && (
              <>
                <p className="small">
                  Läuft: {commits.tag || kurzSha(commits.version)} · Neu auf {commits.branch}: {commits.commits.length} Commits
                  {commits.zurueck > 0 && ` · Achtung: die Instanz hat ${commits.zurueck} Commits, die auf ${commits.branch} fehlen`}
                </p>
                <ul className="liste-schlicht small">
                  {commits.commits.map((c) => (
                    <li key={c.sha}>
                      <a href={c.url} target="_blank" rel="noreferrer">
                        {kurzSha(c.sha)}
                      </a>{' '}
                      {c.titel} <span className="muted">· {c.autor}, {zeit(c.am)}</span>
                    </li>
                  ))}
                </ul>
                {commits.ziel && (
                  <button
                    type="button"
                    className="button primary"
                    disabled={busy || !d.github}
                    onClick={() =>
                      window.confirm(`${commits.commits.length} Änderungen an ${d.instanz.name} ausrollen? Migrationen, crm-api und Oberfläche werden neu gebaut.`) &&
                      void los(() => api.post('/plattform/instanz/ausrollen', { kennung, sha: commits.ziel }), 'Update gestartet')
                    }
                  >
                    Diese {commits.commits.length} Änderungen ausrollen
                  </button>
                )}
                {!commits.ziel && <p className="muted">Die Instanz ist auf dem neuesten Stand.</p>}
              </>
            )}
            <div className="form-actions">
              <button type="button" className="button small" onClick={() => void api.get<{ laeufe: InstanzLauf[] }>(`/plattform/instanz/laeufe?${q}`).then((x) => setLaeufe(x.laeufe), setFehler)}>
                Letzte Läufe anzeigen
              </button>
            </div>
            {laeufe && (
              <ul className="liste-schlicht small">
                {laeufe.map((l) => (
                  <li key={l.id}>
                    <a href={l.url} target="_blank" rel="noreferrer">
                      {zeit(l.am)}
                    </a>{' '}
                    · {l.status}
                    {l.ergebnis ? ` · ${l.ergebnis}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Neu im Hub">
            <ul className="liste-schlicht small">
              {d.neuigkeiten.map((n) => (
                <li key={n.id}>
                  <strong>{n.titel}</strong> · {zeit(n.am)} {n.archiviert && '· zurückgezogen'}
                  {!n.archiviert && (
                    <button type="button" className="button small" disabled={busy} onClick={() => void los(() => api.post('/plattform/instanz/neuigkeit/archivieren', { kennung, id: n.id }), 'Zurückgezogen')}>
                      Zurückziehen
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <Field label="Titel">
              <input value={nachricht.titel} onChange={(e) => setNachricht((m) => ({ ...m, titel: e.target.value }))} />
            </Field>
            <Field label="Text">
              <textarea rows={3} value={nachricht.text} onChange={(e) => setNachricht((m) => ({ ...m, text: e.target.value }))} />
            </Field>
            <Field label="Link im Hub (optional, z. B. /analytics)">
              <input value={nachricht.link} onChange={(e) => setNachricht((m) => ({ ...m, link: e.target.value }))} />
            </Field>
            <button
              type="button"
              className="button primary small"
              disabled={busy || !nachricht.titel.trim()}
              onClick={() => void los(() => api.post('/plattform/instanz/neuigkeit', { kennung, ...nachricht }).then(() => setNachricht({ titel: '', text: '', link: '' })), 'Neuigkeit veröffentlicht')}
            >
              Veröffentlichen
            </button>
          </Card>
          <Card title="Protokoll">
            <ul className="liste-schlicht small">
              {d.protokoll.map((p, i) => (
                <li key={i}>
                  {zeit(p.am)} · {p.von} · {p.art}: {JSON.stringify(p.detail)}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
