import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, Loading, PageHeader } from '../components/ui';
import {
  AUDIT_STATUS,
  aufhaengerVon,
  befundeVon,
  bereichLabel,
  domainSchluessel,
  istVeraltet,
  merkmaleVon,
  nichtGeprueftVon,
  plattformLabel,
  sekunden,
  speedVon,
  TRAFFIC_LABEL,
  type Befund,
  type Bereich,
  type Merkmale,
  type Messung,
  type Technologie,
} from '../data/audit';
import { EOL_LABEL } from '../data/constants';
import { useCrm } from '../data/CrmContext';
import { EMPTY_FIRMA_INPUT, type Audit } from '../data/types';
import { errorMessage } from '../lib/errors';
import { formatDateTime, shortUser, websiteUrl } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import { SchwereBadge, Score } from './AuditTeile';
import { useAuditPruefen, useAudits } from './useAudits';

function Item({ label, children }: { label: string; children: ReactNode }) {
  const leer = children === '' || children === null || children === undefined || children === false;
  return (
    <div className="item">
      <dt>{label}</dt>
      <dd>{leer ? <span className="muted">–</span> : children}</dd>
    </div>
  );
}

const JA = <span className="audit-ja">ja</span>;
const NEIN = <span className="warn-text">nein</span>;
const jaNein = (wert: boolean | null | undefined) => (wert === null || wert === undefined ? <span className="muted">nicht geprüft</span> : wert ? JA : NEIN);
const liste = (werte: string[]) => (werte.length ? werte.join(', ') : <span className="muted">keine erkannt</span>);

function Befunde({ befunde }: { befunde: Befund[] }) {
  if (befunde.length === 0) return <p className="muted small">Keine Befunde in diesem Bereich.</p>;
  return (
    <ul className="befund-liste">
      {befunde.map((b) => (
        <li key={b.id}>
          <SchwereBadge schwere={b.schwere} /> {b.text}
        </li>
      ))}
    </ul>
  );
}

