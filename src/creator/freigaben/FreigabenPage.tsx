import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../components/Toasts';
import { Card, ErrorBox, FormError, Loading, PageHeader } from '../../components/ui';
import { useCreatorApi, useInstanz } from '../api';
import { STATUS_TEXT, type Freigabe } from './typen';

const datum = (iso: string) => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '');

/** All approvals: what waits for me (decide with one click), what I asked for, and – for admins – everything. */
export function FreigabenPage() {
  const api = useCreatorApi();
  const instanz = useInstanz();
  const { show } = useToast();
  const [liste, setListe] = useState<Freigabe[] | null>(null);
  const [fehler, setFehler] = useState<unknown>();
  const [kommentare, setKommentare] = useState<Record<string, string>>({});
  const ich = instanz.person;

  const laden = useCallback(async () => {
    try {
      setListe((await api.get<{ freigaben: Freigabe[] }>('/c/freigaben')).freigaben);
      setFehler(undefined);
    } catch (err) {
      setFehler(err);
    }
  }, [api]);
  useEffect(() => void laden(), [laden]);

  const entscheiden = async (f: Freigabe, status: 'freigegeben' | 'abgelehnt') => {
    setFehler(undefined);
    try {
      await api.post('/c/freigaben/entscheiden', { id: f.id, status, kommentar: kommentare[f.id] ?? '' });
      show(status === 'freigegeben' ? 'Freigegeben' : 'Abgelehnt');
      await laden();
    } catch (err) {
      setFehler(err);
    }
  };

  const fuerMich = (liste ?? []).filter((f) => f.status === 'offen' && f.freigeber === ich);
  const rest = (liste ?? []).filter((f) => !fuerMich.includes(f));

  return (
    <div className="page">
      <PageHeader eyebrow="Rollen und Freigaben" title="Freigaben" subtitle="Was auf deine Entscheidung wartet und was du angefragt hast." />
      {!liste && !fehler && <Loading />}
      {fehler && !liste ? <ErrorBox error={fehler} onRetry={() => void laden()} /> : null}
      {liste && (
        <>
          <Card title={`Wartet auf dich (${fuerMich.length})`}>
            {fuerMich.length === 0 && <p className="muted">Nichts offen.</p>}
            <ul className="liste-schlicht">
              {fuerMich.map((f) => (
                <li key={f.id}>
                  <div>
                    {f.link ? <Link to={f.link}>{f.titel}</Link> : f.titel} <span className="muted small">· von {f.angefragt_von}, {datum(f.angefragt_am)}</span>
                  </div>
                  {f.notiz && <p className="small">{f.notiz}</p>}
                  <div className="filters">
                    <input
                      value={kommentare[f.id] ?? ''}
                      onChange={(e) => setKommentare((k) => ({ ...k, [f.id]: e.target.value }))}
                      placeholder="Kommentar (bei Ablehnung Pflicht)"
                      aria-label={`Kommentar zu ${f.titel}`}
                    />
                    <button type="button" className="button primary small" onClick={() => void entscheiden(f, 'freigegeben')}>
                      Freigeben
                    </button>
                    <button type="button" className="button small" onClick={() => void entscheiden(f, 'abgelehnt')}>
                      Ablehnen
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <FormError error={fehler} />
          </Card>
          <Card title="Alle Freigaben">
            {rest.length === 0 && <p className="muted">Noch keine.</p>}
            <div className="table-wrap">
              <table className="table compact">
                <tbody>
                  {rest.map((f) => (
                    <tr key={f.id}>
                      <td>{f.link ? <Link to={f.link}>{f.titel}</Link> : f.titel}</td>
                      <td className="small">{STATUS_TEXT[f.status]}</td>
                      <td className="small">gibt frei: {f.freigeber}</td>
                      <td className="small">{f.kommentar}</td>
                      <td className="small">{datum(f.entschieden_am || f.angefragt_am)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
