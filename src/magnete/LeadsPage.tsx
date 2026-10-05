import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MailLink } from '../components/MailLink';
import { useToast } from '../components/Toasts';
import { Card, PageHeader, PageState } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { SchemaError } from '../data/errors';
import {
  herkunftLabel,
  istNewsletterAbonnent,
  istOffenerLead,
  leadDubletten,
  leadFirmenname,
  magnetZahlen,
  newsletterCsv,
  shopsystemLabel,
  sortiereLeads,
} from '../data/magnete';
import { istAuditMagnet, roastPlaetze, roastSchritt, ROAST_SCHRITT_LABEL } from '../data/roast';
import type { Firma, Magnet, MagnetLead } from '../data/types';
import { Uebernahme, type UebernahmeAuswahl } from '../eingang/AnfrageKarte';
import { formatDateTime } from '../lib/format';
import { useIch } from '../lib/useIch';
import { useMagnetDaten } from './useMagnetDaten';

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="item">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** What the person did with the mail: opened the download, confirmed the newsletter. */
function Signale({ lead }: { lead: MagnetLead }) {
  return (
    <span className="badges">
      {lead.download_am ? <span className="badge ok">Download geöffnet</span> : <span className="badge subtle">Download offen</span>}
      {istNewsletterAbonnent(lead) && <span className="badge ok">Newsletter</span>}
      {lead.newsletter_einwilligung && !lead.newsletter_bestaetigt_am && <span className="badge warn">Newsletter unbestätigt</span>}
      {lead.newsletter_abgemeldet_am && <span className="badge subtle">abgemeldet</span>}
    </span>
  );
}

/** Shop-Roast: where the report stands instead of download clicks. */
function RoastSignale({ lead }: { lead: MagnetLead }) {
  const schritt = roastSchritt(lead);
  return (
    <span className="badges">
      {lead.warteliste && <span className="badge warn">Warteliste</span>}
      <span className={`badge ${schritt === 'gesendet' ? 'ok' : schritt === 'pruefen' ? 'subtle' : 'warn'}`}>{ROAST_SCHRITT_LABEL[schritt]}</span>
      {lead.report_geoeffnet_am && <span className="badge ok">Report {lead.report_aufrufe ?? 1}× geöffnet</span>}
      {istNewsletterAbonnent(lead) && <span className="badge ok">Newsletter</span>}
    </span>
  );
}

