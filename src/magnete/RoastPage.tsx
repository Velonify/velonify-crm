import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAuditPruefen, useAudits, useShopAuditApi } from '../audit/useAudits';
import { BefundZahlen, SchwereBadge } from '../audit/AuditTeile';
import { useGmail } from '../components/MailLink';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, Field, FormError, Loading, PageHeader } from '../components/ui';
import { AUDIT_STATUS, befundeVon, nichtGeprueftVon } from '../data/audit';
import { signaturSchluessel } from '../data/anschreiben';
import { useCrm } from '../data/CrmContext';
import { AuthExpiredError } from '../data/errors';
import { leadDomain, shopsystemLabel } from '../data/magnete';
import {
  AMPEL_LABEL,
  bereicheVon,
  BEOBACHTUNGEN,
  mitTexten,
  reportLink,
  reportMail,
  reportVon,
  roastSchritt,
  ROAST_SCHRITT_LABEL,
  type Ampel,
  type Report,
  type ReportBereich,
} from '../data/roast';
import type { Audit, MagnetLead } from '../data/types';
import { errorMessage, fieldOf } from '../lib/errors';
import { formatDateTime, websiteUrl } from '../lib/format';
import { useMagnetDaten } from './useMagnetDaten';

export function AmpelPunkt({ ampel }: { ampel: Ampel }) {
  return <span className={`ampel ampel-${ampel}`} title={AMPEL_LABEL[ampel]} aria-label={AMPEL_LABEL[ampel]} />;
}

/** Roughly what the shop owner sees on velonify.de/roast/<token>/ – the real page lives in the website repo. */
function ReportVorschau({ report, bereiche, lead, von }: { report: Report; bereiche: ReportBereich[]; lead: MagnetLead; von: string }) {
  return (
    <article className="roast-vorschau">
      <p className="eyebrow">Shop-Roast · {report.domain}</p>
      <h2>{lead.vorname ? `Hi ${lead.vorname}, hier ist euer Report` : 'Euer Report'}</h2>
      {report.einleitung && <p className="roast-einleitung">{report.einleitung}</p>}
      {report.kennzahlen.length > 0 && (
        <dl className="roast-kennzahlen">
          {report.kennzahlen.map((k) => (
            <div key={k.label}>
              <dt>{k.label}</dt>
              <dd>{k.wert}</dd>
            </div>
          ))}
        </dl>
      )}
      <ul className="roast-ampeln">
        {bereiche.map((b) => (
          <li key={b.bereich}>
            <AmpelPunkt ampel={b.ampel} /> <strong>{b.label}</strong> <span className="muted">{AMPEL_LABEL[b.ampel]}</span>
          </li>
        ))}
      </ul>
      {bereiche.map((b) => (
        <section key={b.bereich}>
          <h3>
            <AmpelPunkt ampel={b.ampel} /> {b.label}
          </h3>
          {b.punkte.length === 0 && <p className="muted">{b.ampel === 'offen' ? b.hinweis || 'Diesen Bereich konnten wir nicht prüfen.' : 'Hier haben wir nichts gefunden.'}</p>}
          {b.punkte.map((p) => (
            <div key={p.befund_id} className="roast-punkt">
              <h4>{p.titel || <span className="warn-text">Überschrift fehlt</span>}</h4>
              <p>{p.text}</p>
            </div>
          ))}
        </section>
      ))}
      <section>
        <h3>Drei Beobachtungen von {von || 'unserem Team'}</h3>
        {report.beobachtungen.map((b, i) => (
          <div key={i} className="roast-punkt">
            <h4>{b.titel || <span className="warn-text">Beobachtung {i + 1} fehlt</span>}</h4>
            <p>{b.text}</p>
          </div>
        ))}
      </section>
      {report.fazit && (
        <section>
          <h3>Fazit</h3>
          <p>{report.fazit}</p>
        </section>
      )}
    </article>
  );
}

function Schritt({ nummer, titel, erledigt, children }: { nummer: number; titel: string; erledigt: boolean; children: ReactNode }) {
  return (
    <li className={erledigt ? 'is-done' : undefined}>
      <span className="roast-schritt-nr">{erledigt ? '✓' : nummer}</span>
      <div>
        <strong>{titel}</strong>
        <div className="roast-schritt-inhalt">{children}</div>
      </div>
    </li>
  );
}

