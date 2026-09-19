import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, ErrorBox, Loading, PageHeader } from '../components/ui';
import { AUSSCHLUSS_LABEL, reichweiteLabel, systemLabel, tierVon } from '../data/leadFinder';
import { formatDateTime, shortUser } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import { AnlassBadges, EntscheidungsLeiste, Item } from './LeadTeile';
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

  if (detail.error) return <div className="page"><ErrorBox error={detail.error} onRetry={detail.reload} /></div>;
  if (!detail.data) return <div className="page"><Loading /></div>;

  const d = detail.data;
  const k = d.kandidat;
  const f = k.firma;
  const offen = !d.entscheidung || d.entscheidung === 'freigegeben' || d.entscheidung === 'zurueckgestellt';

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
            · {systemLabel(k.system, k.version)} · Score {k.score} (Tier {tierVon(k.score)}) · geprüft {formatDateTime(d.geprueft_am)}
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
          <EntscheidungsLeiste api={api} domains={[k.domain]} onErledigt={() => { setEntschieden(true); detail.reload(); }} />
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
        {k.anlaesse.length > 0 ? (
          <ul className="lead-anlaesse">
            {k.anlaesse.map((a) => (
              <li key={a.id}>
                <AnlassBadges anlaesse={[a.id]} /> {a.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Kein Anlass gefunden.</p>
        )}
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
          <Item label="Marketing">{k.marketing.join(', ')}</Item>
          <Item label="E-Mail-Tool">{k.email_tools.join(', ')}</Item>
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