function LeadKarte({
  lead,
  magnet,
  firmen,
  team,
  ich,
  onUebernehmen,
  onVerwerfen,
}: {
  lead: MagnetLead;
  magnet?: Magnet;
  firmen: readonly Firma[];
  team: readonly string[];
  ich: string | null;
  onUebernehmen(eingabe: UebernahmeAuswahl): Promise<void>;
  onVerwerfen(): Promise<void>;
}) {
  const treffer = useMemo(() => leadDubletten(lead, firmen), [lead, firmen]);
  const roast = istAuditMagnet(magnet);
  return (
    <Card
      title={lead.vorname || lead.email}
      actions={
        <>
          <span className="muted">{formatDateTime(lead.eingegangen_am)}</span>
          {roast && (
            <Link to={`/magnete/roast/${lead.id}`} className={`button small${lead.audit_id ? '' : ' primary'}`}>
              {lead.audit_id ? 'Report' : 'Shop prüfen'}
            </Link>
          )}
        </>
      }
    >
      <dl className="items">
        <Item label="Magnet">{magnet?.titel ?? lead.magnet}</Item>
        <Item label="E-Mail">
          <MailLink email={lead.email} />
        </Item>
        {lead.shop && (
          <Item label="Shop">
            <a href={/^https?:\/\//.test(lead.shop) ? lead.shop : `https://${lead.shop}`} target="_blank" rel="noreferrer">
              {lead.shop}
            </a>
          </Item>
        )}
        {lead.shopsystem && <Item label="Shopsystem">{shopsystemLabel(lead.shopsystem)}</Item>}
        <Item label="Herkunft">{herkunftLabel(lead)}</Item>
        <Item label={roast ? 'Roast' : 'Mail'}>{roast ? <RoastSignale lead={lead} /> : <Signale lead={lead} />}</Item>
      </dl>
      <Uebernahme treffer={treffer} firmen={firmen} team={team} ich={ich} firmenname={leadFirmenname(lead)} onUebernehmen={onUebernehmen} onVerwerfen={onVerwerfen} />
    </Card>
  );
}

function ladeHerunter(name: string, inhalt: string) {
  // BOM, so Excel opens the umlauts correctly.
  const url = URL.createObjectURL(new Blob(['﻿', inhalt], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function MagnetLeadsPage() {
  const { db, mutate } = useCrm();
  const daten = useMagnetDaten();
  const toast = useToast();
  const team = db?.listen.team ?? [];
  const [ich] = useIch(team);
  const [filter, setFilter] = useState('');
  const [zeigeErledigte, setZeigeErledigte] = useState(false);

  const magnete = useMemo(() => (daten.data?.magnete ?? []).filter((m) => !m.archiviert), [daten.data]);
  const alleLeads = useMemo(() => daten.data?.leads ?? [], [daten.data]);
  const leads = useMemo(() => sortiereLeads(alleLeads.filter((l) => !filter || l.magnet === filter)), [alleLeads, filter]);
  const offen = leads.filter(istOffenerLead);
  const erledigt = leads.filter((l) => !istOffenerLead(l));
  const zahlen = magnetZahlen(leads);
  const firmen = useMemo(() => (db?.firmen ?? []).filter((f) => !f.archiviert), [db]);
  const magnetFuer = (slug: string) => daten.data?.magnete.find((m) => m.slug === slug);
  const gefiltert = filter ? magnetFuer(filter) : undefined;
  const nurRoast = istAuditMagnet(gefiltert);
  const plaetze = gefiltert && nurRoast && gefiltert.plaetze !== null ? roastPlaetze(gefiltert, alleLeads.filter((l) => l.magnet === gefiltert.slug)) : null;

  if (daten.error instanceof SchemaError) {
    return (
      <div className="page">
        <PageHeader eyebrow="Lead-Magnete" title="Leads" />
        <Card title="Noch nicht eingerichtet">
          <p>{daten.error.message}</p>
        </Card>
      </div>
    );
  }

  const quote = (teil: number) => (zahlen.eintraege ? `${Math.round((teil / zahlen.eintraege) * 100)} % der Einträge` : '–');

  return (
    <div className="page">
      <PageHeader
        eyebrow="Lead-Magnete"
        title="Leads"
        subtitle="Wer sich auf velonify.de/ressourcen für einen Magneten eingetragen hat. Die Mail mit dem Download geht automatisch raus, beim Shop-Roast die Bestätigung – den Report schreibt ihr über „Shop prüfen“. Hier entscheiden, wer ins CRM kommt."
        actions={
          <button
            type="button"
            className="button"
            disabled={!alleLeads.some(istNewsletterAbonnent)}
            onClick={() => ladeHerunter('velonify-newsletter.csv', newsletterCsv(alleLeads))}
            title="Alle bestätigten Newsletter-Adressen mit Nachweis der Einwilligung"
          >
            Newsletter-Liste (CSV)
          </button>
        }
      />
      <PageState loading={daten.loading} error={daten.error ?? null} onRetry={daten.reload}>
        <div className="filters">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Magnet">
            <option value="">Alle Magnete</option>
            {magnete.map((m) => (
              <option key={m.id} value={m.slug}>
                {m.titel}
              </option>
            ))}
          </select>
          {erledigt.length > 0 && (
            <button type="button" className="button" onClick={() => setZeigeErledigte((z) => !z)}>
              {zeigeErledigte ? 'Erledigte ausblenden' : `Erledigte zeigen (${erledigt.length})`}
            </button>
          )}
        </div>

        <div className="kpis">
          <div className="kpi panel">
            <span className="kpi-label">Einträge</span>
            <span className="kpi-value">{zahlen.eintraege}</span>
            <span className="kpi-sub">
              {zahlen.offen} offen{plaetze && ` · ${plaetze.frei} von ${gefiltert?.plaetze} Plätzen frei`}
            </span>
          </div>
          {nurRoast ? (
            <div className="kpi">
              <span className="kpi-label">Reports gesendet</span>
              <span className="kpi-value">{leads.filter((l) => l.report_gesendet_am).length}</span>
              <span className="kpi-sub">{leads.filter((l) => l.report_geoeffnet_am).length} davon geöffnet</span>
            </div>
          ) : (
            <div className="kpi">
              <span className="kpi-label">Download geöffnet</span>
              <span className="kpi-value">{zahlen.geladen}</span>
              <span className="kpi-sub">{quote(zahlen.geladen)}</span>
            </div>
          )}
          <div className="kpi">
            <span className="kpi-label">Newsletter bestätigt</span>
            <span className="kpi-value">{zahlen.newsletter}</span>
            <span className="kpi-sub">{quote(zahlen.newsletter)}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Im CRM</span>
            <span className="kpi-value">{zahlen.uebernommen}</span>
            <span className="kpi-sub">{quote(zahlen.uebernommen)}</span>
          </div>
        </div>

        <div className="anfragen">
          {offen.length === 0 && (
            <Card title="Nichts offen">
              <p>
                Zurzeit wartet kein Eintrag.{' '}
                {magnete.length === 0 ? (
                  <>
                    Zuerst unter <Link to="/magnete/liste">Magnete</Link> einen Magneten anlegen.
                  </>
                ) : (
                  'Neue erscheinen hier, sobald jemand das Formular auf der Landingpage ausfüllt.'
                )}
              </p>
            </Card>
          )}
          {offen.map((lead) => (
            <LeadKarte
              key={lead.id}
              lead={lead}
              magnet={magnetFuer(lead.magnet)}
              firmen={firmen}
              team={team}
              ich={ich}
              onUebernehmen={async (eingabe) => {
                const { firma, deal } = await mutate((s) => s.uebernimmMagnetLead(lead.id, eingabe));
                daten.reload();
                toast.show(`${firma.name} ist im CRM${deal ? ' – Deal in der Pipeline angelegt' : ''}.`);
              }}
              onVerwerfen={async () => {
                await mutate((s) => s.verwirfMagnetLead(lead.id));
                daten.reload();
                toast.show('Eintrag verworfen.');
              }}
            />
          ))}
          {zeigeErledigte && erledigt.length > 0 && (
            <Card title="Erledigt">
              <ul className="anfragen-erledigt">
                {erledigt.map((lead) => {
                  const firma = firmen.find((f) => f.id === lead.firma_id);
                  return (
                    <li key={lead.id}>
                      <span className="muted">{formatDateTime(lead.eingegangen_am)}</span> {lead.vorname || lead.email}{' '}
                      <span className="muted">· {magnetFuer(lead.magnet)?.titel ?? lead.magnet}</span>
                      {lead.status === 'verworfen' ? (
                        <span className="badge subtle"> verworfen</span>
                      ) : firma ? (
                        <>
                          {' → '}
                          <Link to={`/crm/firmen/${firma.id}`}>{firma.name}</Link>
                        </>
                      ) : (
                        <span className="badge subtle"> übernommen</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </PageState>
    </div>
  );
}
