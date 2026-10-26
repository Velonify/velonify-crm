import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Schalter } from '../components/Schalter';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, Field, FormError, PageHeader } from '../components/ui';
import { MANDANTEN_WERKZEUGE, PAKETE, plusTage, werkzeugAn, type Mandant, type MandantStatus, type Paket, type Rolle } from '../data/plattform';
import { WERKZEUGE } from '../werkzeuge';
import type { MandantDetail } from './api';
import { useAdminApi } from './PlattformPage';

const NUTZUNG_TEXT: Record<string, string> = {
  login: 'angemeldet',
  seite: 'geöffnet',
  lead: 'Lead freigeschaltet',
  koeder: 'Köder-Lead freigeschaltet',
  ki: 'KI genutzt',
  bewegung: 'Deal verschoben nach',
  buchung: 'Buchung angefragt',
};

const zeit = (iso: string) => (iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');

/** One tenant: status and trial, tools, quotas, logins, decoys, usage and feedback. */
export function MandantPage() {
  const { id = '' } = useParams();
  const api = useAdminApi();
  const { show } = useToast();
  const [detail, setDetail] = useState<MandantDetail | null>(null);
  const [fehler, setFehler] = useState<unknown>(null);
  const [entwurf, setEntwurf] = useState<Mandant | null>(null);
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    try {
      const d = await api.mandant(id);
      setDetail(d);
      setEntwurf(d.mandant);
      setFehler(null);
    } catch (err) {
      setFehler(err);
    }
  }, [api, id]);
  useEffect(() => void laden(), [laden]);

  if (fehler) return <div className="page"><ErrorBox error={fehler} onRetry={() => void laden()} /></div>;
  if (!detail || !entwurf) return <div className="page"><p className="muted">Lädt …</p></div>;
  const m = detail.mandant;

  const speichern = async (aenderung: Partial<Mandant>, meldung = 'Gespeichert.') => {
    setBusy(true);
    try {
      await api.speichereMandant({ id: m.id, ...aenderung });
      show(meldung);
      await laden();
    } catch (err) {
      show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  const setze = (a: Partial<Mandant>) => setEntwurf((e) => (e ? { ...e, ...a } : e));
  const geaendert = JSON.stringify(entwurf) !== JSON.stringify(m);

  return (
    <div className="page plattform-mandant">
      <PageHeader
        eyebrow={<Link to="/plattform">Mandanten</Link>}
        title={m.name}
        subtitle={`Datenbank hub_${m.id} · angelegt ${m.angelegt_am.slice(0, 10)}`}
        actions={
          <>
            {m.status !== 'gesperrt' ? (
              <button type="button" className="button" disabled={busy} onClick={() => confirm(`${m.name} sofort sperren? Alle Personen fliegen beim nächsten Klick raus.`) && void speichern({ status: 'gesperrt' }, 'Gesperrt.')}>
                Notaus: sperren
              </button>
            ) : (
              <button type="button" className="button" disabled={busy} onClick={() => void speichern({ status: 'test' }, 'Wieder freigegeben.')}>
                Entsperren
              </button>
            )}
            {m.status === 'test' && (
              <button type="button" className="button" disabled={busy} onClick={() => void speichern({ test_ende: plusTage(m.test_ende, 14) }, 'Test um 14 Tage verlängert.')}>
                +14 Tage
              </button>
            )}
            {m.status !== 'aktiv' && (
              <button type="button" className="button primary" disabled={busy} onClick={() => void speichern({ status: 'aktiv', paket: (m.buchung_paket as Paket) || 'pro' }, 'Ist jetzt zahlender Kunde.')}>
                {m.buchung_paket ? `${PAKETE[m.buchung_paket as Paket]?.name} aktivieren` : 'Als Kunde aktivieren'}
              </button>
            )}
          </>
        }
      />

      {m.buchung_am && m.status !== 'aktiv' && (
        <p className="alert">
          <span>
            {m.buchung_von} hat am {zeit(m.buchung_am)} <strong>{PAKETE[m.buchung_paket as Paket]?.name}</strong> angefragt. Rechnung schreiben, dann „aktivieren“.
          </span>
        </p>
      )}

      <div className="grid-2">
        <Card title="Vertrag & Laufzeit">
          <div className="grid">
            <Field label="Status">
              <select value={entwurf.status} onChange={(e) => setze({ status: e.target.value as MandantStatus })}>
                <option value="test">Test</option>
                <option value="aktiv">Aktiv (zahlt)</option>
                <option value="nur_lesen">Nur lesen</option>
                <option value="gesperrt">Gesperrt</option>
              </select>
            </Field>
            <Field label="Paket">
              <select value={entwurf.paket} onChange={(e) => setze({ paket: e.target.value as Paket })}>
                {Object.values(PAKETE).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.preis}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Test ab">
              <input type="date" value={entwurf.test_start} onChange={(e) => setze({ test_start: e.target.value })} />
            </Field>
            <Field label="Test bis" hint="Danach 7 Tage nur lesen, dann gesperrt">
              <input type="date" value={entwurf.test_ende} onChange={(e) => setze({ test_ende: e.target.value })} />
            </Field>
            <Field label="Leads" hint={entwurf.lead_zeitraum === 'monat' ? 'pro Monat' : 'im ganzen Test'}>
              <input type="number" min={0} value={entwurf.lead_kontingent} onChange={(e) => setze({ lead_kontingent: Number(e.target.value) })} />
            </Field>
            <Field label="Zeitraum">
              <select value={entwurf.lead_zeitraum} onChange={(e) => setze({ lead_zeitraum: e.target.value as Mandant['lead_zeitraum'] })}>
                <option value="gesamt">gesamt (Test)</option>
                <option value="monat">pro Monat (Abo)</option>
              </select>
            </Field>
            <Field label="KI-Aktionen" hint="Anschreiben, Shop-Audit, Frag den Hub; gleicher Zeitraum">
              <input type="number" min={0} value={entwurf.ki_kontingent} onChange={(e) => setze({ ki_kontingent: Number(e.target.value) })} />
            </Field>
            <Field label="Notiz" wide>
              <textarea rows={2} value={entwurf.notiz} onChange={(e) => setze({ notiz: e.target.value })} />
            </Field>
          </div>
          <div className="form-actions">
            <button type="button" className="button primary" disabled={!geaendert || busy} onClick={() => void speichern(entwurf)}>
              Speichern
            </button>
          </div>
          <p className="muted small">
            Testbedingungen: {m.bedingungen_am ? `bestätigt von ${m.bedingungen_von} am ${zeit(m.bedingungen_am)}` : 'noch nicht bestätigt'}
          </p>
        </Card>

        <Card title="Funktionen">
          <p className="muted small">Ohne eigenen Schalter gilt das Paket. Ausgeschaltete Werkzeuge verschwinden beim Mandanten sofort.</p>
          {MANDANTEN_WERKZEUGE.filter((w) => w !== 'home').map((w) => {
            const an = werkzeugAn(m, w);
            const eigen = typeof m.funktionen[w] === 'boolean';
            return (
              <div key={w} className="einst-zeile">
                <span>
                  {WERKZEUGE.find((x) => x.id === w)?.name ?? w}
                  <span className="muted small">{eigen ? ' · eigener Schalter' : ' · laut Paket'}</span>
                </span>
                <Schalter an={an} disabled={busy} label={`${w} für ${m.name}`} onChange={(neu) => void speichern({ funktionen: { ...m.funktionen, [w]: neu } })} />
              </div>
            );
          })}
        </Card>
      </div>

      <Zugaenge detail={detail} onGeaendert={laden} />

      <div className="grid-2">
        <Card title={`Feedback (${detail.feedback.length})`}>
          {detail.feedback.length === 0 ? (
            <p className="muted small">Noch keins. Fragen kommen an Tag 3, 14 und 25 von selbst.</p>
          ) : (
            <ul className="liste-schlicht">
              {detail.feedback.map((f, i) => (
                <li key={i}>
                  <strong>
                    {f.anlass === 'frei' ? 'Feedback' : f.anlass.replace('tag', 'Tag ')}
                    {f.wert !== null ? ` · ${f.wert}` : ''}
                  </strong>{' '}
                  <span className="muted small">
                    {f.email} · {zeit(f.am)}
                  </span>
                  {f.text && <p>{f.text}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Nutzung">
          {detail.werkzeuge_genutzt.length > 0 && (
            <p className="small">
              {detail.werkzeuge_genutzt.map((w) => `${WERKZEUGE.find((x) => x.id === w.werkzeug)?.name ?? w.werkzeug} ${w.aufrufe}×`).join(' · ')}
            </p>
          )}
          <ul className="liste-schlicht small">
            {detail.nutzung.slice(0, 40).map((n, i) => (
              <li key={i}>
                <span className="muted">{zeit(n.am)}</span> {n.email.split('@')[0]} {NUTZUNG_TEXT[n.art] ?? n.art} {n.art === 'seite' ? (WERKZEUGE.find((x) => x.id === n.detail)?.name ?? n.detail) : n.detail}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title={`Freigeschaltete Leads (${detail.freigaben.filter((f) => !f.koeder).length})`}>
        <ul className="liste-schlicht small">
          {detail.freigaben.map((f, i) => (
            <li key={i}>
              {f.koeder ? <strong className="warn-text">Köder · </strong> : null}
              {f.domain} <span className="muted">· {f.von} · {zeit(f.am)}</span>
            </li>
          ))}
        </ul>
        <Koeder mandantId={m.id} onAngelegt={laden} />
      </Card>

      <Card title="Einrichtung der Datenbank">
        <p className="small">Einmal pro Mandant, bevor sich jemand anmeldet (Cloud SQL Studio als lukas@velonify.de, Datenbank „postgres“), danach Migrationen:</p>
        <pre className="code">{`CREATE DATABASE hub_${m.id};
REVOKE ALL ON DATABASE hub_${m.id} FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE hub_${m.id} TO "crm-api@velonify-crm.iam";
GRANT CONNECT ON DATABASE hub_${m.id} TO "lukas@velonify.de", "julian@velonify.de";
-- dann in der Datenbank hub_${m.id}:
ALTER SCHEMA public OWNER TO crm_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO "crm-api@velonify-crm.iam";
ALTER DEFAULT PRIVILEGES FOR ROLE crm_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO "crm-api@velonify-crm.iam";
ALTER DEFAULT PRIVILEGES FOR ROLE crm_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "crm-api@velonify-crm.iam";

npm run db:migrieren -- hub_${m.id}`}</pre>
      </Card>
    </div>
  );
}

function Zugaenge({ detail, onGeaendert }: { detail: MandantDetail; onGeaendert(): Promise<void> }) {
  const api = useAdminApi();
  const { show } = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [rolle, setRolle] = useState<Rolle>('mitarbeiter');
  const [fehler, setFehler] = useState<unknown>();
  const m = detail.mandant;

  const speichern = async (z: { email: string; name?: string; rolle: Rolle; aktiv: boolean }) => {
    setFehler(undefined);
    try {
      await api.speichereZugang({ ...z, mandant_id: m.id });
      await onGeaendert();
      return true;
    } catch (err) {
      setFehler(err);
      return false;
    }
  };

  return (
    <Card title="Zugänge" actions={<span className="muted small">Nur diese Google-Konten kommen hinein</span>}>
      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr>
              <th>Google-Konto</th>
              <th>Name</th>
              <th>Rolle</th>
              <th>Zuletzt da</th>
              <th>Zugang</th>
            </tr>
          </thead>
          <tbody>
            {detail.zugaenge.map((z) => (
              <tr key={z.email} className={z.aktiv ? undefined : 'is-archiviert'}>
                <td>{z.email}</td>
                <td>{z.name || '–'}</td>
                <td>{z.rolle === 'inhaber' ? 'Inhaber' : 'Mitarbeiter'}</td>
                <td className="small">{zeit(z.letzter_login)}</td>
                <td>
                  <Schalter an={z.aktiv} label={`Zugang ${z.email}`} onChange={(aktiv) => void speichern({ email: z.email, rolle: z.rolle, aktiv }).then((ok) => ok && show(aktiv ? 'Zugang aktiv.' : 'Zugang entzogen.'))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          void speichern({ email, name, rolle, aktiv: true }).then((ok) => {
            if (!ok) return;
            show(`${email} darf sich jetzt anmelden.`);
            setEmail('');
            setName('');
          });
        }}
      >
        <input type="email" required placeholder="name@firma.de" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Google-Konto" />
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        <select value={rolle} onChange={(e) => setRolle(e.target.value as Rolle)} aria-label="Rolle">
          <option value="mitarbeiter">Mitarbeiter</option>
          <option value="inhaber">Inhaber</option>
        </select>
        <button type="submit" className="button primary small">
          Zugang geben
        </button>
      </form>
      <FormError error={fehler} />
      {PAKETE[m.paket]?.personen !== null && detail.zugaenge.filter((z) => z.aktiv).length > (PAKETE[m.paket]?.personen ?? 0) && (
        <p className="alert">Mehr aktive Zugänge als im Paket {PAKETE[m.paket].name} vorgesehen ({PAKETE[m.paket].personen}).</p>
      )}
    </Card>
  );
}

/** A made-up shop only this tenant sees; its address must reach Velonify (catch-all domain). */
function Koeder({ mandantId, onAngelegt }: { mandantId: string; onAngelegt(): Promise<void> }) {
  const api = useAdminApi();
  const { show } = useToast();
  const [offen, setOffen] = useState(false);
  const [k, setK] = useState({ domain: '', firma: '', email: '', plz: '', ort: '', ansprechpartner: '' });
  const [fehler, setFehler] = useState<unknown>();
  if (!offen) {
    return (
      <button type="button" className="button small" onClick={() => setOffen(true)}>
        Köder-Lead anlegen
      </button>
    );
  }
  const feld = (name: keyof typeof k, label: string, placeholder = '') => (
    <Field label={label}>
      <input value={k[name]} placeholder={placeholder} onChange={(e) => setK({ ...k, [name]: e.target.value })} />
    </Field>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setFehler(undefined);
        api
          .koeder({ mandant_id: mandantId, ...k })
          .then(async () => {
            show('Köder angelegt. Schaltet der Mandant ihn frei, kommt eine Slack-Nachricht.');
            setOffen(false);
            await onAngelegt();
          })
          .catch(setFehler);
      }}
    >
      <p className="muted small">
        Erfundener Shop, der nur bei diesem Mandanten im Lead-Markt auftaucht. Domain und Mailadresse müssen uns gehören (Domain mit Weiterleitung aller Adressen), sonst landet die Ansprache bei einer echten Firma. Schreibt jemand Fremdes an diese Adresse, wurden Leads weitergegeben.
      </p>
      <div className="grid">
        {feld('firma', 'Firma', 'erfundener Firmenname')}
        {feld('domain', 'Domain', 'eine Domain von uns')}
        {feld('email', 'E-Mail', 'info@ diese Domain')}
        {feld('ansprechpartner', 'Geschäftsführung', 'erfundener Name')}
        {feld('plz', 'PLZ', '44137')}
        {feld('ort', 'Ort', 'Dortmund')}
      </div>
      <FormError error={fehler} />
      <div className="form-actions">
        <button type="button" className="button" onClick={() => setOffen(false)}>
          Abbrechen
        </button>
        <button type="submit" className="button primary">
          Köder anlegen
        </button>
      </div>
    </form>
  );
}