export function RoastPage() {
  const { id = '' } = useParams();
  const { db } = useCrm();
  const { state, expire } = useAuth();
  const daten = useMagnetDaten();
  const audits = useAudits();
  const { pruefe, bereit } = useAuditPruefen();
  const api = useShopAuditApi();
  const gmail = useGmail();
  const toast = useToast();

  const lead = daten.data?.leads.find((l) => l.id === id);
  const magnet = lead ? daten.data?.magnete.find((m) => m.slug === lead.magnet) : undefined;
  const audit: Audit | undefined = lead?.audit_id ? audits.data?.find((a) => a.id === lead.audit_id) : undefined;
  const user = state.status === 'signedIn' || state.status === 'expired' || state.status === 'demo' ? state.user : null;

  const [entwurf, setEntwurf] = useState<Report | null>(null);
  const [von, setVon] = useState('');
  const [geaendert, setGeaendert] = useState(false);
  const [ansicht, setAnsicht] = useState<'bearbeiten' | 'vorschau'>('bearbeiten');
  const [busy, setBusy] = useState<'' | 'pruefen' | 'claude' | 'speichern' | 'freigeben' | 'senden'>('');
  const [error, setError] = useState<unknown>();

  // Take over what is stored whenever the row changes (after saving or a reload), unless there are unsaved edits.
  useEffect(() => {
    if (!lead || geaendert) return;
    setEntwurf(reportVon(lead));
    setVon(lead.report_von || user?.name || '');
  }, [lead?.report, lead?.report_von, lead?.geaendert_am]);

  useEffect(() => {
    if (!geaendert) return;
    const warnen = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warnen);
    return () => window.removeEventListener('beforeunload', warnen);
  }, [geaendert]);

  const bereiche = useMemo(() => (entwurf ? bereicheVon(entwurf.punkte, audit ?? { nicht_geprueft: '' }) : []), [entwurf, audit]);

  if (daten.error) return <div className="page"><ErrorBox error={daten.error} onRetry={daten.reload} /></div>;
  if (!daten.data || !db) return <div className="page"><Loading label="Eintrag wird geladen …" /></div>;
  if (!lead) {
    return (
      <div className="page">
        <PageHeader eyebrow="Lead-Magnete" title="Eintrag nicht gefunden" />
        <p>
          Diesen Eintrag gibt es nicht. <Link to="/magnete">Zu den Leads</Link>
        </p>
      </div>
    );
  }

  const domain = leadDomain(lead);
  const schritt = roastSchritt(lead);
  const freigegeben = Boolean(lead.report_freigegeben_am);
  const signatur = user ? db.einstellungen[signaturSchluessel(user.email)] ?? '' : '';
  const link = reportLink(lead);

  const aendere = (aenderung: (r: Report) => Report) => {
    setEntwurf((r) => (r ? aenderung(r) : r));
    setGeaendert(true);
  };

  const lauf = async (art: typeof busy, arbeit: () => Promise<void>) => {
    setBusy(art);
    setError(undefined);
    try {
      await arbeit();
    } catch (err) {
      if (err instanceof AuthExpiredError) expire();
      setError(err);
      // The buttons sit in the side column, far from the message at the top.
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy('');
    }
  };

  const pruefen = () =>
    lauf('pruefen', async () => {
      if (!domain) throw new Error('Zu diesem Eintrag gibt es keine Shop-Adresse.');
      if (lead.audit_id && !window.confirm('Den Shop neu prüfen? Der Report startet dann wieder beim Entwurf aus den neuen Befunden, eure Texte gehen verloren.')) return;
      const { audit: neu } = await pruefe(domain);
      await daten.aendern((s) => s.verknuepfeRoastAudit(lead.id, neu));
      audits.reload();
      setGeaendert(false);
      toast.show(`${domain} geprüft – ${befundeVon(neu).length} Befunde im Entwurf.`);
    });

  const claude = () =>
    lauf('claude', async () => {
      if (!api || !audit || !entwurf) return;
      const befunde = befundeVon(audit).filter((b) => entwurf.punkte.some((p) => p.befund_id === b.id));
      if (befunde.length === 0) throw new Error('Im Report steht kein Befund mehr, den Claude erklären könnte.');
      const schonGeschrieben = entwurf.einleitung || entwurf.fazit || entwurf.punkte.some((p) => p.titel);
      if (schonGeschrieben && !window.confirm('Claude schreibt Einleitung, Überschriften, Erklärungen und Fazit neu. Eure Änderungen daran werden ersetzt (die Beobachtungen bleiben). Weiter?')) return;
      const texte = await api.roastTexte({ domain: audit.domain, vorname: lead.vorname, befunde, nicht_geprueft: nichtGeprueftVon(audit) });
      aendere((r) => mitTexten(r, texte));
      toast.show(texte.verworfen > 0 ? `Texte eingesetzt. ${texte.verworfen} Erklärung(en) hatten unsichere Zahlen und wurden verworfen – dort steht noch der Befund.` : 'Texte von Claude eingesetzt – bitte gegenlesen und speichern.');
    });

  const speichern = () =>
    lauf('speichern', async () => {
      if (!entwurf) return;
      await daten.aendern((s) => s.speichereReport(lead.id, entwurf, von));
      setGeaendert(false);
      toast.show('Report gespeichert');
    });

  const freigeben = (frei: boolean) =>
    lauf('freigeben', async () => {
      if (frei && entwurf && geaendert) await daten.aendern((s) => s.speichereReport(lead.id, entwurf, von));
      setGeaendert(false);
      await daten.aendern((s) => s.gibReportFrei(lead.id, frei));
      toast.show(frei ? 'Freigegeben – der Report ist jetzt unter dem Link erreichbar.' : 'Freigabe zurückgenommen, die Seite ist wieder weg.');
    });

  const gesendet = () =>
    lauf('senden', async () => {
      await daten.aendern((s) => s.markiereReportGesendet(lead.id));
      toast.show('Als gesendet markiert');
    });

  const kopiere = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.show('Link kopiert');
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    }
  };

  const feld = fieldOf(error);

  return (
    <div className="page wide">
      <PageHeader
        eyebrow={
          <nav aria-label="Pfad">
            <Link to="/magnete">Lead-Magnete</Link> · {magnet?.titel ?? lead.magnet}
          </nav>
        }
        title={domain || lead.email}
        subtitle={
          <span className="badges">
            <span className={`badge ${schritt === 'gesendet' ? 'ok' : schritt === 'pruefen' ? 'subtle' : 'warn'}`}>{ROAST_SCHRITT_LABEL[schritt]}</span>
            {lead.warteliste && <span className="badge warn">Warteliste</span>}
            {domain && (
              <a href={websiteUrl(domain)} target="_blank" rel="noreferrer noopener">
                {domain} ↗
              </a>
            )}
            <span className="muted">
              {lead.vorname || 'Ohne Namen'} · {lead.email}
              {lead.shopsystem && ` · ${shopsystemLabel(lead.shopsystem)}`} · eingetragen {formatDateTime(lead.eingegangen_am)}
            </span>
          </span>
        }
        actions={
          <button type="button" className="button primary" onClick={pruefen} disabled={busy !== '' || !bereit || freigegeben || !domain}>
            {busy === 'pruefen' ? 'Prüft … (bis 60 s)' : lead.audit_id ? 'Neu prüfen' : 'Shop prüfen'}
          </button>
        }
      />

      {lead.warteliste && !lead.audit_id && (
        <div className="hint-box warn">Dieser Eintrag kam nach Ende der Plätze und hat die Wartelisten-Mail bekommen. Prüfen geht trotzdem, wenn ihr ihn nachholen wollt.</div>
      )}
      <FormError error={error} />

      <div className="akte">
        <div className="akte-main">
          {!entwurf ? (
            <Card title="Report">
              <p className="muted">
                Noch nicht geprüft. „Shop prüfen“ misst den Shop (20–60 Sekunden) und legt aus den Befunden einen ersten Entwurf an. Danach lasst ihr Claude die
                Befunde erklären, lest gegen und schreibt drei eigene Beobachtungen.
              </p>
            </Card>
          ) : (
            <Card
              title="Report"
              actions={
                <div className="segmented">
                  <button type="button" className={ansicht === 'bearbeiten' ? 'is-active' : undefined} onClick={() => setAnsicht('bearbeiten')}>
                    Bearbeiten
                  </button>
                  <button type="button" className={ansicht === 'vorschau' ? 'is-active' : undefined} onClick={() => setAnsicht('vorschau')}>
                    Vorschau
                  </button>
                </div>
              }
            >
              {ansicht === 'vorschau' ? (
                <ReportVorschau report={entwurf} bereiche={bereiche} lead={lead} von={von} />
              ) : (
                <fieldset className="roast-editor" disabled={freigegeben || busy !== ''}>
                  {freigegeben && <p className="hint-box">Der Report ist freigegeben. Zum Ändern erst rechts „Freigabe zurücknehmen“.</p>}
                  <div className="roast-claude">
                    <button type="button" className="button" onClick={claude} disabled={!api || !audit}>
                      {busy === 'claude' ? 'Claude schreibt … (bis 60 s)' : 'Texte von Claude vorschlagen'}
                    </button>
                    <span className="muted small">Erklärt jeden Befund für den Shopbetreiber, dazu Einleitung und Fazit. Zahlen nur aus den Befunden.</span>
                  </div>
                  <Field label="Einleitung" hint="Zwei, drei Sätze, per du. Steht ganz oben im Report." invalid={feld === 'einleitung'} wide>
                    <textarea rows={3} value={entwurf.einleitung} onChange={(e) => aendere((r) => ({ ...r, einleitung: e.target.value }))} />
                  </Field>

                  {bereiche.map((b) => (
                    <div key={b.bereich} className="roast-bereich">
                      <h3 className="subheading">
                        <AmpelPunkt ampel={b.ampel} /> {b.label} <span className="muted small">{AMPEL_LABEL[b.ampel]}</span>
                      </h3>
                      {b.punkte.length === 0 && <p className="muted small">{b.ampel === 'offen' ? b.hinweis || 'Nicht geprüft.' : 'Keine Befunde – im Report steht „Hier haben wir nichts gefunden“.'}</p>}
                      {b.punkte.map((p) => {
                        const original = audit ? befundeVon(audit).find((x) => x.id === p.befund_id) : undefined;
                        const setze = (felder: Partial<typeof p>) => aendere((r) => ({ ...r, punkte: r.punkte.map((x) => (x.befund_id === p.befund_id ? { ...x, ...felder } : x)) }));
                        return (
                          <div key={p.befund_id} className="roast-punkt-edit">
                            <div className="roast-punkt-kopf">
                              <SchwereBadge schwere={p.schwere} />
                              {original && <span className="muted small">Befund: {original.text}</span>}
                              <button
                                type="button"
                                className="link-button small"
                                onClick={() => aendere((r) => ({ ...r, punkte: r.punkte.filter((x) => x.befund_id !== p.befund_id) }))}
                                title="Diesen Befund nicht in den Report übernehmen, z. B. weil das Audit sich geirrt hat"
                              >
                                Entfernen
                              </button>
                            </div>
                            <input value={p.titel} onChange={(e) => setze({ titel: e.target.value })} placeholder="Überschrift, z. B. „Mobil zu langsam“" aria-label="Überschrift" />
                            <textarea rows={3} value={p.text} onChange={(e) => setze({ text: e.target.value })} aria-label="Erklärung" />
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  <h3 className="subheading">Drei Beobachtungen vom Team</h3>
                  <p className="muted small">Was dem Audit entgeht: Gestaltung, Produktseiten, Checkout, Texte. Je eine Überschrift und ein bis drei Sätze.</p>
                  {entwurf.beobachtungen.slice(0, BEOBACHTUNGEN).map((b, i) => {
                    const setze = (felder: Partial<typeof b>) => aendere((r) => ({ ...r, beobachtungen: r.beobachtungen.map((x, j) => (j === i ? { ...x, ...felder } : x)) }));
                    return (
                      <div key={i} className={`roast-punkt-edit${feld === 'beobachtungen' && (!b.titel || !b.text) ? ' invalid' : ''}`}>
                        <input value={b.titel} onChange={(e) => setze({ titel: e.target.value })} placeholder={`Beobachtung ${i + 1}: Überschrift`} aria-label={`Beobachtung ${i + 1}: Überschrift`} />
                        <textarea rows={2} value={b.text} onChange={(e) => setze({ text: e.target.value })} placeholder="Was ist euch aufgefallen, und was würdet ihr ändern?" aria-label={`Beobachtung ${i + 1}: Text`} />
                      </div>
                    );
                  })}

                  <Field label="Fazit" hint="Womit sollten sie anfangen? Zwei, drei Sätze." invalid={feld === 'fazit'} wide>
                    <textarea rows={3} value={entwurf.fazit} onChange={(e) => aendere((r) => ({ ...r, fazit: e.target.value }))} />
                  </Field>
                  <Field label="Geprüft von" hint="Steht im Report über den Beobachtungen." invalid={feld === 'report_von'}>
                    <input
                      value={von}
                      onChange={(e) => {
                        setVon(e.target.value);
                        setGeaendert(true);
                      }}
                      autoComplete="name"
                    />
                  </Field>
                  <div className="form-actions">
                    <button type="button" className="button primary" onClick={speichern} disabled={!geaendert}>
                      {busy === 'speichern' ? 'Speichert …' : geaendert ? 'Speichern' : 'Gespeichert'}
                    </button>
                  </div>
                </fieldset>
              )}
            </Card>
          )}
        </div>

        <div className="akte-side">
          <Card title="Ablauf">
            <ol className="roast-schritte">
              <Schritt nummer={1} titel="Shop prüfen" erledigt={Boolean(lead.audit_id)}>
                {audit ? (
                  <>
                    <span className="badges">
                      <span className={`badge ${audit.status === 'ok' ? 'ok' : audit.status === 'fehler' ? 'aktion-fehler' : 'warn'}`}>{AUDIT_STATUS[audit.status] ?? audit.status}</span>
                      <BefundZahlen audit={audit} />
                    </span>
                    <span className="muted small">
                      {formatDateTime(audit.geprueft_am)} · <Link to={`/audit/${audit.id}`}>Alle Messwerte</Link>
                    </span>
                  </>
                ) : (
                  <span className="muted small">{lead.audit_id ? 'Audit wird geladen …' : 'Oben rechts „Shop prüfen“.'}</span>
                )}
              </Schritt>
              <Schritt nummer={2} titel="Report schreiben" erledigt={schritt === 'freigeben' || schritt === 'senden' || schritt === 'gesendet'}>
                <span className="muted small">Claude-Texte gegenlesen, falsche Befunde entfernen, drei Beobachtungen ergänzen.</span>
              </Schritt>
              <Schritt nummer={3} titel="Freigeben" erledigt={freigegeben}>
                {freigegeben ? (
                  <>
                    <a href={link} target="_blank" rel="noreferrer noopener" className="small">
                      {link.replace('https://', '')}
                    </a>
                    <span className="roast-knoepfe">
                      <button type="button" className="button small" onClick={kopiere}>
                        Link kopieren
                      </button>
                      <button type="button" className="button small subtle" onClick={() => freigeben(false)} disabled={busy !== '' || Boolean(lead.report_gesendet_am)}>
                        Freigabe zurücknehmen
                      </button>
                    </span>
                  </>
                ) : (
                  <button type="button" className="button small" onClick={() => freigeben(true)} disabled={busy !== '' || !entwurf}>
                    {busy === 'freigeben' ? 'Gibt frei …' : 'Report freigeben'}
                  </button>
                )}
              </Schritt>
              <Schritt nummer={4} titel="Report senden" erledigt={Boolean(lead.report_gesendet_am)}>
                {lead.report_gesendet_am ? (
                  <span className="muted small">
                    Gesendet {formatDateTime(lead.report_gesendet_am)}
                    {lead.report_geoeffnet_am ? ` · ${lead.report_aufrufe ?? 1}× geöffnet, zuerst ${formatDateTime(lead.report_geoeffnet_am)}` : ' · noch nicht geöffnet'}
                  </span>
                ) : (
                  <>
                    <a
                      className={`button small${freigegeben ? ' primary' : ' is-disabled'}`}
                      href={freigegeben ? gmail(reportMail(lead, signatur)) : undefined}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-disabled={!freigegeben}
                      onClick={(e) => {
                        if (!freigegeben) e.preventDefault();
                        else void gesendet();
                      }}
                    >
                      In Gmail öffnen
                    </a>
                    <span className="muted small">Öffnet einen Entwurf aus deinem Postfach und markiert den Report als gesendet.</span>
                  </>
                )}
              </Schritt>
            </ol>
          </Card>
          <Card title="Danach">
            <p className="muted small">
              Ins CRM übernehmen wie gewohnt unter <Link to="/magnete">Leads</Link>. Das Audit wandert dabei an die neue Firma, die Aufhänger stehen dann im Contact Generator bereit.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
