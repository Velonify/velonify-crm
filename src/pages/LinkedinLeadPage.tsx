import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, Field, FormError, Loading, PageHeader } from '../components/ui';
import { config, isDemo } from '../config';
import { useCrm } from '../data/CrmContext';
import { AuthExpiredError, ValidationError } from '../data/errors';
import { ART_LABEL, CloudLinkedin, dealTitelListe, DemoLinkedin, istLinkedinLink, vermerkText, vorschlag, type LinkedinApi, type LinkedinLead, type LinkedinVorschlag } from '../data/linkedin';
import { isValidEmail } from '../data/rules';
import type { FirmaInput, KontaktInput } from '../data/types';
import { fieldOf } from '../lib/errors';
import { useIch } from '../lib/useIch';

const PASSUNG_KLASSE = { gut: 'ok', mittel: 'warn', schwach: 'subtle', '': 'subtle' } as const;

function useLinkedinApi(): LinkedinApi | null {
  const { getToken } = useAuth();
  return useMemo(() => {
    if (isDemo) return new DemoLinkedin();
    return config.shopAuditUrl ? new CloudLinkedin(config.shopAuditUrl, getToken) : null;
  }, [getToken]);
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="item">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Paste a LinkedIn job ad or profile, check what was read, create firm, contact and deal in one go. */
export function LinkedinLeadPage() {
  const { db, loading, error, refresh } = useCrm();
  const api = useLinkedinApi();
  const { expire } = useAuth();
  const [params] = useSearchParams();
  const [ich] = useIch(db?.listen.team ?? []);
  const [url, setUrl] = useState(params.get('url') ?? '');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<unknown>(null);
  const [lead, setLead] = useState<LinkedinLead | null>(null);

  if (!db) return <div className="page narrow">{error ? <ErrorBox error={error} onRetry={refresh} /> : loading && <Loading />}</div>;

  const abrufen = async (event: FormEvent) => {
    event.preventDefault();
    if (!api || laeuft) return;
    setFehler(null);
    if (!istLinkedinLink(url)) {
      setFehler(new ValidationError('url', 'Bitte einen Link zu einer Stellenanzeige (linkedin.com/jobs/…) oder einem Profil (linkedin.com/in/…) einfügen.'));
      return;
    }
    setLaeuft(true);
    setLead(null);
    try {
      setLead(await api.lies(url.trim(), dealTitelListe(db)));
    } catch (err) {
      if (err instanceof AuthExpiredError) expire();
      setFehler(err);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <div className="page narrow">
      <PageHeader
        eyebrow="CRM"
        title="Lead aus LinkedIn"
        subtitle="Link zu einer Stellenanzeige oder einem Profil einfügen. Firma, Ansprechpartner und Anlass werden vorbefüllt, angelegt wird erst nach deiner Prüfung."
      />
      <Card title="LinkedIn-Link">
        <form onSubmit={abrufen}>
          <Field label="Link" hint="Stellenanzeige, Profil oder Firmenseite. Tracking-Teile im Link stören nicht." invalid={fieldOf(fehler) === 'url'} wide>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.linkedin.com/jobs/view/…" autoFocus />
          </Field>
          {!api && <p className="muted">Die Adresse der Function fehlt noch (Repo-Variable SHOP_AUDIT_URL).</p>}
          <FormError error={fehler} />
          <div className="form-actions">
            <button type="submit" className="button primary" disabled={!api || laeuft || !url.trim()}>
              {laeuft ? 'Wird gelesen … (10–30 Sekunden)' : 'Abrufen'}
            </button>
          </div>
        </form>
      </Card>
      {laeuft && <Loading label="LinkedIn wird gelesen und von Claude eingeordnet …" />}
      {lead && <LeadFormular key={lead.url} lead={lead} v={vorschlag(lead, db, ich ?? '')} dealTitel={dealTitelListe(db)} team={db.listen.team} ich={ich} />}
    </div>
  );
}

interface FormularProps {
  lead: LinkedinLead;
  v: LinkedinVorschlag;
  dealTitel: string[];
  team: readonly string[];
  ich: string | null;
}

function LeadFormular({ lead, v, dealTitel, team, ich }: FormularProps) {
  const { db, mutate } = useCrm();
  const navigate = useNavigate();
  const toast = useToast();
  const [firmaId, setFirmaId] = useState(v.treffer[0]?.firma.id ?? '');
  const [firma, setFirma] = useState<FirmaInput>(v.firma);
  const [mitKontakt, setMitKontakt] = useState(v.kontakt !== null);
  const [kontakt, setKontakt] = useState<KontaktInput>(v.kontakt ?? { vorname: '', nachname: '', rolle: '', email: '', telefon: '', linkedin: '', hauptkontakt: false, notiz: '' });
  const [mitDeal, setMitDeal] = useState(true);
  const [titel, setTitel] = useState(v.dealTitel);
  const [phase, setPhase] = useState<'neu' | 'qualifiziert'>('qualifiziert');
  const [zustaendig, setZustaendig] = useState(ich ?? '');
  const [anlass, setAnlass] = useState(v.anlass);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<unknown>(null);

  const f = (feld: keyof FirmaInput) => (e: { target: { value: string } }) => setFirma((w) => ({ ...w, [feld]: e.target.value }));
  const k = (feld: keyof KontaktInput) => (e: { target: { value: string } }) => setKontakt((w) => ({ ...w, [feld]: e.target.value }));
  const invalid = fieldOf(fehler);

  const anlegen = async (event: FormEvent) => {
    event.preventDefault();
    setFehler(null);
    try {
      if (!firmaId && !firma.name.trim()) throw new ValidationError('name', 'Bitte den Namen der Firma angeben.');
      if (mitKontakt && !kontakt.vorname.trim() && !kontakt.nachname.trim()) throw new ValidationError('nachname', 'Bitte den Namen der Person angeben oder den Ansprechpartner abwählen.');
      if (mitKontakt && kontakt.email.trim() && !isValidEmail(kontakt.email.trim())) throw new ValidationError('email', 'Die E-Mail-Adresse sieht nicht gültig aus.');
      if (mitDeal && !titel.trim()) throw new ValidationError('titel', 'Bitte einen Titel für den Deal angeben.');
      setBusy(true);
      const ergebnis = await mutate((s) =>
        s.legeLinkedinLeadAn({
          firmaId: firmaId || undefined,
          firma,
          kontakt: mitKontakt ? kontakt : null,
          deal: mitDeal ? { titel: titel.trim(), phase, zustaendig } : null,
          vermerk: vermerkText(lead, anlass),
        }),
      );
      toast.show(`${ergebnis.firma.name}: Lead angelegt`);
      navigate(`/crm/firmen/${ergebnis.firma.id}`);
    } catch (err) {
      setFehler(err);
      setBusy(false);
    }
  };

  const bekannt = db?.firmen.find((x) => x.id === firmaId);
  const kontaktEmailHinweis =
    lead.kontakt?.email && lead.kontakt.email === kontakt.email
      ? `Gefunden über die E-Mail-Suche${lead.kontakt.email_qualitaet !== null ? `, Qualität ${lead.kontakt.email_qualitaet} von 100` : ''}. Vor dem Anschreiben kurz prüfen.`
      : undefined;

  return (
    <form onSubmit={anlegen}>
      <Card
        title={
          <>
            {lead.firma.name || 'Unbekannte Firma'} <span className="badge subtle">{ART_LABEL[lead.art]}</span>{' '}
            {lead.passung.stufe && <span className={`badge ${PASSUNG_KLASSE[lead.passung.stufe]}`}>Passung {lead.passung.stufe}</span>}
          </>
        }
        actions={
          <a href={lead.url} target="_blank" rel="noopener noreferrer">
            Auf LinkedIn öffnen ↗
          </a>
        }
      >
        <dl className="items">
          {lead.stelle && (
            <Item label="Stelle">
              {lead.stelle.titel}
              {lead.stelle.ort && ` · ${lead.stelle.ort}`}
              {lead.stelle.datum && ` · ${lead.stelle.datum.split('-').reverse().join('.')}`}
            </Item>
          )}
          {lead.firma.domain && (
            <Item label="Website">
              <a href={`https://${lead.firma.domain}`} target="_blank" rel="noopener noreferrer">
                {lead.firma.domain}
              </a>
            </Item>
          )}
          {(lead.firma.branche || lead.firma.mitarbeiter !== null) && (
            <Item label="Firma">{[lead.firma.branche, lead.firma.mitarbeiter !== null ? `${lead.firma.mitarbeiter.toLocaleString('de-DE')} Mitarbeitende auf LinkedIn` : ''].filter(Boolean).join(' · ')}</Item>
          )}
          {lead.passung.text && <Item label="Passung">{lead.passung.text}</Item>}
          {lead.ansprechpartner_tipp && <Item label="Wen ansprechen?">{lead.ansprechpartner_tipp}</Item>}
        </dl>
        {lead.hinweis && <p className="muted">{lead.hinweis}</p>}
      </Card>

      <Card title="Firma">
        <div className="grid">
          <Field label="Firma" hint={v.treffer.length > 0 ? 'Sieht aus wie eine Firma, die schon im CRM steht.' : 'Wird neu angelegt.'}>
            <select value={firmaId} onChange={(e) => setFirmaId(e.target.value)}>
              <option value="">Neue Firma anlegen</option>
              {v.treffer.map((t) => (
                <option key={t.firma.id} value={t.firma.id}>
                  {t.firma.name} ({t.gruende.join(', ')})
                </option>
              ))}
            </select>
          </Field>
          {firmaId ? (
            <Field label="Im CRM">{bekannt && <Link to={`/crm/firmen/${bekannt.id}`}>{bekannt.name} öffnen</Link>}</Field>
          ) : (
            <>
              <Field label="Name" invalid={invalid === 'name'}>
                <input value={firma.name} onChange={f('name')} />
              </Field>
              <Field label="Domain" hint={firma.domain ? undefined : 'Nicht gefunden. Bitte ergänzen, wenn bekannt.'} invalid={invalid === 'domain'}>
                <input value={firma.domain} onChange={f('domain')} placeholder="beispiel.de" />
              </Field>
              <Field label="Ort">
                <input value={firma.ort} onChange={f('ort')} />
              </Field>
            </>
          )}
        </div>
      </Card>

      <Card
        title="Ansprechpartner"
        actions={
          <label className="checkbox">
            <input type="checkbox" checked={mitKontakt} onChange={(e) => setMitKontakt(e.target.checked)} />
            anlegen
          </label>
        }
      >
        {mitKontakt ? (
          <div className="grid">
            <Field label="Vorname">
              <input value={kontakt.vorname} onChange={k('vorname')} />
            </Field>
            <Field label="Nachname" invalid={invalid === 'nachname'}>
              <input value={kontakt.nachname} onChange={k('nachname')} />
            </Field>
            <Field label="Rolle">
              <input value={kontakt.rolle} onChange={k('rolle')} />
            </Field>
            <Field label="E-Mail" hint={kontaktEmailHinweis} invalid={invalid === 'email'}>
              <input type="email" value={kontakt.email} onChange={k('email')} />
            </Field>
            <Field label="LinkedIn" wide>
              <input type="url" value={kontakt.linkedin} onChange={k('linkedin')} placeholder="https://www.linkedin.com/in/…" />
            </Field>
          </div>
        ) : (
          <p className="muted">
            {lead.art === 'job' ? 'In der Anzeige ist keine passende Person genannt. Du kannst sie später in der Firmenakte ergänzen.' : 'Ohne Ansprechpartner.'}
          </p>
        )}
      </Card>

      <Card
        title="Deal"
        actions={
          <label className="checkbox">
            <input type="checkbox" checked={mitDeal} onChange={(e) => setMitDeal(e.target.checked)} />
            anlegen
          </label>
        }
      >
        {mitDeal && (
          <div className="grid">
            <Field label="Titel" invalid={invalid === 'titel'}>
              <input value={titel} onChange={(e) => setTitel(e.target.value)} list="linkedin-deal-titel" />
              <datalist id="linkedin-deal-titel">
                {dealTitel.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Phase">
              <select value={phase} onChange={(e) => setPhase(e.target.value as 'neu' | 'qualifiziert')}>
                <option value="qualifiziert">Qualifiziert</option>
                <option value="neu">Neu</option>
              </select>
            </Field>
            <Field label="Zuständig">
              <select value={zustaendig} onChange={(e) => setZustaendig(e.target.value)}>
                <option value="">–</option>
                {team.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <div className="grid">
          <Field label="Anlass" hint="Kommt mit dem LinkedIn-Link in den Verlauf der Firma." wide>
            <textarea rows={4} value={anlass} onChange={(e) => setAnlass(e.target.value)} />
          </Field>
        </div>
      </Card>

      <FormError error={fehler} />
      <div className="form-actions">
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'Wird angelegt …' : firmaId ? 'Zur Firma hinzufügen' : 'Lead anlegen'}
        </button>
      </div>
    </form>
  );
}
