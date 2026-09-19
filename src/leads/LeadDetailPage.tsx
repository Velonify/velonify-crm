import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Card, ErrorBox, Loading, PageHeader } from '../components/ui';
import { AUSSCHLUSS_LABEL, BEREICHE, bereichVon, reichweiteLabel, systemLabel, tierVon, type Bereich } from '../data/leadFinder';
import { formatDateTime, shortUser } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import { AnlassBadges, anlassBereich, EntscheidungsLeiste, Item, ToolBadges } from './LeadTeile';
import { NICHT_EINGERICHTET, useLeadFinderApi } from './useLeadFinder';

const ENTSCHEIDUNG_TEXT: Record<string, string> = {
  pipeline: 'In die Pipeline übernommen',
  firma: 'In die Firmenübersicht übernommen',
  abgelehnt: 'Abgelehnt',
  zurueckgestellt: 'Zurückgestellt',
  freigegeben: 'Manuell in den Backlog gegeben',
};

const zahl = (n: number) => n.toLocaleString('de-DE');
const sekunden = (ms: number) => `${(ms / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} s`;

export function LeadDetailPage() {
  const { domain = '' } = useParams();
  const api = useLeadFinderApi();
  const detail = useLoad(() => (api ? api.detail(domain) : Promise.reject(new Error(NICHT_EINGERICHTET))), [api, domain]);
  const [entschieden, setEntschieden] = useState(false);
  const [params] = useSearchParams();

  if (detail.error) return <div className="page"><ErrorBox error={detail.error} onRetry={detail.reload} /></div>;
  if (!detail.data) return <div className="page"><Loading /></div>;

  const d = detail.data;
  const k = d.kandidat;
  const f = k.firma;
  const offen = !d.entscheidung || d.entscheidung === 'freigegeben' || d.entscheidung === 'zurueckgestellt';
  const bereiche: Bereich[] = k.bereiche?.length ? k.bereiche : ['migration'];
  // The view the page was opened from decides the deal title; else the strongest one.
  const ansicht = params.get('ansicht')
    ? bereichVon(params.get('ansicht')!)
    : [...bereiche].sort((a, b) => (k.scores?.[b] ?? 0) - (k.scores?.[a] ?? 0))[0];

  return (
    <div className="page">
      <PageHeader
        eyebrow={<Link to="/leads">Backlog</Link>}
        title={f.name || k.domain}
        subtitle={
          <>
            <a href={k.url} target="_blank" rel="noreferrer">
              {k.domain}
            </a>{' '}
            ↗ · {systemLabel(k.system, k.version)} · Score {k.scores?.[ansicht] || k.score} (Tier {tierVon(k.scores?.[ansicht] || k.score)}, {BEREICHE.find((b) => b.id === ansicht)?.label}) · geprüft {formatDateTime(d.geprueft_am)}
          </>
        }
        actions={
          <Link to={`/audit/neu?domain=${encodeURIComponent(k.domain)}`} className="button">
            Shop-Audit starten
          </Link>
        }
      />

      {d.entscheidung && (
        <div className="hint-box">
          {ENTSCHEIDUNG_TEXT[d.entscheidung] ?? d.entscheidung}
          {d.grund && `: ${d.grund}`} ({shortUser(d.entschieden_von ?? '')}, {formatDateTime(d.entschieden_am ?? '')})
          {d.firma_id && (
            <>
              {' '}
              · <Link to={`/crm/firmen/${d.firma_id}`}>Zur Firmenakte</Link>
            </>
          )}
        </div>
      )}

      {offen && !entschieden && (k.qualifiziert || d.entscheidung === 'freigegeben') && (
        <div className="lead-leiste">
          <EntscheidungsLeiste api={api} domains={[k.domain]} bereich={ansicht} onErledigt={() => { setEntschieden(true); detail.reload(); }} />
        </div>
      )}

      {k.ausschluss.length > 0 && (
        <Card title="Nicht qualifiziert">
          <ul>
            {k.ausschluss.map((a) => (
              <li key={a.id}>
                <strong>{AUSSCHLUSS_LABEL[a.id] ?? a.id}:</strong> {a.text}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Anlass">
        {k.anlaesse.length === 0 && <p className="muted">Kein Anlass gefunden.</p>}
        {BEREICHE.filter((b) => k.anlaesse.some((a) => (a.bereich ?? anlassBereich(a.id)) === b.id)).map((b) => (
          <div key={b.id} className="lead-anlass-gruppe">
            <h3 className="field-label">
              {b.label}
              {k.scores && bereiche.includes(b.id) && ` · Score ${k.scores[b.id]}`}
              {!bereiche.includes(b.id) && ' · nur Verstärker'}
            </h3>
            <ul className="lead-anlaesse">
              {k.anlaesse
                .filter((a) => (a.bereich ?? anlassBereich(a.id)) === b.id)
                .map((a) => (
                  <li key={a.id}>
                    <AnlassBadges anlaesse={[a.id]} /> {a.text}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </Card>

      <div className="tag-grid">
        <Card title="Firma (laut Impressum)">
          <dl className="items">
            <Item label="Name">{f.name}</Item>
            <Item label="Rechtsform">{f.rechtsform}</Item>
            <Item label="Register">{f.register && `${f.register}${f.registergericht ? `, ${f.registergericht}` : ''}`}</Item>
            <Item label="USt-IdNr.">{f.ust_id}</Item>
            <Item label="Geschäftsführung">{f.geschaeftsfuehrer.join(', ')}</Item>
            <Item label="Adresse">{[f.strasse, `${f.plz} ${f.ort}`.trim()].filter(Boolean).join(', ')}</Item>
            <Item label="E-Mail">{f.email && <a href={`mailto:${f.email}`}>{f.email}</a>}</Item>
            <Item label="Telefon">{f.telefon && <a href={`tel:${f.telefon.replace(/[^+\d]/g, '')}`}>{f.telefon}</a>}</Item>
            <Item label="Impressum">
              {f.url && (
                <a href={f.url} target="_blank" rel="noreferrer">
                  öffnen
                </a>
              )}
            </Item>
          </dl>
        </Card>

        <Card title="Reichweite & Tempo">
          <dl className="items">
            <Item label="Reichweite in DE">{k.rang_de ? `${reichweiteLabel(k.rang_de)} (Chrome-Nutzer)` : ''}</Item>
            <Item label="LCP mobil (echte Nutzer)">{k.lcp_ms !== null ? sekunden(k.lcp_ms) : ''}</Item>
            <Item label="PageSpeed mobil">{k.pagespeed_mobil !== null ? `${k.pagespeed_mobil} von 100` : ''}</Item>
          </dl>
        </Card>
      </div>

      <Card title="Shop">
        <dl className="items">
          <Item label="System">{`${systemLabel(k.system, k.version)}${k.support.text && k.support.status !== 'supported' ? ` · ${k.support.text}` : ''}`}</Item>
          <Item label="Letztes Deployment">{k.letztes_deploy}</Item>
          <Item label="Sortiment">
            {k.sitemap.gefunden ? `rund ${zahl(k.sitemap.produkt_urls || k.sitemap.urls)} ${k.sitemap.produkt_urls ? 'Produkt-URLs' : 'URLs'} laut Sitemap` : ''}
            {k.sitemap.neuestes_lastmod && `, zuletzt geändert ${k.sitemap.neuestes_lastmod}`}
          </Item>
          <Item label="Zahlarten">{k.zahlarten.join(', ')}</Item>
          <Item label="Werbe-Pixel">{k.werbung && <ToolBadges tools={k.werbung} />}</Item>
          <Item label="Google Tag Manager">{k.gtm === undefined ? '' : k.gtm ? 'ja' : 'nein'}</Item>
          <Item label="E-Mail-Tool">{k.email_tools.length > 0 && <ToolBadges tools={k.email_tools} />}</Item>
          <Item label="Newsletter-Anmeldung">{k.newsletter_formular === undefined ? '' : k.newsletter_formular ? 'ja' : 'nicht gefunden'}</Item>
          <Item label="Weiteres Marketing">{k.marketing.join(', ')}</Item>
          <Item label="Bewertungen">{k.bewertungen.join(', ')}</Item>
          <Item label="Sprachen">{k.sprachen.join(', ')}</Item>
          <Item label="Social">
            {k.signale && Object.keys(k.signale.social).length > 0 && (
              <span className="lead-badges">
                {Object.entries(k.signale.social).map(([name, url]) => (
                  <a key={name} href={url} target="_blank" rel="noreferrer">
                    {name}
                  </a>
                ))}
              </span>
            )}
          </Item>
        </dl>
      </Card>

      <Card title="Wie der Score zustande kommt">
        <ul className="small">
          {k.score_gruende.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
        {k.technik.length > 0 && (
          <details className="small muted">
            <summary>Erkannte Technik ({k.technik.length})</summary>
            <p>{k.technik.join(', ')}</p>
          </details>
        )}
        <p className="small muted">
          Geprüft von {shortUser(d.von)}. Reichweite und Ladezeit aus dem Chrome UX Report, System-Verlauf aus HTTP Archive, alles andere live von der Website.
        </p>
      </Card>
    </div>
  );
}
