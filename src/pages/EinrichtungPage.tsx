import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toasts';
import { Card, FormError, PageHeader } from '../components/ui';
import { config, isDemo } from '../config';
import { DEFAULT_DEAL_TITEL, DRIVE_ORDNER_NAMEN, EINSTELLUNG, FIRMEN_LINKS, istBuchungslink, teamTelefonSchluessel, teamTerminSchluessel } from '../data/constants';
import { useCrm } from '../data/CrmContext';
import { AuthExpiredError } from '../data/errors';
import { driveFolderUrl, type DriveFile } from '../data/google/drive';
import { extractDriveFolderId } from '../data/rules';
import { errorMessage } from '../lib/errors';
import { MITARBEITER_SCHLUESSEL, mitarbeiterListe } from '../data/rollen';
import { useMandant } from '../plattform/MandantContext';

type OrdnerSchluessel = keyof typeof DRIVE_ORDNER_NAMEN;
const ORDNER: { key: OrdnerSchluessel; einstellung: string; label: string; hinweis: string }[] = [
  { key: 'leads', einstellung: EINSTELLUNG.leadsOrdner, label: 'Lead-Ordner', hinweis: '02_Sales/01_Leads – hier entstehen neue Lead-Ordner' },
  { key: 'clients', einstellung: EINSTELLUNG.clientsOrdner, label: 'Kunden-Ordner', hinweis: '01_Clients – hierhin wandern Leads bei „Angebot“' },
  { key: 'vorlage', einstellung: EINSTELLUNG.vorlageOrdner, label: 'Ordnervorlage', hinweis: '03_Templates/01_Client-Folder-Template (optional)' },
  { key: 'proposals', einstellung: EINSTELLUNG.proposalsOrdner, label: 'Angebote', hinweis: '02_Sales/02_Proposals – Kalkulationen für Firmen ohne eigenen Ordner' },
];

function DriveKarte() {
  const { db, service, mutate } = useCrm();
  const toast = useToast();
  const [werte, setWerte] = useState<Record<string, string>>(() => Object.fromEntries(ORDNER.map((o) => [o.einstellung, db?.einstellungen[o.einstellung] ?? ''])));
  const [dealTitel, setDealTitel] = useState(db?.einstellungen[EINSTELLUNG.dealTitel] ?? '');
  const [treffer, setTreffer] = useState<Partial<Record<OrdnerSchluessel, DriveFile[]>>>({});
  const [suche, setSuche] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const suchen = async () => {
    if (!service) return;
    setSuche(true);
    setError(undefined);
    try {
      const ergebnisse = await Promise.all(ORDNER.map((o) => service.findeDriveOrdner(DRIVE_ORDNER_NAMEN[o.key])));
      const neu: Partial<Record<OrdnerSchluessel, DriveFile[]>> = {};
      ORDNER.forEach((o, i) => {
        neu[o.key] = ergebnisse[i];
        // Only fill in when the match is unambiguous.
        if (ergebnisse[i].length === 1 && !werte[o.einstellung]) setWerte((w) => ({ ...w, [o.einstellung]: ergebnisse[i][0].id }));
      });
      setTreffer(neu);
    } catch (err) {
      setError(err);
    } finally {
      setSuche(false);
    }
  };

  const speichern = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const bereinigt = Object.fromEntries(Object.entries(werte).map(([k, v]) => [k, extractDriveFolderId(v)]));
      await mutate(async (s) => {
        // Check that each folder exists and is reachable before saving.
        for (const [, id] of Object.entries(bereinigt)) if (id) await s.getDriveOrdner(id);
        await s.saveEinstellungen({ ...bereinigt, [EINSTELLUNG.dealTitel]: dealTitel.trim() });
      });
      setWerte(bereinigt);
      toast.show('Einstellungen gespeichert');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="2. Google Drive & Standards"
      actions={
        <button type="button" className="button small" onClick={suchen} disabled={suche || !service}>
          {suche ? 'Sucht …' : 'Ordner automatisch suchen'}
        </button>
      }
    >
      <p className="muted">
        Damit das CRM Lead-Ordner anlegen und nach 01_Clients verschieben kann. Ordner-Link aus der Drive-Adresszeile einfügen oder automatisch suchen lassen.
      </p>
      <div className="grid">
        {ORDNER.map((o) => (
          <label key={o.key} className="field wide">
            <span className="field-label">{o.label}</span>
            <div className="input-row">
              <input value={werte[o.einstellung]} onChange={(e) => setWerte((w) => ({ ...w, [o.einstellung]: e.target.value }))} placeholder="Link oder Ordner-ID" />
              {werte[o.einstellung] && !isDemo && (
                <a className="button small" href={driveFolderUrl(extractDriveFolderId(werte[o.einstellung]))} target="_blank" rel="noreferrer noopener">
                  ↗
                </a>
              )}
            </div>
            <small className="field-hint">{o.hinweis}</small>
            {treffer[o.key] && treffer[o.key]!.length !== 1 && (
              <small className="field-hint warn">
                {treffer[o.key]!.length === 0 ? `Kein Ordner „${DRIVE_ORDNER_NAMEN[o.key]}“ gefunden.` : `${treffer[o.key]!.length} Ordner „${DRIVE_ORDNER_NAMEN[o.key]}“ gefunden – bitte den richtigen Link einfügen.`}
              </small>
            )}
          </label>
        ))}
        <label className="field wide">
          <span className="field-label">Standard-Titel für neue Deals</span>
          <input value={dealTitel} onChange={(e) => setDealTitel(e.target.value)} placeholder={DEFAULT_DEAL_TITEL} />
        </label>
      </div>
      <FormError error={error} />
      <div className="form-actions">
        <button type="button" className="button primary" onClick={speichern} disabled={busy}>
          {busy ? 'Speichert …' : 'Speichern'}
        </button>
      </div>
    </Card>
  );
}

