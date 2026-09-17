import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, FormError, Loading, PageHeader } from '../components/ui';
import { config, isDemo, spreadsheetUrl } from '../config';
import { DEFAULT_DEAL_TITEL, DRIVE_ORDNER_NAMEN, EINSTELLUNG } from '../data/constants';
import { useCrm } from '../data/CrmContext';
import { AuthExpiredError } from '../data/errors';
import { driveFolderUrl, type DriveFile } from '../data/google/drive';
import { extractDriveFolderId } from '../data/rules';
import { checkSetup, runSetup } from '../data/sheets/setup';
import { errorMessage } from '../lib/errors';
import { useLoad } from '../lib/useLoad';

function SheetKarte() {
  const { sheets, refresh } = useCrm();
  const { expire } = useAuth();
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<unknown>();
  const status = useLoad(() => (sheets ? checkSetup(sheets) : Promise.resolve(null)), [sheets]);
  const s = status.data;
  const fertig = s?.ready && s.listenRows > 0 && s.tabs.every((t) => t.isProtected);

  const einrichten = async () => {
    if (!sheets) return;
    setRunning(true);
    setRunError(undefined);
    try {
      await runSetup(sheets);
      status.reload();
      await refresh();
    } catch (err) {
      if (err instanceof AuthExpiredError) expire();
      setRunError(err);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card
      title="1. Google Sheet"
      actions={
        !isDemo && (
          <a className="button small" href={spreadsheetUrl(config.spreadsheetId)} target="_blank" rel="noreferrer noopener">
            Sheet öffnen ↗
          </a>
        )
      }
    >
      <p className="muted">
        Legt fehlende Tabellenblätter und Spalten an, ohne vorhandene Daten oder eigene Spalten anzufassen. Kann gefahrlos mehrfach ausgeführt werden.
      </p>
      {status.loading && !s && <Loading label="Sheet wird geprüft …" />}
      {status.error && <ErrorBox error={status.error} onRetry={status.reload} />}
      {s && (
        <table className="table compact">
          <thead>
            <tr>
              <th>Tabellenblatt</th>
              <th>Status</th>
              <th className="hide-sm">Schutz</th>
            </tr>
          </thead>
          <tbody>
            {s.tabs.map((tab) => (
              <tr key={tab.name}>
                <td>
                  <code>{tab.name}</code>
                </td>
                <td>
                  {!tab.exists ? (
                    <span className="badge warn">fehlt</span>
                  ) : tab.missingColumns.length > 0 ? (
                    <span className="badge warn" title={tab.missingColumns.join(', ')}>
                      {tab.missingColumns.length} Spalten fehlen
                    </span>
                  ) : (
                    <span className="badge ok">vollständig</span>
                  )}
                </td>
                <td className="hide-sm">{tab.isProtected ? 'Warnhinweis aktiv' : <span className="muted">–</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <FormError error={runError} />
      <div className="form-actions">
        <button type="button" className="button" onClick={status.reload} disabled={status.loading || running}>
          Erneut prüfen
        </button>
        <button type="button" className="button primary" onClick={einrichten} disabled={!s || running || fertig}>
          {running ? 'Richtet ein …' : fertig ? '✓ Eingerichtet' : 'Einrichten'}
        </button>
      </div>
    </Card>
  );
}

type OrdnerSchluessel = keyof typeof DRIVE_ORDNER_NAMEN;
const ORDNER: { key: OrdnerSchluessel; einstellung: string; label: string; hinweis: string }[] = [
  { key: 'leads', einstellung: EINSTELLUNG.leadsOrdner, label: 'Lead-Ordner', hinweis: '02_Sales/01_Leads – hier entstehen neue Lead-Ordner' },
  { key: 'clients', einstellung: EINSTELLUNG.clientsOrdner, label: 'Kunden-Ordner', hinweis: '01_Clients – hierhin wandern Leads bei „Angebot“' },
  { key: 'vorlage', einstellung: EINSTELLUNG.vorlageOrdner, label: 'Ordnervorlage', hinweis: '03_Templates/01_Client-Folder-Template (optional)' },
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

function TeamKarte() {
  const { db } = useCrm();
  return (
    <Card title="3. Team & Auswahllisten">
      <p className="muted">
        Gepflegt im Tabellenblatt <code>listen</code> (Spalten <code>liste</code> und <code>wert</code>). Neue Einträge erscheinen nach dem nächsten Laden.
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

export function EinrichtungPage() {
  const { db, error } = useCrm();
  return (
    <div className="page narrow">
      <PageHeader
        eyebrow="System"
        title="Einrichtung"
        subtitle={isDemo ? 'Demo-Modus: Alles läuft mit einem Beispiel-Sheet im Browser.' : `Angemeldet für @${config.allowedDomain}`}
      />
      {isDemo && (
        <div className="hint-box">
          Für echte Daten fehlen noch <strong>GOOGLE_CLIENT_ID</strong> und <strong>SPREADSHEET_ID</strong> – siehe README im Repo, Abschnitt „Einrichtung“.
        </div>
      )}
      {error && !(error instanceof AuthExpiredError) && <p className="alert error">{errorMessage(error)}</p>}
      <SheetKarte />
      {/* Remount once data is there, so the fields start with the saved values. */}
      <DriveKarte key={db ? 'bereit' : 'laedt'} />
      <TeamKarte />
    </div>
  );
}
