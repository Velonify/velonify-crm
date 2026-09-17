import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useToast } from '../components/Toasts';
import { ErrorBox, Field, FormError, Loading, PageHeader } from '../components/ui';
import {
  aendereKategorie,
  aenderePosten,
  anzahlPosten,
  entfernePosten,
  fuegeManuellHinzu,
  istGewaehlt,
  kategorieStatus,
  leereAuswahl,
  naechsteNummer,
  parseAuswahl,
  schalteKategorie,
  schalteLeistung,
  statusLabel,
  uebersetze,
  type KategorieStatus,
  type ManuellZiel,
} from '../data/angebote';
import { useCrm } from '../data/CrmContext';
import { isAbgeschlossen } from '../data/constants';
import type { CrmService } from '../data/crm';
import { ABRECHNUNGEN, katalogBaum, SPRACHEN, type KategorieMitLeistungen, type Sprache } from '../data/katalog';
import type { Angebot, AngebotsDaten, Auswahl, AuswahlKategorie, AuswahlPosten, Database } from '../data/types';
import { errorMessage, fieldOf } from '../lib/errors';
import { useAngebotsDaten } from './useAngebotsDaten';

type Kopf = { nummer: string; sprache: Sprache; firma_id: string; deal_id: string; kontakt_id: string; titel: string };

function TriCheckbox({ status, label, onChange }: { status: KategorieStatus; label: string; onChange(): void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = status === 'teilweise';
  }, [status]);
  return <input ref={ref} type="checkbox" checked={status === 'alle'} onChange={onChange} aria-label={`${label}: alle Unterpunkte`} />;
}

function PostenZeile({
  posten,
  kategorie,
  onChange,
  onRemove,
}: {
  posten: AuswahlPosten;
  kategorie: AuswahlKategorie;
  onChange(notiz: string): void;
  onRemove?: () => void;
}) {
  // The note field only opens on request, so a long selection stays easy to scan.
  const [offen, setOffen] = useState(Boolean(posten.notiz));
  return (
    <div className="auswahl-notiz">
      {offen ? (
        <input
          value={posten.notiz}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Notiz fürs Sheet, z. B. „4 Sprachen: DE, EN, FR, ES“"
          aria-label={`Notiz zu ${posten.titel} (${kategorie.titel})`}
          autoFocus={!posten.notiz}
        />
      ) : (
        <button type="button" className="link-button small" onClick={() => setOffen(true)}>
          + Notiz
        </button>
      )}
      {onRemove && (
        <button type="button" className="icon-button small" onClick={onRemove} aria-label={`${posten.titel} entfernen`} title="Entfernen">
          ×
        </button>
      )}
    </div>
  );
}

function KategorieBlock({
  titel,
  abrechnung,
  gewaehlt,
  gesamt,
  status,
  offen,
  kategorie,
  onToggleOffen,
  onToggleAlle,
  onOptional,
  children,
}: {
  titel: string;
  abrechnung: string;
  gewaehlt: number;
  gesamt: number | null;
  status: KategorieStatus;
  offen: boolean;
  kategorie?: AuswahlKategorie;
  onToggleOffen(): void;
  onToggleAlle(): void;
  onOptional(optional: boolean): void;
  children: React.ReactNode;
}) {
  return (
    <li className={`auswahl-kategorie${gewaehlt > 0 ? ' is-selected' : ''}`}>
      <div className="auswahl-kopf">
        <TriCheckbox status={status} label={titel} onChange={onToggleAlle} />
        <button type="button" className="auswahl-titel" aria-expanded={offen} onClick={onToggleOffen}>
          <span>{titel}</span>
          <span className="tool-switch-chevron" aria-hidden="true" />
        </button>
        <span className="auswahl-meta">
          {abrechnung === 'monatlich' && <span className="badge phase-kontaktiert">Monatlich</span>}
          {kategorie && (
            <label className="checkbox">
              <input type="checkbox" checked={kategorie.optional} onChange={(e) => onOptional(e.target.checked)} />
              Optional
            </label>
          )}
          <span className="count">{gesamt === null ? gewaehlt : `${gewaehlt}/${gesamt}`}</span>
        </span>
      </div>
      {offen && <ul className="auswahl-posten">{children}</ul>}
    </li>
  );
}

