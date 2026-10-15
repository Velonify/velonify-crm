import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Schalter } from '../components/Schalter';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, Loading } from '../components/ui';
import type { CrmService } from '../data/crm';
import { CLIENT_SHARE_ORDNER } from '../data/kunden';
import { fahrplanStand, kannPortalZugang, KUNDEN_WERKZEUGE, MEILENSTEIN_STATUS_LABEL, meilensteineVon, portalSicht, werkzeugAktiv, zugangVon } from '../data/portal';
import { kontaktName } from '../data/rules';
import { boardVon } from '../data/todos';
import type { Database, Firma, KundenDaten, Meilenstein, PortalDaten, TodoDaten } from '../data/types';
import { errorMessage } from '../lib/errors';
import { formatDate, formatDateTime } from '../lib/format';
import { MeilensteinDialog, type Aendern } from './Dialoge';
import { usePortalDaten } from './usePortalDaten';
import { useAuth } from '../auth/AuthContext';
import { config, isDemo } from '../config';

/** The "Portal" tab of a client page: who may log in, which client tools are on, the roadmap and what the client sees. */
export function Portal({ firma, db, kunden, todos }: { firma: Firma; db: Database; kunden?: KundenDaten; todos?: TodoDaten }) {
  const portal = usePortalDaten();
  if (portal.error) return <ErrorBox error={portal.error} onRetry={portal.reload} />;
  if (!portal.data) return <Loading />;
  return (
    <div className="akte">
      <div className="akte-main">
        <Zugaenge firma={firma} db={db} portal={portal.data} aendern={portal.aendern} />
        <Fahrplan firma={firma} portal={portal.data} aendern={portal.aendern} />
      </div>
      <div className="akte-side">
        <Werkzeuge firma={firma} portal={portal.data} aendern={portal.aendern} />
        <Sichtbar firma={firma} kunden={kunden} todos={todos} portal={portal.data} />
      </div>
    </div>
  );
}

/** Runs one switch at a time and reports failures as a toast. */
function useSchalten(aendern: Aendern) {
  const toast = useToast();
  const [laeuft, setLaeuft] = useState('');
  const schalten = async (schluessel: string, action: (s: CrmService) => Promise<unknown>, meldung: string) => {
    setLaeuft(schluessel);
    try {
      await aendern(action);
      toast.show(meldung);
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setLaeuft('');
    }
  };
  return { laeuft, schalten };
}

function Zugaenge({ firma, db, portal, aendern }: { firma: Firma; db: Database; portal: PortalDaten; aendern: Aendern }) {
  const { laeuft, schalten } = useSchalten(aendern);
  const kontakte = db.kontakte.filter((k) => k.firma_id === firma.id && !k.archiviert).sort((a, b) => Number(b.hauptkontakt) - Number(a.hauptkontakt));
  return (
    <Card title="Zugänge">
      {kontakte.length === 0 && (
        <p className="muted">
          Noch keine Kontakte. In der <Link to={`/crm/firmen/${firma.id}`}>CRM-Akte</Link> anlegen, dann hier freischalten.
        </p>
      )}
      <ul className="portal-liste">
        {kontakte.map((k) => {
          const zugang = zugangVon(portal.zugaenge, k.id);
          const aktiv = Boolean(zugang?.aktiv);
          const moeglich = kannPortalZugang(k);
          return (
            <li key={k.id}>
              <div>
                <span className="row-title">{kontaktName(k)}</span>
                <div className="row-sub">
                  {[k.rolle, k.email].filter(Boolean).join(' · ') || 'keine Angaben'}
                  <br />
                  {aktiv ? (zugang?.zuletzt_am ? `Zuletzt angemeldet ${formatDateTime(zugang.zuletzt_am)}` : 'Hat Zugang, noch nicht angemeldet') : moeglich ? 'Kein Zugang' : 'Keine E-Mail-Adresse – in der CRM-Akte ergänzen'}
                </div>
              </div>
              <Schalter
                an={aktiv}
                label={`Portal-Zugang für ${kontaktName(k)}`}
                disabled={laeuft !== '' || (!aktiv && !moeglich)}
                onChange={(an) => void schalten(k.id, (s) => s.setPortalZugang(firma.id, k.id, an), an ? `${kontaktName(k)} hat jetzt Zugang` : `Zugang für ${kontaktName(k)} gesperrt`)}
              />
            </li>
          );
        })}
      </ul>
      <p className="hint">Angemeldet wird per Link an die E-Mail-Adresse, ohne Passwort. Das Portal selbst kommt im nächsten Schritt, bis dahin bereitet ihr hier die Zugänge vor.</p>
    </Card>
  );
}

