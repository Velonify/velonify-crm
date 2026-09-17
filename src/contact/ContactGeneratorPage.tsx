import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, Field, FormError, Loading, PageHeader } from '../components/ui';
import {
  aktiveLeistungen,
  baueAnfrage,
  KANAELE,
  kanalInfo,
  leistungsTitel,
  mailtoLink,
  mitSignatur,
  offeneDeals,
  signaturSchluessel,
  vornameAus,
  zeichen,
  type Anrede,
  type Kanal,
  type LeistungsWahl,
  type Variante,
} from '../data/anschreiben';
import { useCrm } from '../data/CrmContext';
import { phaseLabel } from '../data/constants';
import type { CrmService } from '../data/crm';
import { AuthExpiredError } from '../data/errors';
import { kontaktName } from '../data/rules';
import type { ContactDaten, Database } from '../data/types';
import { errorMessage, fieldOf } from '../lib/errors';
import { useIch } from '../lib/useIch';
import { useContactDaten, useGenerator } from './useContactDaten';

const ABSENDER_KEY = 'velonify-crm.absender';
const KANAL_KEY = 'velonify-crm.kanal';

function lies(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function merke(key: string, wert: string) {
  try {
    localStorage.setItem(key, wert);
  } catch {
    // Storage blocked: the value lasts until reload.
  }
}

function Segmented<T extends string>({ label, werte, wert, onChange }: { label: string; werte: readonly { wert: T; label: string }[]; wert: T; onChange(wert: T): void }) {
  return (
    <fieldset className="plain">
      <legend>{label}</legend>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {werte.map((w) => (
          <button key={w.wert} type="button" role="radio" aria-checked={wert === w.wert} className={wert === w.wert ? 'is-active' : ''} onClick={() => onChange(w.wert)}>
            {w.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const SPRACHEN = [
  { wert: 'de', label: 'Deutsch' },
  { wert: 'en', label: 'English' },
] as const;
const ANREDEN = [
  { wert: 'sie', label: 'Sie' },
  { wert: 'du', label: 'Du' },
] as const;

function Generator({ db, daten, aendern }: { db: Database; daten: ContactDaten; aendern: <T>(a: (s: CrmService) => Promise<T>) => Promise<T> }) {
  const [params] = useSearchParams();
  const { state, expire } = useAuth();
  const toast = useToast();
  const generator = useGenerator();
  const [ich] = useIch(db.listen.team);
  const user = state.status === 'signedOut' ? null : state.user;
  const leistungen = useMemo(() => aktiveLeistungen(daten.leistungen), [daten]);

  const firmen = useMemo(() => db.firmen.filter((f) => !f.archiviert).sort((a, b) => a.name.localeCompare(b.name, 'de')), [db]);
  const vorschlag = (firmaId: string, kontaktId?: string | null) => {
    const deals = offeneDeals(db.deals, firmaId);
    const kontakt = db.kontakte.find((k) => k.id === kontaktId && k.firma_id === firmaId) ?? db.kontakte.find((k) => k.firma_id === firmaId && k.hauptkontakt && !k.archiviert);
    return { kontaktId: kontakt?.id ?? '', dealId: deals.length === 1 ? deals[0].id : '' };
  };

  const [firmaId, setFirmaId] = useState(() => params.get('firma') ?? '');
  const [kontaktId, setKontaktId] = useState(() => vorschlag(params.get('firma') ?? '', params.get('kontakt')).kontaktId);
  const [dealId, setDealId] = useState(() => vorschlag(params.get('firma') ?? '').dealId);
  const [kanal, setKanal] = useState<Kanal>(() => (kanalInfo(lies(KANAL_KEY))?.wert ?? 'linkedin_notiz'));
  const [anrede, setAnrede] = useState<Anrede>(() => kanalInfo(kanal)?.anrede ?? 'sie');
  const [sprache, setSprache] = useState<'de' | 'en'>('de');
  const [leistungWert, setLeistungWert] = useState('');
  const [manuell, setManuell] = useState({ titel: '', beschreibung: '' });
  const [absender, setAbsender] = useState(() => lies(ABSENDER_KEY) || vornameAus(user?.name ?? '', user?.email ?? ''));
  const [aufhaenger, setAufhaenger] = useState('');

  const [varianten, setVarianten] = useState<Variante[]>([]);
  const [aktiv, setAktiv] = useState(0);
  const [hinweis, setHinweis] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<unknown>();
  const [neuerDeal, setNeuerDeal] = useState(true);
  const [sendet, setSendet] = useState(false);
  const [gesendet, setGesendet] = useState(false);

  const signaturKey = signaturSchluessel(user?.email ?? '');
  const [signatur, setSignatur] = useState(db.einstellungen[signaturKey] ?? '');
  const [signaturOffen, setSignaturOffen] = useState(false);
  const [signaturBusy, setSignaturBusy] = useState(false);

  const firma = db.firmen.find((f) => f.id === firmaId);
  const kontakte = db.kontakte.filter((k) => k.firma_id === firmaId && !k.archiviert);
  const kontakt = kontakte.find((k) => k.id === kontaktId);
  const deals = offeneDeals(db.deals, firmaId);
  const gewaehlteLeistung = leistungen.find((l) => l.id === leistungWert);
  const wahl: LeistungsWahl | null = gewaehlteLeistung
    ? { art: 'liste', leistung: gewaehlteLeistung }
    : leistungWert === 'manuell'
      ? { art: 'manuell', ...manuell }
      : null;
  const info = kanalInfo(kanal)!;
  const variante = varianten[aktiv];
  const istEmail = kanal === 'email';
  const invalid = fieldOf(fehler);

  // Leaving with unsent texts asks first.
  useEffect(() => {
    if (varianten.length === 0 || gesendet) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [varianten.length, gesendet]);

  const wechsleFirma = (id: string) => {
    const v = vorschlag(id);
    setFirmaId(id);
    setKontaktId(v.kontaktId);
    setDealId(v.dealId);
  };

  const wechsleKanal = (wert: Kanal) => {
    setKanal(wert);
    setAnrede(kanalInfo(wert)?.anrede ?? 'sie');
    merke(KANAL_KEY, wert);
  };

  const generieren = async (mitHinweis = false) => {
    setFehler(undefined);
    if (!firma) return setFehler(Object.assign(new Error('Bitte eine Firma wählen.'), { field: 'firma_id' }));
    if (!wahl) return setFehler(Object.assign(new Error('Bitte eine Leistung wählen oder manuell beschreiben.'), { field: 'leistung' }));
    if (!generator) return setFehler(new Error('Die Adresse des Contact Generators fehlt (VITE_CONTACT_GENERATOR_URL).'));
    setBusy(true);
    try {
      const anfrage = baueAnfrage({ kanal, sprache, anrede, absender, firma, kontakt, leistung: wahl, aufhaenger, hinweis: mitHinweis ? hinweis : '' });
      merke(ABSENDER_KEY, absender.trim());
      const neu = await generator.generiere(anfrage);
      setVarianten(neu);
      setAktiv(0);
      setGesendet(false);
    } catch (err) {
      if (err instanceof AuthExpiredError) expire();
      setFehler(err);
    } finally {
      setBusy(false);
    }
  };

  const aendereVariante = (changes: Partial<Variante>) => {
    setVarianten((alle) => alle.map((v, i) => (i === aktiv ? { ...v, ...changes } : v)));
    setGesendet(false);
  };

  const kopieren = async (text: string, meldung: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(meldung);
    } catch {
      toast.show('Kopieren war nicht möglich. Bitte den Text markieren und selbst kopieren.', 'error');
    }
  };

  const signaturSpeichern = async () => {
    setSignaturBusy(true);
    try {
      await aendern((s) => s.saveEinstellungen({ [signaturKey]: signatur.trim() }));
      toast.show('Signatur gespeichert');
      setSignaturOffen(false);
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setSignaturBusy(false);
    }
  };

  const alsGesendet = async () => {
    if (!firma || !wahl || !variante) return;
    setSendet(true);
    setFehler(undefined);
    try {
      await aendern((s) =>
        s.markiereGesendet(
          {
            firma_id: firma.id,
            kontakt_id: kontaktId,
            deal_id: dealId,
            kanal,
            leistung_id: wahl.art === 'liste' ? wahl.leistung.id : '',
            leistung: leistungsTitel(wahl),
            sprache,
            anrede,
            aufhaenger,
            betreff: variante.betreff,
            text: istEmail ? mitSignatur(variante.text, signatur) : variante.text,
          },
          !dealId && deals.length === 0 && neuerDeal ? { neuerDeal: { titel: leistungsTitel(wahl), zustaendig: firma.zustaendig || ich || '' } } : {},
        ),
      );
      setGesendet(true);
      toast.show('Im Verlauf eingetragen');
    } catch (err) {
      setFehler(err);
      toast.show(errorMessage(err), 'error');
    } finally {
      setSendet(false);
    }
  };

  const laenge = variante ? zeichen(variante.text) : 0;
  const zuLang = Boolean(info.zeichenLimit && laenge > info.zeichenLimit);
  const outreachLeer = wahl?.art === 'liste' && !wahl.leistung.anlass && !wahl.leistung.nutzen && !wahl.leistung.beleg;
  const dealVorher = db.deals.find((d) => d.id === dealId);

  return (
    <div className="page wide">
      <PageHeader
        eyebrow="Contact Generator"
        title="Neues Anschreiben"
        subtitle="Firma, Kanal und Leistung wählen. Claude schreibt drei Varianten, gesendet wird von Hand."
      />

      <div className="contact-layout">
        <div className="contact-spalte">
          <Card title="Empfänger">
            <div className="grid">
              <Field label="Firma" invalid={invalid === 'firma_id'} wide>
                <select value={firmaId} onChange={(e) => wechsleFirma(e.target.value)}>
                  <option value="">Bitte wählen …</option>
                  {firmen.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.kuerzel ? ` (${f.kuerzel})` : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ansprechpartner" hint={kontakt?.rolle || (kontakte.length === 0 && firma ? 'Keine Kontakte hinterlegt – Claude spricht die Firma an' : undefined)}>
                <select value={kontaktId} onChange={(e) => setKontaktId(e.target.value)} disabled={!firma}>
                  <option value="">Keiner</option>
                  {kontakte.map((k) => (
                    <option key={k.id} value={k.id}>
                      {kontaktName(k) || k.email}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Deal" hint={dealVorher ? `Phase: ${phaseLabel(dealVorher.phase)}` : undefined}>
                <select value={dealId} onChange={(e) => setDealId(e.target.value)} disabled={!firma}>
                  <option value="">Ohne Deal</option>
                  {deals.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.titel}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {firma && (
              <p className="small muted contact-daten">
                An Claude gehen: {[firma.name, firma.domain, firma.ort, [firma.plattform, firma.version].filter(Boolean).join(' '), firma.tech_info && 'Technik', firma.notiz && 'Notiz'].filter(Boolean).join(' · ')}
                {kontakt && ` · ${kontaktName(kontakt)}${kontakt.rolle ? ` (${kontakt.rolle})` : ''}`}. Keine E-Mail-Adressen, Telefonnummern oder Deal-Werte.{' '}
                <Link to={`/crm/firmen/${firma.id}`}>Firmenakte</Link>
              </p>
            )}
          </Card>

          <Card title="Nachricht">
            <div className="contact-optionen">
              <Segmented label="Kanal" werte={KANAELE} wert={kanal} onChange={wechsleKanal} />
              <div className="contact-optionen-reihe">
                <Segmented<"de" | "en"> label="Sprache" werte={SPRACHEN} wert={sprache} onChange={setSprache} />
                <Segmented<Anrede> label="Anrede" werte={ANREDEN} wert={anrede} onChange={setAnrede} />
              </div>
            </div>
            <div className="grid">
              <Field label="Leistung" invalid={invalid === 'leistung'} wide>
                <select value={leistungWert} onChange={(e) => setLeistungWert(e.target.value)}>
                  <option value="">Bitte wählen …</option>
                  {leistungen.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.titel}
                    </option>
                  ))}
                  <option value="manuell">Manuell</option>
                </select>
              </Field>
              {leistungWert === 'manuell' && (
                <>
                  <Field label="Titel" wide>
                    <input value={manuell.titel} onChange={(e) => setManuell((m) => ({ ...m, titel: e.target.value }))} placeholder="z. B. Media Buying für Meta und TikTok" autoComplete="off" />
                  </Field>
                  <Field label="Worum geht's?" hint="Was die Leistung umfasst und was der Kunde davon hat" wide>
                    <textarea rows={3} value={manuell.beschreibung} onChange={(e) => setManuell((m) => ({ ...m, beschreibung: e.target.value }))} />
                  </Field>
                </>
              )}
              <Field label="Absender" hint="Vorname, mit dem die Nachricht unterschrieben wird" invalid={invalid === 'absender'}>
                <input value={absender} onChange={(e) => setAbsender(e.target.value)} autoComplete="given-name" />
              </Field>
              <Field label="Aufhänger (optional)" hint="Was nicht im CRM steht: Beobachtung im Shop, Post, Messe, gemeinsamer Kontakt" wide>
                <textarea rows={3} value={aufhaenger} onChange={(e) => setAufhaenger(e.target.value)} placeholder="z. B. Neue Herbstkollektion online, Ladezeit der Startseite über 5 Sekunden" />
              </Field>
            </div>
            {leistungen.length === 0 && (
              <p className="hint-box">
                Noch keine Leistungen hinterlegt. <Link to="/contact/leistungen">Startliste übernehmen</Link> oder „Manuell“ wählen.
              </p>
            )}
            {outreachLeer && (
              <p className="hint-box">
                Für „{wahl.leistung.titel}“ sind noch kein Anlass, Nutzen oder Beleg hinterlegt. Claude arbeitet dann nur mit Titel und Beschreibung.{' '}
                <Link to="/contact/leistungen">Leistungen pflegen</Link>
              </p>
            )}
            {istEmail && (
              <p className="hint-box warn small">
                Werbe-E-Mails an Firmen ohne vorherige Einwilligung sind in Deutschland unzulässig (§ 7 UWG). E-Mail nur an Kontakte, die zugestimmt haben oder mit denen es schon Austausch gibt.
              </p>
            )}
            <FormError error={varianten.length === 0 ? fehler : undefined} />
            <div className="form-actions">
              <button type="button" className="button primary large" onClick={() => generieren()} disabled={busy}>
                {busy ? 'Claude schreibt …' : varianten.length > 0 ? 'Neu generieren' : 'Generieren'}
              </button>
            </div>
          </Card>
        </div>

        <div className="contact-spalte">
          <Card
            title="Ergebnis"
            className="contact-ergebnis"
            actions={
              varianten.length > 1 && (
                <div className="segmented" role="tablist" aria-label="Varianten">
                  {varianten.map((_, i) => (
                    <button key={i} type="button" role="tab" aria-selected={aktiv === i} className={aktiv === i ? 'is-active' : ''} onClick={() => setAktiv(i)}>
                      Variante {i + 1}
                    </button>
                  ))}
                </div>
              )
            }
          >
            {busy && <Loading label="Claude schreibt drei Varianten. Das dauert meist 20 bis 40 Sekunden …" />}
            {!busy && !variante && (
              <p className="muted">
                Hier erscheinen die Varianten. Du kannst sie bearbeiten, kopieren und nach dem Senden als gesendet markieren. Dann steht die Nachricht im Verlauf der Firma.
              </p>
            )}
            {!busy && variante && (
              <div className="contact-text">
                {istEmail && (
                  <Field label="Betreff" invalid={invalid === 'betreff'}>
                    <div className="input-row">
                      <input value={variante.betreff} onChange={(e) => aendereVariante({ betreff: e.target.value })} />
                      <button type="button" className="button small" onClick={() => kopieren(variante.betreff, 'Betreff kopiert')}>
                        Kopieren
                      </button>
                    </div>
                  </Field>
                )}
                <Field label="Text" invalid={invalid === 'text' || zuLang}>
                  <textarea className="nachricht-text" value={variante.text} onChange={(e) => aendereVariante({ text: e.target.value })} rows={istEmail ? 12 : 8} />
                </Field>
                <div className="contact-zeile">
                  <span className={`zeichen${zuLang ? ' zu-lang' : ''}`}>
                    {laenge}
                    {info.zeichenLimit ? ` / ${info.zeichenLimit}` : ''} Zeichen
                  </span>
                  {istEmail && (
                    <button type="button" className="link-button small" onClick={() => setSignaturOffen((o) => !o)}>
                      {signatur ? 'Signatur bearbeiten' : 'Signatur hinterlegen'}
                    </button>
                  )}
                </div>
                {istEmail && (signaturOffen || signatur) && (
                  <div className="signatur">
                    {signaturOffen ? (
                      <>
                        <Field label="Meine Signatur" hint="Wird an E-Mails angehängt und nur für dich gespeichert">
                          <textarea rows={4} value={signatur} onChange={(e) => setSignatur(e.target.value)} placeholder={'Lukas Hanke\nVelonify\nvelonify.de'} />
                        </Field>
                        <div className="form-actions">
                          <button type="button" className="button small" onClick={signaturSpeichern} disabled={signaturBusy}>
                            {signaturBusy ? 'Speichert …' : 'Signatur speichern'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <pre className="signatur-vorschau">{signatur}</pre>
                    )}
                  </div>
                )}
                <div className="contact-aktionen">
                  <button type="button" className="button" onClick={() => kopieren(istEmail ? mitSignatur(variante.text, signatur) : variante.text, 'Text kopiert')}>
                    Text kopieren
                  </button>
                  {istEmail && kontakt?.email && (
                    <a className="button" href={mailtoLink(kontakt.email, variante.betreff, mitSignatur(variante.text, signatur))}>
                      In Mail öffnen
                    </a>
                  )}
                </div>

                <div className="contact-neu">
                  <div className="input-row">
                    <input value={hinweis} onChange={(e) => setHinweis(e.target.value)} placeholder="Wunsch für neue Varianten, z. B. kürzer, weniger formell" aria-label="Wunsch für neue Varianten" />
                    <button type="button" className="button" onClick={() => generieren(true)} disabled={busy || !hinweis.trim()}>
                      Überarbeiten
                    </button>
                  </div>
                </div>

                <div className="contact-senden">
                  {!dealId && deals.length === 0 && firma && wahl && (
                    <label className="checkbox">
                      <input type="checkbox" checked={neuerDeal} onChange={(e) => setNeuerDeal(e.target.checked)} />
                      Deal „{leistungsTitel(wahl)}“ anlegen
                    </label>
                  )}
                  <p className="small muted">
                    Erst selbst senden, dann markieren. Die Nachricht landet im Verlauf
                    {dealVorher && (dealVorher.phase === 'neu' || dealVorher.phase === 'qualifiziert') ? ', der Deal wechselt auf „Kontaktiert“' : ''}.
                  </p>
                  <FormError error={fehler} />
                  {gesendet ? (
                    <p className="hint-box success">
                      Als gesendet eingetragen. <Link to={`/crm/firmen/${firmaId}`}>Zur Firmenakte</Link> · <Link to="/contact/gesendet">Alle gesendeten</Link>
                    </p>
                  ) : (
                    <button type="button" className="button primary large" onClick={alsGesendet} disabled={sendet || zuLang || !variante.text.trim()}>
                      {sendet ? 'Trägt ein …' : 'Als gesendet markieren'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export function ContactGeneratorPage() {
  const { data, error, loading, reload, aendern } = useContactDaten();
  const { db, error: crmError, refresh } = useCrm();
  if (!data || !db) {
    const fehler = error ?? crmError;
    return <div className="page">{fehler ? <ErrorBox error={fehler} onRetry={error ? reload : refresh} /> : loading && <Loading />}</div>;
  }
  return <Generator db={db} daten={data} aendern={aendern} />;
}