function AngebotFormular({ daten, db, angebot, aendern }: { daten: AngebotsDaten; db: Database; angebot?: Angebot; aendern: <T>(a: (s: CrmService) => Promise<T>) => Promise<T> }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const baum = useMemo(() => katalogBaum(daten), [daten]);

  const firmen = useMemo(() => db.firmen.filter((f) => !f.archiviert || f.id === angebot?.firma_id).sort((a, b) => a.name.localeCompare(b.name, 'de')), [db, angebot]);
  const vorschlag = (firmaId: string) => {
    const deals = db.deals.filter((d) => d.firma_id === firmaId && !d.archiviert && !isAbgeschlossen(d.phase));
    const kontakt = db.kontakte.find((k) => k.firma_id === firmaId && k.hauptkontakt && !k.archiviert);
    return { deal: deals.length === 1 ? deals[0] : undefined, kontaktId: kontakt?.id ?? '' };
  };

  const [kopf, setKopf] = useState<Kopf>(() => {
    if (angebot) {
      const { nummer, firma_id, deal_id, kontakt_id, titel } = angebot;
      return { nummer, sprache: angebot.sprache === 'en' ? 'en' : 'de', firma_id, deal_id, kontakt_id, titel };
    }
    const firmaId = params.get('firma') ?? '';
    const deal = db.deals.find((d) => d.id === params.get('deal')) ?? (firmaId ? vorschlag(firmaId).deal : undefined);
    return {
      nummer: naechsteNummer(daten.angebote, new Date().getFullYear()),
      sprache: 'de',
      firma_id: deal?.firma_id ?? firmaId,
      deal_id: deal?.id ?? '',
      kontakt_id: firmaId || deal ? vorschlag(deal?.firma_id ?? firmaId).kontaktId : '',
      titel: deal?.titel ?? '',
    };
  });
  const [auswahl, setAuswahl] = useState<Auswahl>(() => (angebot ? parseAuswahl(angebot.auswahl) : leereAuswahl()));
  const [offen, setOffen] = useState<Set<string>>(() => new Set((angebot ? parseAuswahl(angebot.auswahl) : leereAuswahl()).kategorien.map((k) => k.schluessel)));
  const [manuell, setManuell] = useState({ titel: '', ziel: baum[0] ? `k:${baum[0].kategorie.id}` : 'neu', neuTitel: '', neuAbrechnung: 'einmalig' });
  const [manuellFehler, setManuellFehler] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [dirty, setDirty] = useState(false);
  const invalid = fieldOf(error);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const aendereAuswahl = (next: Auswahl) => {
    setAuswahl(next);
    setDirty(true);
  };
  const setzeKopf = (changes: Partial<Kopf>) => {
    setKopf((k) => ({ ...k, ...changes }));
    setDirty(true);
  };
  const schalteOffen = (schluessel: string, wert?: boolean) =>
    setOffen((o) => {
      const next = new Set(o);
      if (wert ?? !next.has(schluessel)) next.add(schluessel);
      else next.delete(schluessel);
      return next;
    });

  const firmaDeals = db.deals.filter((d) => d.firma_id === kopf.firma_id && (!d.archiviert || d.id === kopf.deal_id));
  const firmaKontakte = db.kontakte.filter((k) => k.firma_id === kopf.firma_id && (!k.archiviert || k.id === kopf.kontakt_id));
  const gewaehlteKategorie = (id: string) => auswahl.kategorien.find((k) => k.kategorie_id === id);
  const katalogIds = new Set(baum.map((k) => k.kategorie.id));
  const eigene = auswahl.kategorien.filter((k) => !katalogIds.has(k.kategorie_id));

  const wechsleFirma = (firmaId: string) => {
    const { deal, kontaktId } = vorschlag(firmaId);
    setzeKopf({ firma_id: firmaId, deal_id: deal?.id ?? '', kontakt_id: kontaktId, titel: kopf.titel || deal?.titel || '' });
  };

  const wechsleSprache = (sprache: Sprache) => {
    setzeKopf({ sprache });
    aendereAuswahl(uebersetze(auswahl, baum, sprache));
  };

  const hinzufuegen = () => {
    setManuellFehler(undefined);
    try {
      let ziel: ManuellZiel;
      if (manuell.ziel === 'neu') ziel = { art: 'neu', titel: manuell.neuTitel, abrechnung: manuell.neuAbrechnung };
      else if (manuell.ziel.startsWith('a:')) ziel = { art: 'auswahl', schluessel: manuell.ziel.slice(2) };
      else {
        const eintrag = baum.find((k) => k.kategorie.id === manuell.ziel.slice(2));
        if (!eintrag) throw new Error('Bitte eine Hauptkategorie wählen.');
        ziel = { art: 'katalog', kategorie: eintrag.kategorie };
      }
      const next = fuegeManuellHinzu(auswahl, baum, manuell.titel, ziel, kopf.sprache);
      const neueKategorie = next.kategorien.find((k) => !auswahl.kategorien.some((a) => a.schluessel === k.schluessel));
      const zielSchluessel = ziel.art === 'katalog' ? ziel.kategorie.id : ziel.art === 'auswahl' ? ziel.schluessel : neueKategorie?.schluessel;
      aendereAuswahl(next);
      if (zielSchluessel) schalteOffen(zielSchluessel, true);
      setManuell((m) => ({ ...m, titel: '', neuTitel: '', ziel: ziel.art === 'neu' && neueKategorie ? `a:${neueKategorie.schluessel}` : m.ziel }));
    } catch (err) {
      setManuellFehler(err);
    }
  };

  const speichern = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const gespeichert = await aendern((s) => s.saveAngebot({ ...kopf, auswahl }, angebot && { id: angebot.id, expectedGeaendertAm: angebot.geaendert_am }));
      setDirty(false);
      toast.show(angebot ? 'Angebot gespeichert' : `Angebot ${gespeichert.nummer} angelegt`);
      if (!angebot) navigate(`/angebote/${gespeichert.id}`, { replace: true });
    } catch (err) {
      setError(err);
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const extraPosten = (eintrag: KategorieMitLeistungen, kategorie?: AuswahlKategorie) =>
    kategorie?.posten.filter((p) => !eintrag.leistungen.some((l) => l.id === p.leistung_id)) ?? [];

  const summe = {
    kategorien: auswahl.kategorien.length,
    posten: anzahlPosten(auswahl),
    monatlich: auswahl.kategorien.filter((k) => k.abrechnung === 'monatlich').length,
    optional: auswahl.kategorien.filter((k) => k.optional).length,
  };
  const firma = db.firmen.find((f) => f.id === kopf.firma_id);

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <>
            <Link to="/angebote">Angebote</Link> {angebot && `· ${statusLabel(angebot.status)}`}
          </>
        }
        title={angebot ? `Angebot ${angebot.nummer}` : 'Neues Angebot'}
        subtitle={angebot ? `${angebot.titel}${firma ? ` · ${firma.name}` : ''}` : 'Firma wählen, Sprache festlegen und die Leistungen ankreuzen.'}
      />

      <div className="angebot-layout">
        <div className="angebot-main">
          <section className="card">
            <header className="card-header">
              <h2>Angebot</h2>
            </header>
            <div className="grid">
              <Field label="Firma" invalid={invalid === 'firma_id'}>
                <select value={kopf.firma_id} onChange={(e) => wechsleFirma(e.target.value)}>
                  <option value="">Bitte wählen …</option>
                  {firmen.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.kuerzel ? ` (${f.kuerzel})` : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Deal" invalid={invalid === 'deal_id'}>
                <select value={kopf.deal_id} onChange={(e) => setzeKopf({ deal_id: e.target.value, titel: kopf.titel || firmaDeals.find((d) => d.id === e.target.value)?.titel || '' })} disabled={!kopf.firma_id}>
                  <option value="">Ohne Deal</option>
                  {firmaDeals.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.titel}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ansprechpartner" invalid={invalid === 'kontakt_id'}>
                <select value={kopf.kontakt_id} onChange={(e) => setzeKopf({ kontakt_id: e.target.value })} disabled={!kopf.firma_id}>
                  <option value="">Keiner</option>
                  {firmaKontakte.map((k) => (
                    <option key={k.id} value={k.id}>
                      {[k.vorname, k.nachname].filter(Boolean).join(' ') || k.email}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Angebot-Nr." invalid={invalid === 'nummer'} hint="Format JJJJ/NN, wird fortlaufend vorgeschlagen">
                <input value={kopf.nummer} onChange={(e) => setzeKopf({ nummer: e.target.value })} autoComplete="off" />
              </Field>
              <Field label="Titel" invalid={invalid === 'titel'} wide>
                <input value={kopf.titel} onChange={(e) => setzeKopf({ titel: e.target.value })} placeholder="z. B. Shopify-Plus-Migration" autoComplete="off" />
              </Field>
            </div>
            <fieldset className="plain sprache-wahl">
              <legend>Sprache des Angebots</legend>
              <div className="segmented" role="radiogroup" aria-label="Sprache">
                {SPRACHEN.map((s) => (
                  <button key={s.wert} type="button" role="radio" aria-checked={kopf.sprache === s.wert} className={kopf.sprache === s.wert ? 'is-active' : ''} onClick={() => wechsleSprache(s.wert)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </section>

          <section className={`card${invalid === 'auswahl' ? ' is-invalid' : ''}`}>
            <header className="card-header">
              <h2>
                Leistungen <span className="count">{summe.posten}</span>
              </h2>
              <div className="card-actions">
                <button type="button" className="button small subtle" onClick={() => setOffen(new Set([...baum.map((k) => k.kategorie.id), ...eigene.map((k) => k.schluessel)]))}>
                  Alle aufklappen
                </button>
                <button type="button" className="button small subtle" onClick={() => setOffen(new Set())}>
                  Zuklappen
                </button>
              </div>
            </header>
            {baum.length === 0 && (
              <p className="muted">
                Der Katalog ist leer. <Link to="/angebote/leistungen">Leistungen pflegen</Link> oder unten manuell hinzufügen.
              </p>
            )}
            <ul className="auswahl">
              {baum.map((eintrag) => {
                const k = eintrag.kategorie;
                const gewaehlt = gewaehlteKategorie(k.id);
                const extra = extraPosten(eintrag, gewaehlt);
                return (
                  <KategorieBlock
                    key={k.id}
                    titel={kopf.sprache === 'en' ? k.titel_en || k.titel_de : k.titel_de}
                    abrechnung={k.abrechnung}
                    gewaehlt={gewaehlt?.posten.length ?? 0}
                    gesamt={eintrag.leistungen.length + extra.length}
                    status={kategorieStatus(auswahl, eintrag)}
                    offen={offen.has(k.id)}
                    kategorie={gewaehlt}
                    onToggleOffen={() => schalteOffen(k.id)}
                    onToggleAlle={() => {
                      aendereAuswahl(schalteKategorie(auswahl, baum, eintrag, kopf.sprache));
                      schalteOffen(k.id, true);
                    }}
                    onOptional={(optional) => aendereAuswahl(aendereKategorie(auswahl, k.id, { optional }))}
                  >
                    {eintrag.leistungen.map((l) => {
                      const posten = gewaehlt?.posten.find((p) => p.leistung_id === l.id);
                      return (
                        <li key={l.id} className={posten ? 'is-selected' : undefined}>
                          <label className="auswahl-punkt">
                            <input type="checkbox" checked={istGewaehlt(auswahl, l)} onChange={() => aendereAuswahl(schalteLeistung(auswahl, baum, l, kopf.sprache))} />
                            <span>
                              <span className="strong">{kopf.sprache === 'en' ? l.titel_en || l.titel_de : l.titel_de}</span>
                              <span className="muted small">{kopf.sprache === 'en' ? l.text_en || l.text_de : l.text_de}</span>
                            </span>
                          </label>
                          {posten && gewaehlt && (
                            <PostenZeile posten={posten} kategorie={gewaehlt} onChange={(notiz) => aendereAuswahl(aenderePosten(auswahl, gewaehlt.schluessel, posten.schluessel, { notiz }))} />
                          )}
                        </li>
                      );
                    })}
                    {gewaehlt &&
                      extra.map((p) => (
                        <li key={p.schluessel} className="is-selected">
                          <div className="auswahl-punkt">
                            <input type="checkbox" checked disabled aria-label={p.titel} />
                            <span>
                              <span className="strong">{p.titel}</span> <span className="badge subtle">{p.leistung_id ? 'nicht mehr im Katalog' : 'manuell'}</span>
                            </span>
                          </div>
                          <PostenZeile
                            posten={p}
                            kategorie={gewaehlt}
                            onChange={(notiz) => aendereAuswahl(aenderePosten(auswahl, gewaehlt.schluessel, p.schluessel, { notiz }))}
                            onRemove={() => aendereAuswahl(entfernePosten(auswahl, gewaehlt.schluessel, p.schluessel))}
                          />
                        </li>
                      ))}
                  </KategorieBlock>
                );
              })}
              {eigene.map((k) => (
                <KategorieBlock
                  key={k.schluessel}
                  titel={k.titel}
                  abrechnung={k.abrechnung}
                  gewaehlt={k.posten.length}
                  gesamt={null}
                  status="alle"
                  offen={offen.has(k.schluessel)}
                  kategorie={k}
                  onToggleOffen={() => schalteOffen(k.schluessel)}
                  onToggleAlle={() => {
                    if (window.confirm(`„${k.titel}“ mit ${k.posten.length} Unterpunkten entfernen?`)) {
                      aendereAuswahl({ kategorien: auswahl.kategorien.filter((a) => a.schluessel !== k.schluessel) });
                    }
                  }}
                  onOptional={(optional) => aendereAuswahl(aendereKategorie(auswahl, k.schluessel, { optional }))}
                >
                  {k.posten.map((p) => (
                    <li key={p.schluessel} className="is-selected">
                      <div className="auswahl-punkt">
                        <input type="checkbox" checked disabled aria-label={p.titel} />
                        <span>
                          <span className="strong">{p.titel}</span> <span className="badge subtle">{k.kategorie_id ? 'nicht mehr im Katalog' : 'eigene Hauptkategorie'}</span>
                        </span>
                      </div>
                      <PostenZeile
                        posten={p}
                        kategorie={k}
                        onChange={(notiz) => aendereAuswahl(aenderePosten(auswahl, k.schluessel, p.schluessel, { notiz }))}
                        onRemove={() => aendereAuswahl(entfernePosten(auswahl, k.schluessel, p.schluessel))}
                      />
                    </li>
                  ))}
                </KategorieBlock>
              ))}
            </ul>

            <div className="manuell">
              <div className="field-label">Manuell hinzufügen</div>
              <div className="manuell-zeile">
                <input
                  value={manuell.titel}
                  onChange={(e) => setManuell((m) => ({ ...m, titel: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      hinzufuegen();
                    }
                  }}
                  placeholder="Unterpunkt, z. B. Migration Blog-Artikel"
                  aria-label="Unterpunkt"
                />
                <select value={manuell.ziel} onChange={(e) => setManuell((m) => ({ ...m, ziel: e.target.value }))} aria-label="Hauptkategorie">
                  <optgroup label="Katalog">
                    {baum.map((k) => (
                      <option key={k.kategorie.id} value={`k:${k.kategorie.id}`}>
                        {kopf.sprache === 'en' ? k.kategorie.titel_en || k.kategorie.titel_de : k.kategorie.titel_de}
                      </option>
                    ))}
                  </optgroup>
                  {eigene.filter((k) => !k.kategorie_id).length > 0 && (
                    <optgroup label="Eigene">
                      {eigene
                        .filter((k) => !k.kategorie_id)
                        .map((k) => (
                          <option key={k.schluessel} value={`a:${k.schluessel}`}>
                            {k.titel}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  <option value="neu">Neue Hauptkategorie …</option>
                </select>
                <button type="button" className="button" onClick={hinzufuegen}>
                  Hinzufügen
                </button>
              </div>
              {manuell.ziel === 'neu' && (
                <div className="manuell-zeile">
                  <input value={manuell.neuTitel} onChange={(e) => setManuell((m) => ({ ...m, neuTitel: e.target.value }))} placeholder="Name der neuen Hauptkategorie" aria-label="Name der neuen Hauptkategorie" />
                  <div className="segmented" role="radiogroup" aria-label="Abrechnung">
                    {ABRECHNUNGEN.map((a) => (
                      <button key={a.wert} type="button" role="radio" aria-checked={manuell.neuAbrechnung === a.wert} className={manuell.neuAbrechnung === a.wert ? 'is-active' : ''} onClick={() => setManuell((m) => ({ ...m, neuAbrechnung: a.wert }))}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <FormError error={manuellFehler} />
            </div>
          </section>
        </div>

        <aside className="angebot-side">
          <section className="card angebot-summe">
            <header className="card-header">
              <h2>Zusammenfassung</h2>
            </header>
            {summe.posten === 0 ? (
              <p className="muted">Noch keine Leistungen gewählt.</p>
            ) : (
              <ol className="summe-liste">
                {auswahl.kategorien.map((k) => (
                  <li key={k.schluessel}>
                    <span>{k.titel}</span>
                    <span className="muted small">
                      {k.posten.length}
                      {k.abrechnung === 'monatlich' && ' · mtl.'}
                      {k.optional && ' · optional'}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p className="small muted">
              {summe.posten} Leistungen in {summe.kategorien} Hauptkategorien
              {summe.monatlich > 0 && `, davon ${summe.monatlich} monatlich`}
              {summe.optional > 0 && `, ${summe.optional} optional`}.
            </p>
            <FormError error={error} />
            <div className="summe-aktionen">
              <button type="button" className="button primary large" onClick={speichern} disabled={busy || (!dirty && Boolean(angebot))}>
                {busy ? 'Speichert …' : angebot ? (dirty ? 'Änderungen speichern' : 'Gespeichert') : 'Angebot anlegen'}
              </button>
              <button type="button" className="button large" disabled title="Folgt im nächsten Ausbauschritt">
                Kalkulations-Sheet anlegen
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function AngebotPage() {
  const { id } = useParams();
  const { data, error, loading, reload, aendern } = useAngebotsDaten();
  const { db, error: crmError, refresh } = useCrm();

  if (!data || !db) {
    const fehler = error ?? crmError;
    return <div className="page">{fehler ? <ErrorBox error={fehler} onRetry={error ? reload : refresh} /> : loading && <Loading />}</div>;
  }
  const angebot = id ? data.angebote.find((a) => a.id === id) : undefined;
  if (id && !angebot) {
    return (
      <div className="page">
        <p className="alert error">
          Dieses Angebot gibt es nicht (mehr). <Link to="/angebote">Zur Angebotsliste</Link>
        </p>
      </div>
    );
  }
  // Remount after saving, so the form starts from the stored state.
  return <AngebotFormular key={angebot ? `${angebot.id}-${angebot.geaendert_am}` : 'neu'} daten={data} db={db} angebot={angebot} aendern={aendern} />;
}