function Fahrplan({ firma, portal, aendern }: { firma: Firma; portal: PortalDaten; aendern: Aendern }) {
  const [dialog, setDialog] = useState<{ meilenstein?: Meilenstein } | null>(null);
  const [archiv, setArchiv] = useState(false);
  const aktive = meilensteineVon(portal.meilensteine, firma.id);
  const liste = meilensteineVon(portal.meilensteine, firma.id, archiv);
  const stand = fahrplanStand(aktive);

  return (
    <Card
      title={
        <>
          Fahrplan <span className="count">{aktive.length}</span>
        </>
      }
      actions={
        <button type="button" className="button small" onClick={() => setDialog({})}>
          + Etappe
        </button>
      }
    >
      {aktive.length === 0 ? (
        <p className="muted">Die Etappen des Projekts, z. B. Migration, Design & Inhalte, Go-live. Der Kunde sieht sie als Fortschrittsbalken.</p>
      ) : (
        <>
          <div className="fahrplan-balken" aria-hidden="true">
            {aktive.map((m) => (
              <span key={m.id} className={`is-${m.status}`} title={m.titel} />
            ))}
          </div>
          <p className="row-sub">
            {stand.aktuell ? `Jetzt dran: ${stand.aktuell.titel}` : 'Alle Etappen erledigt'}
            {stand.ziel && ` · ${stand.ziel.titel} am ${formatDate(stand.ziel.datum)}`}
          </p>
        </>
      )}
      <ul className="portal-liste">
        {liste.map((m) => {
          const index = aktive.findIndex((a) => a.id === m.id);
          return (
            <li key={m.id} className={m.archiviert ? 'is-archived' : ''}>
              <div>
                <span className="row-title">{m.titel}</span>
                <div className="row-sub">
                  <span className={`badge etappe-${m.status}`}>{MEILENSTEIN_STATUS_LABEL[m.status]}</span>
                  {m.datum ? formatDate(m.datum) : 'ohne Datum'}
                  {m.archiviert && <span className="badge archived">Entfernt</span>}
                </div>
              </div>
              <div className="card-actions">
                {!m.archiviert && (
                  <>
                    <button type="button" className="button small subtle" onClick={() => void aendern((s) => s.verschiebeMeilenstein(m.id, -1))} disabled={index <= 0} aria-label={`${m.titel} nach vorne`}>
                      ↑
                    </button>
                    <button type="button" className="button small subtle" onClick={() => void aendern((s) => s.verschiebeMeilenstein(m.id, 1))} disabled={index === aktive.length - 1} aria-label={`${m.titel} nach hinten`}>
                      ↓
                    </button>
                  </>
                )}
                <button type="button" className="button small" onClick={() => setDialog({ meilenstein: m })}>
                  Bearbeiten
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {portal.meilensteine.some((m) => m.firma_id === firma.id && m.archiviert) && (
        <label className="checkbox archiv-schalter">
          <input type="checkbox" checked={archiv} onChange={(e) => setArchiv(e.target.checked)} />
          Entfernte zeigen
        </label>
      )}
      {dialog && <MeilensteinDialog firma={firma} meilenstein={dialog.meilenstein} aendern={aendern} onClose={() => setDialog(null)} />}
    </Card>
  );
}

function Werkzeuge({ firma, portal, aendern }: { firma: Firma; portal: PortalDaten; aendern: Aendern }) {
  const { laeuft, schalten } = useSchalten(aendern);
  return (
    <Card title="Werkzeuge freischalten">
      <ul className="portal-liste">
        {KUNDEN_WERKZEUGE.map((w) => {
          const bald = 'bald' in w && w.bald;
          const an = werkzeugAktiv(portal.werkzeuge, firma.id, w.id);
          return (
            <li key={w.id}>
              <div>
                <span className="row-title">{w.titel}</span>
                <div className="row-sub">{bald ? 'kommt später' : w.text}</div>
              </div>
              <Schalter
                an={an}
                label={w.titel}
                disabled={laeuft !== '' || (bald && !an)}
                onChange={(neu) => void schalten(w.id, (s) => s.setPortalWerkzeug(firma.id, w.id, neu), neu ? `${w.titel} freigeschaltet` : `${w.titel} ausgeblendet`)}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Sichtbar({ firma, kunden, todos, portal }: { firma: Firma; kunden?: KundenDaten; todos?: TodoDaten; portal: PortalDaten }) {
  const board = todos ? boardVon(todos.boards, firma.id) : undefined;
  const sicht = portalSicht(firma.id, board?.id, kunden, todos, portal);
  const zeile = (label: string, wert: ReactNode) => (
    <div className="item">
      <dt>{label}</dt>
      <dd>{wert}</dd>
    </div>
  );
  return (
    <Card title="Was der Kunde sieht" actions={<AlsKundeAnsehen firma={firma} />}>
      <dl className="items">
        {zeile('Zugänge', sicht.zugaenge)}
        {zeile('Karten', board ? <Link to={`/kunden/${firma.id}/todos`}>{sicht.karten} von {sicht.kartenGesamt}</Link> : <span className="muted">noch kein Board</span>)}
        {zeile('Freigaben', sicht.freigabenOffen ? `${sicht.freigabenOffen} offen` : 'keine offen')}
        {zeile('News', <Link to={`/kunden/${firma.id}/news`}>{sicht.news}</Link>)}
        {zeile('Links', <Link to={`/kunden/${firma.id}/tools`}>{sicht.links}</Link>)}
        {zeile('Dateien', firma.drive_ordner_id ? <Link to={`/kunden/${firma.id}/dateien`}>Ordner {CLIENT_SHARE_ORDNER}</Link> : <span className="muted">kein Kundenordner</span>)}
        {zeile('Werkzeuge', sicht.werkzeuge)}
        {zeile('Fahrplan', sicht.meilensteine ? `${sicht.meilensteine} Etappen` : <span className="muted">leer</span>)}
      </dl>
      <p className="hint">Karten, News und Links zeigt das Portal nur mit „Für den Kunden sichtbar“. „Freigabe anfragen“ auf einer Karte setzt sie beim Kunden unter „Für dich zu tun“.</p>
    </Card>
  );
}

/**
 * Opens the client's portal in a new tab as a read-only preview: the portal function checks the hub's Google token
 * and hands out an 8-hour preview session, which goes to the portal in the address (#/vorschau/<session>).
 */
function AlsKundeAnsehen({ firma }: { firma: Firma }) {
  const { getToken } = useAuth();
  const toast = useToast();
  const [laeuft, setLaeuft] = useState(false);
  if (isDemo || !config.kundenportalApiUrl) return null;

  const oeffnen = async () => {
    // Open the tab right away: browsers block windows that open only after an await.
    const fenster = window.open('about:blank', '_blank');
    setLaeuft(true);
    try {
      const antwort = await fetch(`${config.kundenportalApiUrl}/vorschau`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firma_id: firma.id }),
      });
      const daten = (await antwort.json().catch(() => ({}))) as { sitzung?: string; fehler?: string };
      if (!antwort.ok || !daten.sitzung) throw new Error(daten.fehler || 'Die Vorschau konnte nicht geöffnet werden.');
      const ziel = `${config.kundenportalUrl}/#/vorschau/${daten.sitzung}`;
      if (fenster) fenster.location.href = ziel;
      else window.open(ziel, '_blank');
    } catch (err) {
      fenster?.close();
      toast.show(errorMessage(err), 'error');
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <button type="button" className="button small" onClick={() => void oeffnen()} disabled={laeuft} title="Öffnet das Kundenportal dieser Firma in einem neuen Tab, nur zum Ansehen">
      {laeuft ? 'Öffnet …' : 'Als Kunde ansehen ↗'}
    </button>
  );
}
