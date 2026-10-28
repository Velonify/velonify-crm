import { useCallback, useEffect, useState } from 'react';
import { Schalter } from '../components/Schalter';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, Field, FormError, Loading, PageHeader } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { INSTANZ_ROLLEN, PROFIL_WERKZEUGE, type InstanzRolle, type InstanzZugang } from '../data/instanz';
import { useMandant } from '../plattform/MandantContext';
import { WERKZEUGE } from '../werkzeuge';

const zeit = (iso: string) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'noch nie');

/**
 * Einrichtung of an own instance (only admins and Velonify's support reach it, see Layout): name, team and roles,
 * Velonify's support login, and – for Velonify only – which tools are on.
 */
export function InstanzEinrichtungPage() {
  const { instanzApi, instanz } = useMandant();
  const [daten, setDaten] = useState<{ zugaenge: InstanzZugang[]; name: string; velonify_zugang: boolean } | null>(null);
  const [fehler, setFehler] = useState<unknown>();

  const laden = useCallback(async () => {
    try {
      setDaten(await instanzApi.zugaenge());
      setFehler(undefined);
    } catch (err) {
      setFehler(err);
    }
  }, [instanzApi]);
  useEffect(() => void laden(), [laden]);

  return (
    <div className="page narrow">
      <PageHeader eyebrow="System" title="Einrichtung" subtitle={`Angemeldet als ${instanz?.email ?? ''}${instanz?.rolle === 'velonify' ? ' (Velonify-Support)' : ''}`} />
      {fehler ? <ErrorBox error={fehler} onRetry={() => void laden()} /> : null}
      {!daten && !fehler && <Loading />}
      {daten && (
        <>
          <NameKarte name={daten.name} />
          <TeamKarte zugaenge={daten.zugaenge} neuLaden={laden} />
          <VelonifyKarte an={daten.velonify_zugang} />
          {instanz?.rolle === 'velonify' && <WerkzeugKarte />}
        </>
      )}
    </div>
  );
}