const kib = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString('de-DE')} KiB`;

/** Technology categories in the order that matters for outreach; everything else follows alphabetically. */
const KATEGORIE_REIHENFOLGE = [
  'Ecommerce', 'Ecommerce frontends', 'Payment processors', 'Buy now pay later', 'Analytics', 'Tag managers', 'Advertising', 'Marketing automation',
  'Email', 'Cookie compliance', 'Reviews', 'Live chat', 'Personalisation', 'A/B Testing', 'Search engines', 'CDN', 'Hosting',
];
const KATEGORIE_DE: Record<string, string> = {
  Ecommerce: 'Shopsystem', 'Ecommerce frontends': 'Shop-Frontend', 'Payment processors': 'Zahlung', 'Buy now pay later': 'Kauf auf Raten',
  Analytics: 'Analyse', 'Tag managers': 'Tag-Manager', Advertising: 'Werbung', 'Marketing automation': 'Automation', Email: 'E-Mail',
  'Cookie compliance': 'Consent', Reviews: 'Bewertungen', 'Live chat': 'Live-Chat', Personalisation: 'Personalisierung', 'Search engines': 'Suche',
  'JavaScript libraries': 'JS-Bibliotheken', 'JavaScript frameworks': 'JS-Frameworks', 'UI frameworks': 'UI-Frameworks', 'Web frameworks': 'Web-Frameworks', 'Web servers': 'Webserver',
  'Programming languages': 'Sprache', Databases: 'Datenbank', 'Reverse proxies': 'Proxy', Miscellaneous: 'Sonstiges', Performance: 'Performance', 'Video players': 'Video', Security: 'Sicherheit', 'Shipping carriers': 'Versand', 'Font scripts': 'Schriften', Maps: 'Karten',
};

function TechnikKarte({ technologien }: { technologien: Technologie[] }) {
  const gruppen = new Map<string, Technologie[]>();
  for (const t of technologien) {
    const kat = t.kategorien[0] ?? 'Sonstiges';
    gruppen.set(kat, [...(gruppen.get(kat) ?? []), t]);
  }
  const rang = (k: string) => (KATEGORIE_REIHENFOLGE.includes(k) ? KATEGORIE_REIHENFOLGE.indexOf(k) : 100);
  const sortiert = [...gruppen.entries()].sort(([a], [b]) => rang(a) - rang(b) || a.localeCompare(b));
  return (
    <Card title={`Erkannte Technik (${technologien.length})`}>
      <dl className="items">
        {sortiert.map(([kat, liste]) => (
          <Item key={kat} label={KATEGORIE_DE[kat] ?? kat}>
            {liste.map((t) => `${t.name}${t.version ? ` ${t.version}` : ''}`).join(', ')}
          </Item>
        ))}
      </dl>
      <p className="muted small">Erkannt mit den Merkmalen von webappanalyzer (Wappalyzer-Daten), inklusive Scripten, die erst der Tag Manager nachlädt.</p>
    </Card>
  );
}

function SpeedDetails({ mobil }: { mobil: Messung }) {
  return (
    <>
      {mobil.bremsen && mobil.bremsen.length > 0 && (
        <>
          <h3 className="subheading">Größte Bremsen laut Google</h3>
          <ul className="befund-liste">
            {mobil.bremsen.map((b) => (
              <li key={b.id}>
                {b.titel}
                {b.anzeige && <span className="muted"> · {b.anzeige}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {mobil.drittanbieter && mobil.drittanbieter.length > 0 && (
        <>
          <h3 className="subheading">Fremd-Scripte</h3>
          <ul className="befund-liste">
            {mobil.drittanbieter.map((d) => (
              <li key={d.name}>
                {d.name} <span className="muted">· {d.ms} ms Rechenzeit, {d.kb.toLocaleString('de-DE')} KB</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Merkmalbloecke({ audit, m, befunde }: { audit: Audit; m: Merkmale | null; befunde: Befund[] }) {
  const { mobil } = speedVon(audit);
  const von = (...bereiche: Bereich[]) => befunde.filter((b) => bereiche.includes(b.bereich));
  return (
    <div className="audit-bloecke">
      <Card title={bereichLabel('plattform')}>
        <dl className="items">
          <Item label="Shopsystem">{plattformLabel(audit.plattform)}</Item>
          <Item label="Version">{audit.version !== '1' && audit.version}</Item>
          <Item label="Support">{audit.eol && (EOL_LABEL[audit.eol] ?? audit.eol)}</Item>
          <Item label="HTTPS">{m && jaNein(m.https)}</Item>
        </dl>
        <Befunde befunde={von('plattform')} />
      </Card>
      <Card title={bereichLabel('geschwindigkeit')}>
        <dl className="items">
          <Item label="PageSpeed mobil">
            <Score wert={audit.score_mobil} />
          </Item>
          <Item label="PageSpeed Desktop">
            <Score wert={audit.score_desktop} />
          </Item>
          <Item label="Hauptinhalt mobil (LCP)">{audit.lcp_mobil_ms !== null && sekunden(audit.lcp_mobil_ms)}</Item>
          <Item label="Verschiebung (CLS)">{audit.cls !== null && audit.cls.toLocaleString('de-DE')}</Item>
          <Item label="Reaktion (INP)">{audit.inp_ms !== null && `${audit.inp_ms} ms`}</Item>
          <Item label="Erster Inhalt (FCP)">{mobil?.fcp_ms != null && sekunden(mobil.fcp_ms)}</Item>
          <Item label="Blockiert (TBT)">{mobil?.tbt_ms != null && sekunden(mobil.tbt_ms)}</Item>
          <Item label="Server-Antwort (TTFB)">{mobil?.ttfb_ms != null && sekunden(mobil.ttfb_ms)}</Item>
          <Item label="Seitengewicht">{mobil?.bytes != null && kib(mobil.bytes)}</Item>
          <Item label="Messung">{audit.messquelle && (audit.messquelle === 'feld' ? 'Echte Nutzer (Chrome UX Report)' : 'Labormessung')}</Item>
          <Item label="Traffic-Signal">{mobil?.felddaten && TRAFFIC_LABEL[mobil.felddaten]}</Item>
        </dl>
        <Befunde befunde={von('geschwindigkeit')} />
        {mobil && <SpeedDetails mobil={mobil} />}
      </Card>
      <Card title="Tracking & E-Mail">
        {m ? (
          <dl className="items">
            <Item label="Analyse">
              {[m.analyse.ga4 && 'GA4', m.analyse.gtm && 'Tag Manager', m.analyse.universal_analytics && 'Universal Analytics', ...(m.analyse.andere ?? [])].filter(Boolean).join(', ') || <span className="warn-text">keine</span>}
            </Item>
            <Item label="Werbe-Pixel">{liste(m.pixel)}</Item>
            <Item label="Google Ads">{jaNein(m.google_ads)}</Item>
            <Item label="Consent-Tool">{liste(m.consent)}</Item>
            <Item label="E-Mail-Tool">{liste(m.email_tools)}</Item>
            <Item label="Newsletter-Anmeldung">{jaNein(m.newsletter_formular)}</Item>
          </dl>
        ) : (
          <p className="muted small">Nicht geprüft.</p>
        )}
        <Befunde befunde={von('tracking', 'email')} />
      </Card>
      <Card title="Shop & SEO">
        {m ? (
          <dl className="items">
            <Item label="Zahlarten">{liste(m.zahlarten)}</Item>
            <Item label="Bewertungen">{liste(m.bewertungen)}</Item>
            <Item label="Sprachen">{m.sprachen.join(', ')}</Item>
            <Item label="Title">{m.seo.title}</Item>
            <Item label="Meta-Description">{jaNein(m.seo.meta_description)}</Item>
            <Item label="Sitemap">{jaNein(m.seo.sitemap)}</Item>
            <Item label="Produkt-Markup">{jaNein(m.seo.product_markup)}</Item>
          </dl>
        ) : (
          <p className="muted small">Nicht geprüft.</p>
        )}
        <Befunde befunde={von('shop', 'seo')} />
      </Card>
      {m?.technologien && m.technologien.length > 0 && <TechnikKarte technologien={m.technologien} />}
    </div>
  );
}

export function AuditDetailPage() {
  const { id = '' } = useParams();
  const { db, service, mutate } = useCrm();
  const audits = useAudits();
  const { pruefe, bereit } = useAuditPruefen();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState<'' | 'pruefen' | 'anlegen'>('');
  const leistungen = useLoad(async () => (service ? (await service.loadContactDaten().catch(() => ({ leistungen: [] }))).leistungen : []), [service]);

  const audit = audits.data?.find((a) => a.id === id);
  const firma = audit?.firma_id ? db?.firmen.find((f) => f.id === audit.firma_id) : undefined;
  const bekannteFirma = useMemo(
    () => (audit && !audit.firma_id ? db?.firmen.find((f) => !f.archiviert && f.domain && domainSchluessel(f.domain) === domainSchluessel(audit.domain)) : undefined),
    [audit, db],
  );
  const verlauf = useMemo(
    () =>
      (audits.data ?? [])
        .filter((a) => a.id !== id && !a.archiviert && audit && (audit.firma_id ? a.firma_id === audit.firma_id : !a.firma_id && domainSchluessel(a.domain) === domainSchluessel(audit.domain)))
        .sort((a, b) => b.geprueft_am.localeCompare(a.geprueft_am)),
    [audits.data, audit, id],
  );

  if (!db || (!audits.data && !audits.error)) return <div className="page">{<Loading label="Audit wird geladen …" />}</div>;
  if (audits.error) return <div className="page"><ErrorBox error={audits.error} onRetry={audits.reload} /></div>;
  if (!audit) {
    return (
      <div className="page">
        <PageHeader eyebrow="Shop-Audit" title="Audit nicht gefunden" />
        <p>
          Dieses Audit gibt es nicht (mehr). <Link to="/audit">Zur Übersicht</Link>
        </p>
      </div>
    );
  }

  const befunde = befundeVon(audit);
  const aufhaenger = aufhaengerVon(audit);
  const nichtGeprueft = nichtGeprueftVon(audit);
  const merkmale = merkmaleVon(audit);
  const zielFirma = firma ?? bekannteFirma;
  const titelVon = (leistungId: string) => leistungen.data?.find((l) => l.id === leistungId)?.titel ?? 'Leistung';
  const nachLeistung = [...new Set(aufhaenger.map((a) => a.leistung_id))];

  const neuPruefen = async () => {
    setBusy('pruefen');
    try {
      const { audit: neu } = await pruefe(domainSchluessel(audit.domain), zielFirma?.id ?? '');
      audits.reload();
      navigate(`/audit/${neu.id}`, { replace: true });
      toast.show('Neu geprüft');
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy('');
    }
  };

  const alsLeadAnlegen = async () => {
    setBusy('anlegen');
    try {
      const domain = domainSchluessel(audit.domain);
      const neu = await mutate((s) => s.createFirma({ ...EMPTY_FIRMA_INPUT, name: domain, domain, status: 'lead', plattform: audit.plattform === 'unbekannt' ? '' : audit.plattform, version: audit.version === '1' ? '' : audit.version, eol: audit.eol === 'unknown' ? '' : audit.eol, quelle: 'Shop-Audit' }));
      await mutate((s) => s.ordneAuditZu(audit.id, neu.id, audit.geaendert_am));
      audits.reload();
      toast.show('Als Lead angelegt. Namen und Ansprechpartner bitte in der Firmenakte ergänzen.');
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy('');
    }
  };

  const zuordnen = async () => {
    if (!bekannteFirma) return;
    try {
      await mutate((s) => s.ordneAuditZu(audit.id, bekannteFirma.id, audit.geaendert_am));
      audits.reload();
      toast.show(`Zu ${bekannteFirma.name} zugeordnet`);
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    }
  };

  const anschreibenLink = (leistungId: string, text: string) => {
    const p = new URLSearchParams({ firma: zielFirma?.id ?? '', leistung: leistungId, aufhaenger: text });
    return `/contact?${p}`;
  };

  return (
    <div className="page wide">
      <PageHeader
        eyebrow={
          <nav aria-label="Pfad">
            <Link to="/audit">Shop-Audit</Link>
          </nav>
        }
        title={firma?.name ?? audit.domain}
        subtitle={
          <span className="badges">
            <span className={`badge ${audit.status === 'ok' ? 'ok' : audit.status === 'fehler' ? 'aktion-fehler' : 'warn'}`}>{AUDIT_STATUS[audit.status] ?? audit.status}</span>
            <a href={websiteUrl(audit.domain)} target="_blank" rel="noreferrer noopener">
              {audit.domain} ↗
            </a>
            <span className={istVeraltet(audit, new Date()) ? 'warn-text' : 'muted'}>
              geprüft {formatDateTime(audit.geprueft_am)} von {shortUser(audit.von)}
            </span>
          </span>
        }
        actions={
          <>
            {firma && (
              <Link to={`/crm/firmen/${firma.id}`} className="button">
                Zur Firma
              </Link>
            )}
            {!firma && bekannteFirma && (
              <button type="button" className="button" onClick={zuordnen}>
                {bekannteFirma.name} zuordnen
              </button>
            )}
            {!firma && !bekannteFirma && (
              <button type="button" className="button" onClick={alsLeadAnlegen} disabled={busy !== ''}>
                {busy === 'anlegen' ? 'Legt an …' : 'Als Lead anlegen'}
              </button>
            )}
            <button type="button" className="button primary" onClick={neuPruefen} disabled={busy !== '' || !bereit}>
              {busy === 'pruefen' ? 'Prüft … (bis 60 s)' : 'Neu prüfen'}
            </button>
          </>
        }
      />

      {audit.zusammenfassung && <div className="hint-box">{audit.zusammenfassung}</div>}

      <div className="akte">
        <div className="akte-main">
          <Card title="Aufhänger fürs Anschreiben">
            {aufhaenger.length === 0 ? (
              <p className="muted small">
                {befunde.length === 0 ? 'Ohne Befunde gibt es keine Aufhänger.' : 'Keine Aufhänger. Sie entstehen für die Leistungen des Contact Generators, sobald dort welche angelegt sind.'}
              </p>
            ) : (
              nachLeistung.map((leistungId) => (
                <div key={leistungId} className="aufhaenger-gruppe">
                  <h3 className="subheading">{titelVon(leistungId)}</h3>
                  <ul className="aufhaenger-liste">
                    {aufhaenger
                      .filter((a) => a.leistung_id === leistungId)
                      .map((a) => (
                        <li key={a.text}>
                          <p>{a.text}</p>
                          {zielFirma ? (
                            <Link to={anschreibenLink(leistungId, a.text)} className="button small">
                              Anschreiben mit diesem Aufhänger
                            </Link>
                          ) : (
                            <span className="muted small">Zum Anschreiben erst als Lead anlegen.</span>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              ))
            )}
          </Card>
          <Merkmalbloecke audit={audit} m={merkmale} befunde={befunde} />
        </div>
        <div className="akte-side">
          {nichtGeprueft.length > 0 && (
            <Card title="Nicht geprüft">
              <ul className="befund-liste">
                {nichtGeprueft.map((n) => (
                  <li key={`${n.bereich}-${n.grund}`}>
                    <strong>{bereichLabel(n.bereich)}:</strong> {n.grund}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {verlauf.length > 0 && (
            <Card title="Frühere Prüfungen">
              <ul className="link-list">
                {verlauf.map((a) => (
                  <li key={a.id}>
                    <Link to={`/audit/${a.id}`}>{formatDateTime(a.geprueft_am)}</Link> <span className="muted small">· {shortUser(a.von)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
