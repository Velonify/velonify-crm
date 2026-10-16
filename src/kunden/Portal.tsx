import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Schalter } from '../components/Schalter';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, Field, Loading } from '../components/ui';
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
import { hatQuelle, liesDaten, prepareTracking, trackingVon, veraenderung, type TrackingEingabe } from '../data/tracking';
import { einstellungenVon, KANAELE, KANAL_LABEL, RHYTHMUS_LABEL, UPDATE_RHYTHMEN, type PortalEinstellungen } from '../data/portalBenachrichtigung';
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
        <Tracking firma={firma} portal={portal.data} aendern={portal.aendern} reload={portal.reload} />
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
                {aktiv && zugang && (
                  <EinstellungenZeile
                    werte={einstellungenVon(zugang)}
                    slack={!!firma.slack_channel.trim()}
                    disabled={laeuft !== ''}
                    onChange={(e) => void schalten(`e-${k.id}`, (s) => s.setPortalEinstellungen(zugang.id, e), `Benachrichtigungen für ${kontaktName(k)} gespeichert`)}
                  />
                )}
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
      <p className="hint">Angemeldet wird per Link an die E-Mail-Adresse, ohne Passwort. Updates und Sofort-Benachrichtigungen stellt jede Person im Portal selbst ein; hier könnt ihr sie für sie ändern.</p>
    </Card>
  );
}