/** Nothing to set up: the tables come from migrations (db/migrationen). */
function DatenbankKarte() {
  return (
    <Card
      title="1. Datenbank"
      actions={
        <Link className="button small" to="/einrichtung/daten/firmen">
          Daten ansehen
        </Link>
      }
    >
      <p className="muted">
        Die Daten liegen in Postgres (Cloud SQL, Datenbank <code>crm</code>). Tabellen und Spalten kommen aus den Migrationen im Repo, hier ist nichts einzurichten. Nachsehen und korrigieren unter <Link to="/einrichtung/daten/firmen">Daten</Link>, jede Änderung steht im Verlauf und lässt sich zurücknehmen.
      </p>
    </Card>
  );
}

function TeamKarte() {
  const { db } = useCrm();
  return (
    <Card title="3. Team & Auswahllisten">
      <p className="muted">
        Gepflegt unter <Link to="/einrichtung/daten/listen">Daten → listen</Link>. Neue Einträge erscheinen nach dem nächsten Laden.
      </p>
      <dl className="items">
        <div className="item">
          <dt>Team</dt>
          <dd>{db?.listen.team.join(', ') || '–'}</dd>
        </div>
        <div className="item">
          <dt>Verlustgründe</dt>
          <dd>{db?.listen.verlustgrund.join(', ') || '–'}</dd>
        </div>
      </dl>
    </Card>
  );
}

