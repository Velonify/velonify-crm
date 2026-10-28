import { useCallback, useEffect, useState } from 'react';
import { Schalter } from '../components/Schalter';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, Field, FormError, Loading, PageHeader } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { BAUSTEINE, INSTANZ_ROLLEN, type BausteinId, type InstanzRolle, type InstanzZugang } from '../data/instanz';
import { OrganisationEinrichtung } from '../creator/ablage/EinrichtungKarten';
import { RechtKarte } from '../creator/start/recht';
import type { Zustaendigkeit } from '../creator/freigaben/typen';
import { useCreatorApi } from '../creator/api';
import { useMandant } from '../plattform/MandantContext';
import { useTodoDaten } from '../todo/useTodoDaten';
import { WERKZEUGE } from '../werkzeuge';

const zeit = (iso: string) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'noch nie');
const werkzeugName = (id: string) => WERKZEUGE.find((w) => w.id === id)?.name ?? id;

/**
 * Einrichtung of an own instance (only admins and Velonify's support reach it, see Layout): name, team, roles and partner
 * logins, who decides/answers/approves, Velonify's support login, the module cards (Drive, password manager) and – for
 * Velonify only – which building blocks of the concept are switched on.
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
          {instanz?.bausteine.includes('freigaben') && <ZustaendigkeitenKarte />}
          <OrganisationEinrichtung />
          <RechtKarte />
          <VelonifyKarte an={daten.velonify_zugang} />
          {instanz?.rolle === 'velonify' && <BausteineKarte />}
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
    <Card title="Name">
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
  const [offen, setOffen] = useState<string | null>(null);
  const [fehler, setFehler] = useState<unknown>();
  const partnerAn = instanz?.bausteine.includes('partner') ?? false;
  const rollen = INSTANZ_ROLLEN.filter((r) => r.id !== 'partner' || partnerAn);

  const speichern = async (z: Parameters<typeof instanzApi.zugang>[0]) => {
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
    <Card title="Team und Zugänge" actions={<span className="muted small">Nur diese Google-Konten kommen hinein</span>}>
      <ul className="liste-schlicht small">
        {rollen.map((r) => (
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
                return [
                  <tr key={z.email} className={z.aktiv ? undefined : 'is-archiviert'}>
                    <td>{z.email}</td>
                    <td>{z.name || '–'}</td>
                    <td>
                      <select
                        value={z.rolle}
                        disabled={ich}
                        aria-label={`Rolle ${z.email}`}
                        onChange={(e) =>
                          void speichern({ email: z.email, rolle: e.target.value as InstanzRolle }).then((ok) => {
                            if (!ok) return;
                            show('Rolle geändert');
                            if (e.target.value === 'partner') setOffen(z.email);
                          })
                        }
                      >
                        {rollen.concat(rollen.some((r) => r.id === z.rolle) ? [] : INSTANZ_ROLLEN.filter((r) => r.id === z.rolle)).map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      {z.rolle === 'partner' && (
                        <button type="button" className="button small" onClick={() => setOffen(offen === z.email ? null : z.email)}>
                          {offen === z.email ? 'Zu' : 'Bereiche'}
                        </button>
                      )}
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
                  </tr>,
                  z.rolle === 'partner' && offen === z.email ? (
                    <tr key={`${z.email}-bereiche`}>
                      <td colSpan={5}>
                        <PartnerBereiche zugang={z} speichern={speichern} />
                      </td>
                    </tr>
                  ) : null,
                ];
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
            if (rolle === 'partner') setOffen(email.trim().toLowerCase());
            setEmail('');
            setName('');
          });
        }}
      >
        <input type="email" required placeholder="name@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Google-Konto" />
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        <select value={rolle} onChange={(e) => setRolle(e.target.value as InstanzRolle)} aria-label="Rolle">
          {rollen.map((r) => (
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

/** What a partner (cutter, deal agency, tax advisor) sees: tools, To-Do boards, amounts. */
function PartnerBereiche({ zugang, speichern }: { zugang: InstanzZugang; speichern(z: { email: string; werkzeuge?: string[]; boards?: string[]; ohne_betraege?: boolean }): Promise<boolean> }) {
  const { instanz } = useMandant();
  const { data: todos } = useTodoDaten();
  const { show } = useToast();
  const werkzeuge = (instanz?.werkzeuge ?? []).filter((w) => w !== 'home');
  const boards = (todos?.boards ?? []).filter((b) => !b.archiviert);
  const umschalten = (liste: string[], id: string, an: boolean) => (an ? [...new Set([...liste, id])] : liste.filter((x) => x !== id));

  return (
    <div className="stack">
      <p className="small">
        <strong>Werkzeuge</strong>
      </p>
      <div className="filters">
        {werkzeuge.map((w) => (
          <label key={w} className="small">
            <input
              type="checkbox"
              checked={zugang.werkzeuge.includes(w)}
              onChange={(e) => void speichern({ email: zugang.email, werkzeuge: umschalten(zugang.werkzeuge, w, e.target.checked) }).then((ok) => ok && show('Gespeichert'))}
            />{' '}
            {werkzeugName(w)}
          </label>
        ))}
      </div>
      {zugang.werkzeuge.includes('todo') && (
        <>
          <p className="small">
            <strong>Boards</strong> <span className="muted">(nur diese Boards und ihre Karten)</span>
          </p>
          <div className="filters">
            {boards.length === 0 && <span className="muted small">Noch keine Boards angelegt.</span>}
            {boards.map((b) => (
              <label key={b.id} className="small">
                <input
                  type="checkbox"
                  checked={zugang.boards.includes(b.id)}
                  onChange={(e) => void speichern({ email: zugang.email, boards: umschalten(zugang.boards, b.id, e.target.checked) }).then((ok) => ok && show('Gespeichert'))}
                />{' '}
                {b.titel}
              </label>
            ))}
          </div>
        </>
      )}
      <label className="small">
        <input
          type="checkbox"
          checked={!zugang.ohne_betraege}
          onChange={(e) => void speichern({ email: zugang.email, ohne_betraege: !e.target.checked }).then((ok) => ok && show('Gespeichert'))}
        />{' '}
        Sieht Beträge (Kooperationen, Einnahmen)
      </label>
    </div>
  );
}