/** Summary rhythm and the channels of one login, saved on change. Slack only with a channel at the firm. */
function EinstellungenZeile({ werte, slack, disabled, onChange }: { werte: PortalEinstellungen; slack: boolean; disabled: boolean; onChange: (e: PortalEinstellungen) => void }) {
  const kanal = (name: 'kanal_updates' | 'kanal_hinweise', label: string) => (
    <label>
      <span>{label}</span>
      <select value={werte[name]} disabled={disabled} onChange={(e) => onChange({ ...werte, [name]: e.target.value })}>
        {KANAELE.map((k) => (
          <option key={k} value={k} disabled={k !== 'email' && !slack}>
            {KANAL_LABEL[k]}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="portal-einstellungen">
      <label>
        <span>Updates</span>
        <select value={werte.updates} disabled={disabled} onChange={(e) => onChange({ ...werte, updates: e.target.value as PortalEinstellungen['updates'] })}>
          {UPDATE_RHYTHMEN.map((r) => (
            <option key={r} value={r}>
              {RHYTHMUS_LABEL[r]}
            </option>
          ))}
        </select>
      </label>
      {werte.updates !== 'aus' && kanal('kanal_updates', 'per')}
      {kanal('kanal_hinweise', 'Sofort-Hinweise per')}
    </div>
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

const tausend = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 0 });
const mitVeraenderung = (jetzt: number, vorher: number) => {
  const v = veraenderung(jetzt, vorher);
  return v === null ? '' : ` (${v > 0 ? '+' : ''}${v.toLocaleString('de-DE')} %)`;
};

/**
 * Tracking hub of the client: GA4 property, Search Console property and the page for PageSpeed. The portal function
 * fetches the numbers every morning with analytics@velonify.de; "Jetzt abrufen" does it right away.
 */
function Tracking({ firma, portal, aendern, reload }: { firma: Firma; portal: PortalDaten; aendern: Aendern; reload: () => void }) {
  const { getToken } = useAuth();
  const toast = useToast();
  const t = trackingVon(portal.tracking ?? [], firma.id);
  const [werte, setWerte] = useState<TrackingEingabe>(() => ({
    ga4_property: t?.ga4_property ?? '',
    gsc_site: t?.gsc_site ?? (firma.domain ? `sc-domain:${firma.domain.replace(/^www\./, '')}` : ''),
    pagespeed_url: t?.pagespeed_url ?? (firma.domain ? `https://${firma.domain}/` : ''),
    sichtbar_kunde: t?.sichtbar_kunde ?? false,
  }));
  const [laeuft, setLaeuft] = useState<'' | 'speichern' | 'abrufen'>('');
  const [fehler, setFehler] = useState('');
  const daten = liesDaten(t);
  const geaendert = !t || werte.ga4_property !== t.ga4_property || werte.gsc_site !== t.gsc_site || werte.pagespeed_url !== t.pagespeed_url || werte.sichtbar_kunde !== t.sichtbar_kunde;

  const speichern = async () => {
    setFehler('');
    setLaeuft('speichern');
    try {
      const clean = prepareTracking(werte);
      await aendern((s) => s.saveTracking(firma.id, clean));
      setWerte(clean);
      toast.show('Tracking gespeichert');
    } catch (err) {
      setFehler(errorMessage(err));
    } finally {
      setLaeuft('');
    }
  };

  const abrufen = async () => {
    setFehler('');
    setLaeuft('abrufen');
    try {
      const antwort = await fetch(`${config.kundenportalApiUrl}/kennzahlen`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firma_id: firma.id }),
      });
      const ergebnis = (await antwort.json().catch(() => ({}))) as { fehler?: string | number };
      if (!antwort.ok) throw new Error(typeof ergebnis.fehler === 'string' ? ergebnis.fehler : 'Abruf fehlgeschlagen.');
      reload();
      toast.show(ergebnis.fehler ? 'Abgerufen, mit Hinweisen' : 'Zahlen abgerufen');
    } catch (err) {
      setFehler(errorMessage(err));
    } finally {
      setLaeuft('');
    }
  };

  return (
    <Card title="Tracking">
      <p className="muted small">
        Damit wir die Zahlen lesen dürfen, muss <strong>analytics@velonify.de</strong> in Google Analytics (Property-Zugriff, Rolle „Betrachter“) und in der Search
        Console (Nutzer, „Eingeschränkt“) eingetragen sein – vom Kunden oder von uns.
      </p>
      <div className="grid">
        <Field label="GA4-Property-ID" hint="Verwaltung → Property-Einstellungen, nur Ziffern">
          <input value={werte.ga4_property} onChange={(e) => setWerte((w) => ({ ...w, ga4_property: e.target.value }))} placeholder="123456789" inputMode="numeric" />
        </Field>
        <Field label="Search Console" hint="Domain (beispiel.de) oder URL-Präfix">
          <input value={werte.gsc_site} onChange={(e) => setWerte((w) => ({ ...w, gsc_site: e.target.value }))} placeholder="sc-domain:beispiel.de" />
        </Field>
        <Field label="Seite für PageSpeed" wide>
          <input type="url" value={werte.pagespeed_url} onChange={(e) => setWerte((w) => ({ ...w, pagespeed_url: e.target.value }))} placeholder="https://www.beispiel.de/" />
        </Field>
        <label className="checkbox wide">
          <input type="checkbox" checked={werte.sichtbar_kunde} onChange={(e) => setWerte((w) => ({ ...w, sichtbar_kunde: e.target.checked }))} />
          Im Kundenportal unter „Zahlen“ zeigen
        </label>
      </div>
      {fehler && <p className="alert error">{fehler}</p>}
      <div className="form-actions">
        <button type="button" className="button primary small" onClick={() => void speichern()} disabled={laeuft !== '' || !geaendert}>
          {laeuft === 'speichern' ? 'Speichert …' : 'Speichern'}
        </button>
        {t && hatQuelle(t) && !isDemo && config.kundenportalApiUrl && (
          <button type="button" className="button small" onClick={() => void abrufen()} disabled={laeuft !== '' || geaendert}>
            {laeuft === 'abrufen' ? 'Ruft ab … (bis 1 Min.)' : 'Jetzt abrufen'}
          </button>
        )}
      </div>
      {t?.stand_am && (
        <div className="tracking-stand">
          <span className="row-sub">Stand {formatDateTime(t.stand_am)}</span>
          {daten?.ga4 && <span>GA4: {tausend(daten.ga4.sitzungen)} Sitzungen{mitVeraenderung(daten.ga4.sitzungen, daten.ga4.vorher.sitzungen)}, {tausend(daten.ga4.umsatz)} € Umsatz{mitVeraenderung(daten.ga4.umsatz, daten.ga4.vorher.umsatz)}</span>}
          {daten?.gsc && <span>Suche: {tausend(daten.gsc.klicks)} Klicks{mitVeraenderung(daten.gsc.klicks, daten.gsc.vorher.klicks)}, Position {daten.gsc.position.toLocaleString('de-DE')}</span>}
          {daten?.pagespeed && <span>PageSpeed: mobil {daten.pagespeed.mobil?.score ?? '–'}, Desktop {daten.pagespeed.desktop?.score ?? '–'}</span>}
          {t.fehler && t.fehler.split('\n').map((f) => <span key={f} className="hint-box warn">{f}</span>)}
        </div>
      )}
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
 * Opens the client's portal in a new tab with every function (team access): the portal function checks the hub's
 * Google token and hands out an 8-hour team session, which goes to the portal in the address (#/vorschau/<session>).
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
      if (!antwort.ok || !daten.sitzung) throw new Error(daten.fehler || 'Das Portal konnte nicht geöffnet werden.');
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
    <button type="button" className="button small" onClick={() => void oeffnen()} disabled={laeuft} title="Öffnet das Kundenportal dieser Firma in einem neuen Tab, mit allen Funktionen. Was du dort tust, wird als Velonify gespeichert.">
      {laeuft ? 'Öffnet …' : 'Portal öffnen ↗'}
    </button>
  );
}