/** Phone number and booking page of each team member, shown to clients in the portal next to the people looking after them. */
function TelefonKarte() {
  const { db, mutate } = useCrm();
  const toast = useToast();
  const team = db?.listen.team ?? [];
  const schluessel = [...team.flatMap((n) => [teamTelefonSchluessel(n), teamTerminSchluessel(n)]), EINSTELLUNG.googleBewertung];
  const [werte, setWerte] = useState<Record<string, string>>(() => Object.fromEntries(schluessel.map((k) => [k, db?.einstellungen[k] ?? ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const wert = (k: string) => (werte[k] ?? '').trim();
  const telefonFalsch = team.filter((n) => wert(teamTelefonSchluessel(n)) && !/^\+?[\d\s/()-]{6,}$/.test(wert(teamTelefonSchluessel(n))));
  const linkFalsch = team.filter((n) => wert(teamTerminSchluessel(n)) && !istBuchungslink(wert(teamTerminSchluessel(n))));
  const bewertungFalsch = !!wert(EINSTELLUNG.googleBewertung) && !istBuchungslink(wert(EINSTELLUNG.googleBewertung));

  const speichern = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const bereinigt = Object.fromEntries(Object.entries(werte).map(([k, v]) => [k, v.trim()]));
      await mutate((s) => s.saveEinstellungen(bereinigt));
      setWerte(bereinigt);
      toast.show('Kontaktdaten gespeichert');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const feld = (k: string, label: string, typ: 'tel' | 'url', falsch: boolean, hinweis: string, platzhalter: string) => (
    <label className={`field${falsch ? ' invalid' : ''}`}>
      <span className="field-label">{label}</span>
      <input type={typ} value={werte[k] ?? ''} onChange={(e) => setWerte((w) => ({ ...w, [k]: e.target.value }))} placeholder={platzhalter} />
      {falsch && <small className="field-hint">{hinweis}</small>}
    </label>
  );

  return (
    <Card title="4. Telefon, Termine und Bewertungen im Kundenportal">
      <p className="muted">
        Kunden sehen unter „Dein Team bei Velonify“ die Nummer jeder Person, die für sie zuständig ist, und einen Knopf „Termin buchen“. Calendly und
        Google-Terminbuchung öffnen sich direkt im Portal; bei Google dafür den langen Link nehmen (Buchungsseite → Teilen → „Website-Einbettung“, die Adresse aus
        dem Code), der Kurzlink calendar.app.google öffnet nur in einem neuen Tab. Dauer und Zeiten stellt ihr im jeweiligen Tool ein. Leere Felder erscheinen nicht.
      </p>
      <div className="grid">
        {team.map((n) => (
          <Fragment key={n}>
            {feld(teamTelefonSchluessel(n), `${n} · Telefon`, 'tel', telefonFalsch.includes(n), 'Nur Ziffern, Leerzeichen und + / ( ) -', '+49 …')}
            {feld(teamTerminSchluessel(n), `${n} · Buchungsseite`, 'url', linkFalsch.includes(n), 'Vollständige Adresse mit https://', 'https://calendly.com/… oder https://calendar.google.com/calendar/appointments/…')}
          </Fragment>
        ))}
        {feld(EINSTELLUNG.googleBewertung, 'Google-Bewertungslink', 'url', bewertungFalsch, 'Vollständige Adresse mit https://', 'https://g.page/r/…/review')}
      </div>
      <p className="hint">Den Google-Bewertungslink bieten wir Kunden an, die uns im Portal 5 Sterne geben (Google Unternehmensprofil → „Nach Rezensionen fragen“).</p>
      <FormError error={error} />
      <div className="form-actions">
        <button type="button" className="button primary" onClick={speichern} disabled={busy || telefonFalsch.length + linkFalsch.length > 0 || bewertungFalsch}>
          {busy ? 'Speichert …' : 'Speichern'}
        </button>
      </div>
    </Card>
  );
}

function LinksKarte() {
  const { db, mutate } = useCrm();
  const toast = useToast();
  const [werte, setWerte] = useState<Record<string, string>>(() => Object.fromEntries(FIRMEN_LINKS.map((l) => [l.einstellung, db?.einstellungen[l.einstellung] ?? ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const ungueltig = FIRMEN_LINKS.filter((l) => werte[l.einstellung].trim() && !/^https:\/\/\S+$/i.test(werte[l.einstellung].trim()));

  const speichern = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const bereinigt = Object.fromEntries(Object.entries(werte).map(([k, v]) => [k, v.trim()]));
      await mutate((s) => s.saveEinstellungen(bereinigt));
      setWerte(bereinigt);
      toast.show('Links gespeichert');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="5. Links auf der Startseite">
      <p className="muted">Firmenweite Adressen für den Schnellzugriff. Leere Felder erscheinen nicht auf der Startseite.</p>
      <div className="grid">
        {FIRMEN_LINKS.map((l) => (
          <label key={l.einstellung} className={`field${ungueltig.includes(l) ? ' invalid' : ''}`}>
            <span className="field-label">{l.label}</span>
            <input type="url" value={werte[l.einstellung]} onChange={(e) => setWerte((w) => ({ ...w, [l.einstellung]: e.target.value }))} placeholder="https://…" />
            <small className="field-hint">{ungueltig.includes(l) ? 'Muss mit https:// beginnen.' : l.hinweis}</small>
          </label>
        ))}
      </div>
      <FormError error={error} />
      <div className="form-actions">
        <button type="button" className="button primary" onClick={speichern} disabled={busy || ungueltig.length > 0}>
          {busy ? 'Speichert …' : 'Speichern'}
        </button>
      </div>
    </Card>
  );
}

/** Employees see the hub without money (src/data/rollen.ts); only admins change who that is, crm-api checks again. */
function MitarbeiterKarte() {
  const { db, mutate } = useCrm();
  const { istAdmin } = useMandant();
  const toast = useToast();
  const [text, setText] = useState(() => mitarbeiterListe(db?.einstellungen[MITARBEITER_SCHLUESSEL]).join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const liste = mitarbeiterListe(text);
  const fremd = liste.filter((a) => !a.endsWith(`@${config.allowedDomain}`));

  const speichern = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await mutate((s) => s.saveEinstellungen({ [MITARBEITER_SCHLUESSEL]: liste.join(',') }));
      setText(liste.join(', '));
      toast.show('Mitarbeiter gespeichert');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="6. Mitarbeiter-Zugang">
      <p className="muted">
        Diese Adressen sehen alles außer Geld: kein Angebots-Rechner, keine Kalkulation, keine Deal-Werte und Preise – im Hub und im Claude-Connector.
      </p>
      <label className={`field${fremd.length ? ' invalid' : ''}`}>
        <span className="field-label">Mitarbeiter</span>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`name@${config.allowedDomain}, …`} disabled={!istAdmin} />
        <small className="field-hint">
          {fremd.length ? `Nur Adressen mit @${config.allowedDomain}.` : istAdmin ? 'Mehrere mit Komma trennen. Gilt nach spätestens einer Minute.' : 'Ändern können nur Admins.'}
        </small>
      </label>
      <FormError error={error} />
      {istAdmin && (
        <div className="form-actions">
          <button type="button" className="button primary" onClick={speichern} disabled={busy || fremd.length > 0}>
            {busy ? 'Speichert …' : 'Speichern'}
          </button>
        </div>
      )}
    </Card>
  );
}

export function EinrichtungPage() {
  const { db, error } = useCrm();
  return (
    <div className="page narrow">
      <PageHeader
        eyebrow="System"
        title="Einrichtung"
        subtitle={isDemo ? 'Demo-Modus: Alles läuft mit Beispieldaten im Browser.' : `Angemeldet für @${config.allowedDomain}`}
      />
      {isDemo && (
        <div className="hint-box">
          Für echte Daten fehlen noch <strong>GOOGLE_CLIENT_ID</strong> und <strong>CRM_API_URL</strong> – siehe README im Repo, Abschnitt „Einrichtung“.
        </div>
      )}
      {error && !(error instanceof AuthExpiredError) && <p className="alert error">{errorMessage(error)}</p>}
      <DatenbankKarte />
      {/* Remount once data is there, so the fields start with the saved values. */}
      <DriveKarte key={db ? 'drive-bereit' : 'drive-laedt'} />
      <TeamKarte />
      <TelefonKarte key={db ? 'telefon-bereit' : 'telefon-laedt'} />
      <LinksKarte key={db ? 'links-bereit' : 'links-laedt'} />
      <MitarbeiterKarte key={db ? 'mitarbeiter-bereit' : 'mitarbeiter-laedt'} />
    </div>
  );
}
