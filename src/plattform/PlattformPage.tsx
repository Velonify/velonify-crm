import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toasts';
import { ErrorBox, Field, FormError, PageHeader } from '../components/ui';
import { PAKETE, type Paket } from '../data/plattform';
import type { MandantUebersicht } from '../data/postgres/plattformStore';
import { relativeDays } from '../lib/format';
import { PlattformAdminApi, type MarktStatistik } from './api';

/** Status as the team reads it: paying, in the trial, or what is left of access after it. */
const statusText = (u: MandantUebersicht) => (u.zugriff === 'voll' ? (u.mandant.status === 'aktiv' ? 'Zahlt' : 'Im Test') : u.zugriff === 'nur_lesen' ? 'Nur lesen' : 'Gesperrt');

export function useAdminApi() {
  const { getToken } = useAuth();
  return useMemo(() => new PlattformAdminApi(getToken), [getToken]);
}

/** Admin tool: every tester and customer of the hub with trial, usage, health and what needs a reaction. */
export function PlattformPage() {
  const api = useAdminApi();
  const navigate = useNavigate();
  const [daten, setDaten] = useState<{ mandanten: MandantUebersicht[]; markt: MarktStatistik } | null>(null);
  const [fehler, setFehler] = useState<unknown>(null);
  const [neu, setNeu] = useState(false);

  const laden = useCallback(async () => {
    try {
      setDaten(await api.mandanten());
      setFehler(null);
    } catch (err) {
      setFehler(err);
    }
  }, [api]);
  useEffect(() => void laden(), [laden]);

  const mandanten = daten?.mandanten ?? [];
  const tests = mandanten.filter((m) => m.mandant.status === 'test');
  return (
    <div className="page plattform">
      <PageHeader
        eyebrow="Velonify Hub"
        title="Mandanten"
        subtitle="Tester und Kunden des Hubs. Jeder Mandant hat eine eigene Datenbank; hier steht nur, wer hinein darf, was an ist und was genutzt wird."
        actions={
          <button type="button" className="button primary" onClick={() => setNeu(true)}>
            Mandant anlegen
          </button>
        }
        zahlen={[
          { label: 'Im Test', wert: tests.length },
          { label: 'Zahlend', wert: mandanten.filter((m) => m.mandant.status === 'aktiv').length },
          { label: 'Signale', wert: mandanten.reduce((n, m) => n + m.signale.length, 0), warn: mandanten.some((m) => m.signale.length > 0) },
          { label: 'Lead-Markt frei', wert: daten ? daten.markt.frei : '…' },
        ]}
      />
      {fehler ? (
        <ErrorBox error={fehler} onRetry={() => void laden()} />
      ) : !daten ? (
        <p className="muted">Lädt …</p>
      ) : mandanten.length === 0 ? (
        <p className="muted">Noch keine Mandanten. Leg den ersten an, dann seine Google-Adressen.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Mandant</th>
                <th>Status</th>
                <th>Gesundheit</th>
                <th>Leads</th>
                <th>KI</th>
                <th>Zuletzt da</th>
                <th>Signale</th>
              </tr>
            </thead>
            <tbody>
              {mandanten.map((u) => (
                <tr key={u.mandant.id} onClick={() => navigate(`/plattform/${u.mandant.id}`)}>
                  <td>
                    <Link to={`/plattform/${u.mandant.id}`} onClick={(e) => e.stopPropagation()}>
                      <strong>{u.mandant.name}</strong>
                    </Link>
                    <div className="muted small">
                      {PAKETE[u.mandant.paket]?.name} · {u.personen} {u.personen === 1 ? 'Person' : 'Personen'}
                    </div>
                  </td>
                  <td>
                    {statusText(u)}
                    {u.tage_uebrig !== null && <div className="muted small">noch {u.tage_uebrig} Tage</div>}
                  </td>
                  <td>
                    <span className={`gesundheit${u.gesundheit < 35 ? ' is-warn' : u.gesundheit >= 70 ? ' is-gut' : ''}`}>{u.gesundheit}</span>
                    <div className="muted small">{u.aktive_tage_7} aktive Tage / 7</div>
                  </td>
                  <td>
                    {u.leads_verbraucht} / {u.mandant.lead_kontingent}
                  </td>
                  <td>
                    {u.ki_verbraucht} / {u.mandant.ki_kontingent}
                  </td>
                  <td className="small">{u.letzter_login ? relativeDays(u.letzter_login.slice(0, 10)) : 'noch nie'}</td>
                  <td className="small">{u.signale.length ? u.signale.join(' · ') : <span className="muted">–</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {neu && (
        <NeuDialog
          api={api}
          onClose={() => setNeu(false)}
          onFertig={(id) => {
            setNeu(false);
            navigate(`/plattform/${id}`);
          }}
        />
      )}
    </div>
  );
}

function NeuDialog({ api, onClose, onFertig }: { api: PlattformAdminApi; onClose(): void; onFertig(id: string): void }) {
  const { show } = useToast();
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [email, setEmail] = useState('');
  const [person, setPerson] = useState('');
  const [paket, setPaket] = useState<Paket>('test');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<unknown>();
  const kennung = id || name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);

  const anlegen = async () => {
    setBusy(true);
    setFehler(undefined);
    try {
      await api.speichereMandant({ id: kennung, name: name.trim(), paket, status: paket === 'test' ? 'test' : 'aktiv' });
      if (email.trim()) await api.speichereZugang({ email, mandant_id: kennung, name: person, rolle: 'inhaber' });
      show(`${name} angelegt. Jetzt die Datenbank hub_${kennung} einrichten (Befehle auf der Seite).`);
      onFertig(kennung);
    } catch (err) {
      setFehler(err);
      setBusy(false);
    }
  };

  return (
    <Dialog title="Mandant anlegen" onClose={onClose} onSubmit={anlegen} submitLabel="Anlegen" busy={busy}>
      <div className="grid">
        <Field label="Firma">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="vennie" required />
        </Field>
        <Field label="Kennung" hint={`Datenbank hub_${kennung || '…'}; nur a–z, 0–9, _`}>
          <input value={kennung} onChange={(e) => setId(e.target.value.toLowerCase())} pattern="[a-z0-9_]{2,30}" required />
        </Field>
        <Field label="Paket">
          <select value={paket} onChange={(e) => setPaket(e.target.value as Paket)}>
            {Object.values(PAKETE).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.preis}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Google-Adresse (Inhaber)" hint="Darf sich danach anmelden. Weitere Personen auf der Seite des Mandanten.">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="leon@vennie.tech" />
        </Field>
        <Field label="Name">
          <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Leon …" />
        </Field>
      </div>
      <FormError error={fehler} />
    </Dialog>
  );
}