/** Rollen und Freigaben: per area who decides, who answers and who approves. */
function ZustaendigkeitenKarte() {
  const api = useCreatorApi();
  const { db } = useCrm();
  const { show } = useToast();
  const [daten, setDaten] = useState<{ bereiche: { id: string; label: string }[]; zustaendigkeiten: Zustaendigkeit[] } | null>(null);
  const [fehler, setFehler] = useState<unknown>();
  const team = db?.listen.team ?? [];

  useEffect(() => {
    api
      .get<{ bereiche: { id: string; label: string }[]; zustaendigkeiten: Zustaendigkeit[] }>('/c/freigaben/zustaendigkeiten')
      .then(setDaten)
      .catch(setFehler);
  }, [api]);

  const setze = (bereich: string, feld: keyof Omit<Zustaendigkeit, 'bereich'>, wert: string) =>
    setDaten((d) => d && { ...d, zustaendigkeiten: d.zustaendigkeiten.map((z) => (z.bereich === bereich ? { ...z, [feld]: wert } : z)) });

  const speichern = async () => {
    setFehler(undefined);
    try {
      await api.post('/c/freigaben/zustaendigkeiten', { zustaendigkeiten: daten?.zustaendigkeiten ?? [] });
      show('Zuständigkeiten gespeichert');
    } catch (err) {
      setFehler(err);
    }
  };

  const auswahl = (bereich: string, feld: keyof Omit<Zustaendigkeit, 'bereich'>, wert: string) => (
    <select value={wert} onChange={(e) => setze(bereich, feld, e.target.value)} aria-label={`${feld} ${bereich}`}>
      <option value="">–</option>
      {team.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );

  return (
    <Card title="Rollen und Freigaben">
      <p className="muted">Wer in welchem Bereich entscheidet, wer antwortet und wer freigibt. Freigaben gehen automatisch an die Person in „gibt frei“.</p>
      {!daten && !fehler && <Loading />}
      {daten && (
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>Bereich</th>
                <th>Entscheidet</th>
                <th>Antwortet</th>
                <th>Gibt frei</th>
              </tr>
            </thead>
            <tbody>
              {daten.zustaendigkeiten.map((z) => (
                <tr key={z.bereich}>
                  <td>{daten.bereiche.find((b) => b.id === z.bereich)?.label ?? z.bereich}</td>
                  <td>{auswahl(z.bereich, 'entscheidet', z.entscheidet)}</td>
                  <td>{auswahl(z.bereich, 'antwortet', z.antwortet)}</td>
                  <td>{auswahl(z.bereich, 'gibt_frei', z.gibt_frei)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <FormError error={fehler} />
      <div className="form-actions">
        <button type="button" className="button primary" onClick={() => void speichern()} disabled={!daten}>
          Speichern
        </button>
      </div>
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
    <Card title="Zugang für Velonify" actions={<Schalter an={an} label="Zugang für Velonify" disabled={selbst} onChange={(neu) => void umschalten(neu)} />}>
      <p className="muted">
        Solange das an ist, kann sich das Velonify-Team für Einrichtung und Support anmelden und sieht dann dasselbe wie ein Admin. Schaltet ihr das aus, kommt niemand von
        Velonify mehr hinein, bis ihr es wieder anschaltet. Updates und Wartung laufen auch ohne diesen Zugang.
      </p>
      {selbst && <p className="muted small">Das schaltet nur ein Admin des Teams um.</p>}
      <FormError error={fehler} />
    </Card>
  );
}

/** The building blocks of the concept: start scope on, the rest built and switched on when the customer needs it. */
function BausteineKarte() {
  const { instanzApi, setzeInstanz, instanz } = useMandant();
  const { show } = useToast();
  const [fehler, setFehler] = useState<unknown>();
  if (!instanz) return null;
  const bereiche = [...new Set(BAUSTEINE.map((b) => b.bereich))];

  const umschalten = async (id: BausteinId, an: boolean) => {
    setFehler(undefined);
    try {
      setzeInstanz(await instanzApi.einstellungen({ bausteine: { [id]: an } }));
      show('Bausteine gespeichert');
    } catch (err) {
      setFehler(err);
    }
  };

  return (
    <Card title="Bausteine" actions={<span className="muted small">Nur für Velonify sichtbar</span>}>
      {bereiche.map((bereich) => (
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
                <Schalter an={instanz.bausteine.includes(b.id)} label={`Baustein ${b.label}`} onChange={(an) => void umschalten(b.id, an)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <FormError error={fehler} />
    </Card>
  );
}