function NameKarte({ name: gespeichert }: { name: string }) {
  const { instanzApi, setzeInstanz } = useMandant();
  const { show } = useToast();
  const [name, setName] = useState(gespeichert);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<unknown>();

  const speichern = async () => {
    setBusy(true);
    setFehler(undefined);
    try {
      setzeInstanz(await instanzApi.einstellungen({ name }));
      show('Name gespeichert');
    } catch (err) {
      setFehler(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="1. Name">
      <Field label="Name" hint="Steht oben links als „<Name> HUB“ mit „by Velonify“ darunter und im Browser-Tab.">
        <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="z. B. Beispiel" />
      </Field>
      <FormError error={fehler} />
      <div className="form-actions">
        <button type="button" className="button primary" onClick={() => void speichern()} disabled={busy || !name.trim() || name.trim() === gespeichert}>
          {busy ? 'Speichert …' : 'Speichern'}
        </button>
      </div>
    </Card>
  );
}

function TeamKarte({ zugaenge, neuLaden }: { zugaenge: InstanzZugang[]; neuLaden(): Promise<void> }) {
  const { instanzApi, instanz } = useMandant();
  const { refresh } = useCrm();
  const { show } = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [rolle, setRolle] = useState<InstanzRolle>('team');
  const [fehler, setFehler] = useState<unknown>();

  const speichern = async (z: { email: string; name?: string; rolle?: InstanzRolle; aktiv?: boolean }) => {
    setFehler(undefined);
    try {
      await instanzApi.zugang(z);
      await neuLaden();
      // New logins join the team list (assignments, @-mentions).
      void refresh();
      return true;
    } catch (err) {
      setFehler(err);
      return false;
    }
  };

  return (
    <Card title="2. Team und Zugänge" actions={<span className="muted small">Nur diese Google-Konten kommen hinein</span>}>
      <ul className="liste-schlicht small">
        {INSTANZ_ROLLEN.map((r) => (
          <li key={r.id}>
            <strong>{r.label}:</strong> {r.beschreibung}
          </li>
        ))}
      </ul>
      {zugaenge.length > 0 && (
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
              {zugaenge.map((z) => {
                const ich = z.email === instanz?.email;
                return (
                  <tr key={z.email} className={z.aktiv ? undefined : 'is-archiviert'}>
                    <td>{z.email}</td>
                    <td>{z.name || '–'}</td>
                    <td>
                      <select
                        value={z.rolle}
                        disabled={ich}
                        aria-label={`Rolle ${z.email}`}
                        onChange={(e) => void speichern({ email: z.email, rolle: e.target.value as InstanzRolle }).then((ok) => ok && show('Rolle geändert'))}
                      >
                        {INSTANZ_ROLLEN.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="small">{zeit(z.letzter_login)}</td>
                    <td>
                      <Schalter
                        an={z.aktiv}
                        disabled={ich}
                        label={`Zugang ${z.email}`}
                        onChange={(aktiv) => void speichern({ email: z.email, aktiv }).then((ok) => ok && show(aktiv ? 'Zugang aktiv.' : 'Zugang entzogen.'))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          void speichern({ email, name, rolle, aktiv: true }).then((ok) => {
            if (!ok) return;
            show(`${email.trim().toLowerCase()} darf sich jetzt anmelden.`);
            setEmail('');
            setName('');
          });
        }}
      >
        <input type="email" required placeholder="name@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Google-Konto" />
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        <select value={rolle} onChange={(e) => setRolle(e.target.value as InstanzRolle)} aria-label="Rolle">
          {INSTANZ_ROLLEN.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <button type="submit" className="button primary small">
          Einladen
        </button>
      </form>
      <p className="muted small">Die Person meldet sich danach mit genau diesem Google-Konto an. Eine Einladungsmail verschickt der Hub nicht.</p>
      <FormError error={fehler} />
    </Card>
  );
}

function VelonifyKarte({ an: gespeichert }: { an: boolean }) {
  const { instanzApi, setzeInstanz, instanz } = useMandant();
  const { show } = useToast();
  const [an, setAn] = useState(gespeichert);
  const [fehler, setFehler] = useState<unknown>();
  const selbst = instanz?.rolle === 'velonify';

  const umschalten = async (neu: boolean) => {
    setFehler(undefined);
    try {
      setzeInstanz(await instanzApi.einstellungen({ velonify_zugang: neu }));
      setAn(neu);
      show(neu ? 'Velonify-Support hat wieder Zugang.' : 'Velonify-Support ist ausgesperrt.');
    } catch (err) {
      setFehler(err);
    }
  };

  return (
    <Card title="3. Zugang für Velonify" actions={<Schalter an={an} label="Zugang für Velonify" disabled={selbst} onChange={(neu) => void umschalten(neu)} />}>
      <p className="muted">
        Solange das an ist, kann sich das Velonify-Team für Einrichtung und Support anmelden und sieht dann dasselbe wie ein Admin. Schaltet ihr das aus, kommt niemand von
        Velonify mehr hinein, bis ihr es wieder anschaltet. Updates und Wartung laufen auch ohne diesen Zugang.
      </p>
      {selbst && <p className="muted small">Das schaltet nur ein Admin des Teams um.</p>}
      <FormError error={fehler} />
    </Card>
  );
}

function WerkzeugKarte() {
  const { instanzApi, setzeInstanz, instanz } = useMandant();
  const { show } = useToast();
  const [fehler, setFehler] = useState<unknown>();
  if (!instanz) return null;
  const alle = PROFIL_WERKZEUGE[instanz.profil].filter((w) => w !== 'home');

  const umschalten = async (werkzeug: string, an: boolean) => {
    setFehler(undefined);
    try {
      const funktionen = Object.fromEntries(alle.map((w) => [w, w === werkzeug ? an : instanz.werkzeuge.includes(w)]));
      setzeInstanz(await instanzApi.einstellungen({ funktionen }));
      show('Werkzeuge gespeichert');
    } catch (err) {
      setFehler(err);
    }
  };

  return (
    <Card title="4. Werkzeuge" actions={<span className="muted small">Nur für Velonify sichtbar</span>}>
      <ul className="liste-schlicht">
        {alle.map((w) => (
          <li key={w} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{WERKZEUGE.find((x) => x.id === w)?.name ?? w}</span>
            <Schalter an={instanz.werkzeuge.includes(w)} label={`Werkzeug ${w}`} onChange={(an) => void umschalten(w, an)} />
          </li>
        ))}
      </ul>
      <FormError error={fehler} />
    </Card>
  );
}
