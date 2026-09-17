import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCrm } from '../../data/CrmContext';
import { driveFolderUrl, isFolder } from '../../data/google/drive';
import { driveKonfiguration } from '../../data/selectors';
import type { Database, Firma } from '../../data/types';
import { isDemo } from '../../config';
import { formatDateTime } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { LeadOrdnerDialog } from '../dialogs/LeadOrdnerDialog';
import { TerminDialog } from '../dialogs/TerminDialog';
import { Card, ErrorBox, Loading } from '../ui';

const ORT_LABEL = { leads: '02_Sales/01_Leads', clients: '01_Clients', andere: 'anderer Ort' } as const;

export function DriveKarte({ firma, db }: { firma: Firma; db: Database }) {
  const { service, perform } = useCrm();
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const konfig = driveKonfiguration(db.einstellungen);

  const ordner = useLoad(
    async () => {
      if (!service || !firma.drive_ordner_id) return null;
      const [ort, inhalt] = await Promise.all([service.ordnerOrt(db, firma), service.ordnerInhalt(firma)]);
      return { ort, inhalt };
    },
    // Reload when the folder changes; not on every data refresh.
    [service, firma.drive_ordner_id, firma.geaendert_am],
  );

  const verschieben = async () => {
    setBusy(true);
    await perform((s) => s.verschiebeNachClients(firma.id), 'Ordner nach 01_Clients verschoben');
    setBusy(false);
    ordner.reload();
  };

  const link = (id: string, webViewLink?: string) => (isDemo ? undefined : webViewLink ?? driveFolderUrl(id));

  return (
    <Card
      title="Google Drive"
      actions={
        firma.drive_ordner_id && (
          <a className="button small" href={link(firma.drive_ordner_id)} target="_blank" rel="noreferrer noopener" aria-disabled={isDemo}>
            Öffnen ↗
          </a>
        )
      }
    >
      {!firma.drive_ordner_id && (
        <>
          <p className="muted">Noch kein Ordner verknüpft.</p>
          {konfig ? (
            <button type="button" className="button small" onClick={() => setDialog(true)} disabled={firma.archiviert}>
              Lead-Ordner anlegen
            </button>
          ) : (
            <p className="muted small">
              Automatisches Anlegen ist noch nicht eingerichtet (<Link to="/einrichtung">Einrichtung</Link>). Einen vorhandenen Ordner kannst du unter
              „Bearbeiten“ verlinken.
            </p>
          )}
        </>
      )}

      {firma.drive_ordner_id && ordner.loading && !ordner.data && <Loading label="Ordner wird geladen …" />}
      {firma.drive_ordner_id && ordner.error && <ErrorBox error={ordner.error} onRetry={ordner.reload} />}
      {ordner.data && (
        <>
          {ordner.data.ort && (
            <p className="row-sub">
              Liegt in <strong>{ORT_LABEL[ordner.data.ort]}</strong>
            </p>
          )}
          {ordner.data.ort === 'leads' && konfig && !firma.archiviert && (
            <button type="button" className="button small" onClick={verschieben} disabled={busy}>
              {busy ? 'Verschiebt …' : 'Nach 01_Clients verschieben'}
            </button>
          )}
          {ordner.data.inhalt.length === 0 ? (
            <p className="muted">Der Ordner ist leer.</p>
          ) : (
            <ul className="file-list">
              {ordner.data.inhalt.slice(0, 12).map((datei) => (
                <li key={datei.id}>
                  <span className="file-kind">{isFolder(datei) ? 'Ordner' : 'Datei'}</span>
                  <a href={link(datei.id, datei.webViewLink)} target="_blank" rel="noreferrer noopener">
                    {datei.name}
                  </a>
                  {!isFolder(datei) && datei.modifiedTime && <span className="muted small">{formatDateTime(datei.modifiedTime)}</span>}
                </li>
              ))}
            </ul>
          )}
          {ordner.data.inhalt.length > 12 && <p className="muted small">… und {ordner.data.inhalt.length - 12} weitere</p>}
        </>
      )}
      {dialog && <LeadOrdnerDialog firma={firma} onClose={() => setDialog(false)} />}
    </Card>
  );
}

export function TermineKarte({ firma, db }: { firma: Firma; db: Database }) {
  const { service } = useCrm();
  const [dialog, setDialog] = useState(false);
  const emails = db.kontakte
    .filter((k) => k.firma_id === firma.id && !k.archiviert && k.email)
    .map((k) => k.email)
    .join(',');
  const termine = useLoad(async () => (service && emails ? service.termineMitFirma(db, firma.id) : []), [service, firma.id, emails, db.aktivitaeten.length]);
  const jetzt = new Date().toISOString();
  const kommend = (termine.data ?? []).filter((t) => t.ende >= jetzt).reverse();
  const vergangen = (termine.data ?? []).filter((t) => t.ende < jetzt).slice(0, 5);

  return (
    <Card
      title="Termine"
      actions={
        <button type="button" className="button small" onClick={() => setDialog(true)} disabled={firma.archiviert}>
          + Termin
        </button>
      }
    >
      {!emails && <p className="muted">Termine erscheinen hier, sobald ein Kontakt mit E-Mail-Adresse angelegt ist.</p>}
      {emails && termine.loading && !termine.data && <Loading label="Kalender wird geladen …" />}
      {termine.error && <ErrorBox error={termine.error} onRetry={termine.reload} />}
      {termine.data && emails && (
        <>
          {kommend.length === 0 && vergangen.length === 0 && <p className="muted">Keine Termine mit Kontakten dieser Firma in deinem Kalender.</p>}
          {kommend.length > 0 && <h3 className="subheading">Kommend</h3>}
          <ul className="event-list">
            {kommend.map((t) => (
              <li key={t.id}>
                <strong>{formatDateTime(t.start)}</strong> {t.titel}
                {t.meetLink && (
                  <>
                    {' · '}
                    <a href={t.meetLink} target="_blank" rel="noreferrer noopener">
                      Meet ↗
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
          {vergangen.length > 0 && <h3 className="subheading">Vergangen</h3>}
          <ul className="event-list past">
            {vergangen.map((t) => (
              <li key={t.id}>
                {formatDateTime(t.start)} {t.titel}
              </li>
            ))}
          </ul>
          <p className="muted small">Aus deinem eigenen Google Kalender – Termine von Kolleg:innen siehst du im Verlauf.</p>
        </>
      )}
      {dialog && <TerminDialog firma={firma} onClose={() => setDialog(false)} />}
    </Card>
  );
}
