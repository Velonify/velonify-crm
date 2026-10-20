import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useCrm } from '../../data/CrmContext';
import { AGENTUR } from '../../data/demo/agentur';
import { aktiveDemo } from '../../data/demo/dauerhaft';
import { portalFreigabe, ladeKundenDateien } from '../../data/portalAktionen';
import { kundensicht, pruefeBerechtigung, type Berechtigung, type Kundensicht, type PortalKarte } from '../../data/portalApi';
import { SheetStore } from '../../data/sheets/sheetStore';
import { veraenderung } from '../../data/tracking';
import type { Database, Firma, PortalZugang } from '../../data/types';
import { errorMessage } from '../../lib/errors';
import { formatDate, formatEuro } from '../../lib/format';
import { HAUPTKUNDE } from './demo';
import './kundenansicht.css';

type Reiter = 'start' | 'projekt' | 'berichte' | 'dateien';
const REITER: [Reiter, string][] = [['start', 'Start'], ['projekt', 'Projekt'], ['berichte', 'Berichte'], ['dateien', 'Dateien']];

const PHASEN: { id: PortalKarte['phase']; titel: string }[] = [
  { id: 'wartet', titel: 'Wartet auf dich' },
  { id: 'arbeit', titel: 'In Arbeit' },
  { id: 'geplant', titel: 'Geplant' },
  { id: 'erledigt', titel: 'Erledigt' },
];

/**
 * The client of a firm logs in: an active portal login of one of its contacts. Without one the demo shows what
 * the main contact would see once the login is switched on.
 */
function kundeVon(db: Database, zugaenge: PortalZugang[], firma: Firma): Berechtigung | null {
  for (const z of zugaenge) {
    const b = z.firma_id === firma.id && z.aktiv ? pruefeBerechtigung(db, { zugaenge }, z.kontakt_id, firma.id) : null;
    if (b) return b;
  }
  const kontakte = db.kontakte.filter((k) => k.firma_id === firma.id && !k.archiviert);
  const kontakt = kontakte.find((k) => k.hauptkontakt) ?? kontakte[0];
  if (!kontakt) return null;
  const zugang = { id: '', firma_id: firma.id, kontakt_id: kontakt.id, aktiv: true, zuletzt_am: '', updates: '', kanal_updates: '', kanal_hinweise: '', update_am: '', hinweise_bis: '', rundgang_am: '', neuerungen_gesehen: '' } as PortalZugang;
  return { zugang, kontakt, firma };
}

function begruessung(): string {
  const stunde = new Date().getHours();
  return stunde < 11 ? 'Guten Morgen' : stunde >= 18 ? 'Guten Abend' : 'Hallo';
}

/** `veraenderung` gives percent already, rounded to one decimal. */
const prozent = (wert: number | null) => (wert === null ? '' : `${wert > 0 ? '+' : ''}${String(wert).replace('.', ',')} %`);
const zahl = new Intl.NumberFormat('de-DE');

/**
 * „Als Kunde ansehen“ in the public demo: the client portal as the client sees it, built from the demo's own data
 * with the same rules as the real portal function (`kundensicht`). Approvals go back into the hub.
 */
export function Kundenansicht({ firmaId, start = 'start', onClose }: { firmaId: string | null; start?: Reiter; onClose(): void }) {
  const { db, refresh } = useCrm();
  const titelId = useId();
  const [reiter, setReiter] = useState<Reiter>(start);
  const [sicht, setSicht] = useState<Kundensicht | null>(null);
  const [berechtigung, setBerechtigung] = useState<Berechtigung | null>(null);
  const [fehler, setFehler] = useState('');
  const [gerade, setGerade] = useState<{ id: string; titel: string; entscheidung: string }[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const firma = useMemo(
    () => db?.firmen.find((f) => (firmaId ? f.id === firmaId : f.name === HAUPTKUNDE && !f.archiviert)) ?? null,
    [db, firmaId],
  );

  const laden = useCallback(async () => {
    const demo = aktiveDemo();
    if (!demo || !firma || !db) return;
    try {
      const store = new SheetStore(demo.sheets);
      const [kunden, todos, portal] = await Promise.all([store.loadKundenDaten(), store.loadTodoDaten(), store.loadPortalDaten()]);
      const b = kundeVon(db, portal.zugaenge, firma);
      if (!b) throw new Error(`${firma.name} hat noch keinen Kontakt, der sich im Portal anmelden könnte.`);
      const { dateien } = await ladeKundenDateien(demo.drive, firma.drive_ordner_id);
      setBerechtigung(b);
      setSicht(kundensicht({ berechtigung: b, db, kunden, todos, portal, dateien, teamDomain: AGENTUR.domain }));
      setFehler('');
    } catch (err) {
      setFehler(errorMessage(err));
    }
  }, [db, firma]);

  useEffect(() => {
    void laden();
  }, [laden]);

  useEffect(() => {
    const vorher = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const taste = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', taste);
    document.documentElement.classList.add('kundenansicht-offen');
    return () => {
      document.removeEventListener('keydown', taste);
      document.documentElement.classList.remove('kundenansicht-offen');
      vorher?.focus?.();
    };
  }, [onClose]);

  /** Like `POST /freigabe` of the portal function, written straight into the demo's data. */
  const entscheide = async (karte: PortalKarte, entscheidung: 'freigegeben' | 'aenderung', notiz = '') => {
    const demo = aktiveDemo();
    if (!demo || !berechtigung) return;
    try {
      const store = new SheetStore(demo.sheets);
      const todos = await store.loadTodoDaten();
      const ergebnis = portalFreigabe({ berechtigung, todos, eingabe: { karte_id: karte.id, entscheidung, notiz }, jetzt: new Date() });
      await store.update('aufgaben', [{ id: ergebnis.karte.id, changes: ergebnis.changes, expectedGeaendertAm: ergebnis.karte.geaendert_am }]);
      if (ergebnis.kommentar) await store.insert('aufgaben_kommentare', [ergebnis.kommentar]);
      setGerade((g) => [...g, { id: karte.id, titel: karte.titel, entscheidung }]);
      await refresh();
    } catch (err) {
      setFehler(errorMessage(err));
    }
  };

  const kunde = berechtigung?.kontakt;
  const wartend = (sicht?.karten ?? []).filter((k) => k.freigabe === 'offen');
  const arbeit = (sicht?.karten ?? []).filter((k) => k.phase === 'arbeit').length;
  const adresse = `kunden.${AGENTUR.domain}`;

  return createPortal(
    <div className="kundenansicht" role="dialog" aria-modal="true" aria-labelledby={titelId} ref={ref} tabIndex={-1}>
      <div className="ka-vorschau">
        <span>
          <strong>Als Kunde ansehen</strong> · So sieht {kunde ? `${kunde.vorname} ${kunde.nachname}` : 'der Kunde'} von {firma?.name ?? 'eurem Kunden'} das Projekt unter{' '}
          <span className="ka-adresse">{adresse}</span>. Freigaben landen sofort im Hub.
        </span>
        <button type="button" className="ka-zurueck" onClick={onClose}>
          Zurück zum Hub
        </button>
      </div>

      <header className="ka-bar">
        <div className="ka-bar-in">
          <span className="ka-marke">
            <span className="ka-zeichen" aria-hidden="true" />
            {AGENTUR.name.toUpperCase()}
            {firma && <span className="ka-kunde">{firma.name}</span>}
          </span>
          <nav className="ka-tabs" aria-label="Kundenportal">
            {REITER.map(([id, label]) => (
              <button key={id} type="button" aria-current={reiter === id ? 'page' : undefined} onClick={() => setReiter(id)}>
                {label}
                {id === 'start' && wartend.length > 0 && <span className="ka-zahl">{wartend.length}</span>}
              </button>
            ))}
          </nav>
          {kunde && (
            <span className="ka-ich" title={kunde.email}>
              <span className="ka-av">{`${kunde.vorname[0] ?? ''}${kunde.nachname[0] ?? ''}`}</span>
              {kunde.vorname}
            </span>
          )}
        </div>
      </header>

      <div className="ka-inhalt">
        {fehler && <p className="ka-fehler" role="alert">{fehler}</p>}
        {!sicht && !fehler && <p className="ka-leise">Portal wird geladen …</p>}
        {sicht && (
          <div className="ka-seite">
            <div className="ka-haupt">
              <h1 id={titelId} className="ka-kopf">
                {reiter === 'start' ? `${begruessung()} ${sicht.ich.vorname}` : REITER.find(([id]) => id === reiter)![1]}
              </h1>
              {reiter === 'start' && (
                <Start sicht={sicht} wartend={wartend} arbeit={arbeit} gerade={gerade} onEntscheide={entscheide} />
              )}
              {reiter === 'projekt' && <Projekt karten={sicht.karten} />}
              {reiter === 'berichte' && <Berichte sicht={sicht} />}
              {reiter === 'dateien' && <Dateien sicht={sicht} />}
            </div>
            <Neben sicht={sicht} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Block({ titel, n, children }: { titel: string; n?: number; children: ReactNode }) {
  return (
    <section className="ka-block">
      <h2>
        {titel} {!!n && <span className="ka-zahl">{n}</span>}
      </h2>
      {children}
    </section>
  );
}

function Start(props: {
  sicht: Kundensicht;
  wartend: PortalKarte[];
  arbeit: number;
  gerade: { id: string; titel: string; entscheidung: string }[];
  onEntscheide(karte: PortalKarte, entscheidung: 'freigegeben' | 'aenderung', notiz?: string): Promise<void>;
}) {
  const { sicht, wartend, arbeit, gerade } = props;
  const n = wartend.length;
  const satz = n
    ? `${n === 1 ? 'Eine Sache wartet' : `${n} Sachen warten`} auf deine Freigabe.${arbeit ? ` Das Team arbeitet gerade an ${arbeit} ${arbeit === 1 ? 'Aufgabe' : 'Aufgaben'}.` : ''}`
    : `Gerade wartet nichts auf dich.${arbeit ? ` Das Team arbeitet an ${arbeit} ${arbeit === 1 ? 'Aufgabe' : 'Aufgaben'}.` : ''}`;
  return (
    <>
      <p className="ka-satz">{satz}</p>
      <Block titel="Für dich zu tun" n={n}>
        {gerade.map((g) => (
          <p className="ka-todo ka-fertig" role="status" key={g.id}>
            ✓ <b>{g.titel}</b> · {g.entscheidung === 'freigegeben' ? 'freigegeben' : 'Änderung gewünscht'}, das Team ist informiert.
          </p>
        ))}
        {wartend.map((k) => (
          <Todo key={k.id} karte={k} onEntscheide={props.onEntscheide} />
        ))}
        {n === 0 && gerade.length === 0 && <p className="ka-leise">Nichts offen. Wir melden uns, sobald es etwas zu prüfen gibt.</p>}
      </Block>
      {sicht.fahrplan.length > 0 && (
        <Block titel="Projektstand">
          <ol className="ka-fahrplan">
            {sicht.fahrplan.map((m) => (
              <li key={m.titel} className={`is-${m.status}`}>
                <span className="ka-punkt" aria-hidden="true" />
                <b>{m.titel}</b>
                <span className="ka-leise">
                  {m.status === 'erledigt' ? 'erledigt' : m.status === 'aktiv' ? 'jetzt dran' : 'geplant'}
                  {m.datum && ` · ${formatDate(m.datum)}`}
                </span>
              </li>
            ))}
          </ol>
        </Block>
      )}
      <Block titel="Was neu ist">
        {sicht.news.length === 0 && <p className="ka-leise">Noch keine Neuigkeiten.</p>}
        <ul className="ka-feed">
          {sicht.news.slice(0, 6).map((n) => (
            <li key={n.id}>
              <span className={`ka-art ka-art-${n.art}`}>{n.art === 'meilenstein' ? 'Meilenstein' : n.art === 'hinweis' ? 'Hinweis' : 'Update'}</span>
              <b>{n.titel}</b>
              {n.text && <p>{n.text}</p>}
              <span className="ka-leise">{formatDate(n.datum)}</span>
            </li>
          ))}
        </ul>
      </Block>
    </>
  );
}

function Todo({ karte, onEntscheide }: { karte: PortalKarte; onEntscheide(karte: PortalKarte, e: 'freigegeben' | 'aenderung', notiz?: string): Promise<void> }) {
  const [aenderung, setAenderung] = useState(false);
  const [notiz, setNotiz] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const los = async (e: 'freigegeben' | 'aenderung') => {
    setLaeuft(true);
    await onEntscheide(karte, e, notiz.trim());
    setLaeuft(false);
  };
  return (
    <article className="ka-todo">
      <h3>{karte.titel}</h3>
      {karte.beschreibung && <p className="ka-leise">{karte.beschreibung}</p>}
      {aenderung && (
        <label className="ka-notiz">
          Was soll anders sein?
          <textarea value={notiz} onChange={(e) => setNotiz(e.target.value)} rows={3} autoFocus />
        </label>
      )}
      <div className="ka-aktionen">
        {aenderung ? (
          <>
            <button type="button" className="ka-btn" disabled={laeuft || !notiz.trim()} onClick={() => void los('aenderung')}>
              Änderung schicken
            </button>
            <button type="button" className="ka-btn ka-zweit" onClick={() => setAenderung(false)}>
              Abbrechen
            </button>
          </>
        ) : (
          <>
            <button type="button" className="ka-btn" disabled={laeuft} onClick={() => void los('freigegeben')}>
              ✓ Freigeben
            </button>
            <button type="button" className="ka-btn ka-zweit" onClick={() => setAenderung(true)}>
              Änderung wünschen
            </button>
          </>
        )}
        <span className="ka-leise">
          {karte.zustaendig.length > 0 && `von ${karte.zustaendig.join(' und ')}`}
          {karte.faellig_am && ` · bis ${formatDate(karte.faellig_am)}`}
        </span>
      </div>
    </article>
  );
}

function Projekt({ karten }: { karten: PortalKarte[] }) {
  return (
    <div className="ka-spalten">
      {PHASEN.map((p) => {
        const liste = karten.filter((k) => (p.id === 'wartet' ? k.phase === 'wartet' || k.freigabe === 'offen' : k.phase === p.id && k.freigabe !== 'offen'));
        return (
          <section key={p.id} className="ka-spalte">
            <h2>
              {p.titel} <span className="ka-leise">{liste.length}</span>
            </h2>
            {liste.length === 0 && <p className="ka-leise">Nichts.</p>}
            {liste.map((k) => (
              <article key={k.id} className="ka-karte">
                <b>{k.titel}</b>
                {k.freigabe && <span className={`ka-freigabe is-${k.freigabe}`}>{k.freigabe === 'offen' ? 'Freigabe offen' : k.freigabe === 'freigegeben' ? 'Freigegeben' : 'Änderung gewünscht'}</span>}
                {k.checkliste.length > 0 && (
                  <span className="ka-leise">
                    {k.checkliste.filter((c) => c.erledigt).length} von {k.checkliste.length} erledigt
                  </span>
                )}
                <span className="ka-leise">
                  {k.zustaendig.join(', ')}
                  {k.erledigt_am ? ` · ${formatDate(k.erledigt_am)}` : k.faellig_am ? ` · bis ${formatDate(k.faellig_am)}` : ''}
                  {k.kommentare.length > 0 && ` · ${k.kommentare.length} ${k.kommentare.length === 1 ? 'Kommentar' : 'Kommentare'}`}
                </span>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function Kennzahl({ label, wert, jetzt, vorher, besserWennKleiner = false }: { label: string; wert: string; jetzt: number; vorher: number; besserWennKleiner?: boolean }) {
  const v = veraenderung(jetzt, vorher);
  const gut = v !== null && (besserWennKleiner ? v < 0 : v > 0);
  return (
    <div className="ka-kennzahl">
      <span className="ka-leise">{label}</span>
      <b>{wert}</b>
      {v !== null && <span className={gut ? 'ka-gut' : 'ka-schlecht'}>{prozent(v)} zum Vormonat</span>}
    </div>
  );
}

function Berichte({ sicht }: { sicht: Kundensicht }) {
  if (sicht.berichte.length === 0) return <p className="ka-leise">Noch kein Monatsbericht freigegeben.</p>;
  return (
    <>
      {sicht.berichte.map((b) => {
        const ga4 = b.daten.zahlen.ga4;
        const gsc = b.daten.zahlen.gsc;
        return (
          <Block key={b.monat} titel={b.titel}>
            <div className="ka-kennzahlen">
              {ga4 && <Kennzahl label="Umsatz" wert={formatEuro(ga4.umsatz)} jetzt={ga4.umsatz} vorher={ga4.vorher.umsatz} />}
              {ga4 && <Kennzahl label="Sitzungen" wert={zahl.format(ga4.sitzungen)} jetzt={ga4.sitzungen} vorher={ga4.vorher.sitzungen} />}
              {ga4 && <Kennzahl label="Conversion-Rate" wert={`${(ga4.conversion_rate * 100).toFixed(2).replace('.', ',')} %`} jetzt={ga4.conversion_rate} vorher={ga4.vorher.conversion_rate} />}
              {gsc && <Kennzahl label="Klicks aus Google" wert={zahl.format(gsc.klicks)} jetzt={gsc.klicks} vorher={gsc.vorher.klicks} />}
            </div>
            {b.kommentar && (
              <blockquote className="ka-kommentar">
                {b.kommentar}
                {b.von && <cite>{b.von}, {AGENTUR.name}</cite>}
              </blockquote>
            )}
            {b.daten.erledigt.length > 0 && (
              <p className="ka-leise">Erledigt: {b.daten.erledigt.map((e) => e.titel).join(' · ')}</p>
            )}
          </Block>
        );
      })}
    </>
  );
}

function Dateien({ sicht }: { sicht: Kundensicht }) {
  return (
    <Block titel="Geteilte Dateien">
      {sicht.dateien.length === 0 && <p className="ka-leise">Noch keine Dateien geteilt.</p>}
      <ul className="ka-dateien">
        {sicht.dateien.map((d) => (
          <li key={d.id}>
            <b>{d.name}</b>
            <span className="ka-leise">
              {d.von === 'kunde' ? 'von dir hochgeladen' : `von ${AGENTUR.name}`} · {formatDate(d.geaendert)}
            </span>
          </li>
        ))}
      </ul>
      <p className="ka-leise">Im echten Portal lädt der Kunde hier Dateien herunter und hoch, alles landet im Drive-Ordner des Kunden.</p>
    </Block>
  );
}

function Neben({ sicht }: { sicht: Kundensicht }) {
  return (
    <aside className="ka-neben">
      <section className="ka-kasten">
        <h2>Dein Team</h2>
        <ul>
          {sicht.team.map((name) => (
            <li key={name}>
              <span className="ka-av ka-team">{name[0]}</span>
              {name}
            </li>
          ))}
        </ul>
        {sicht.slack && <p className="ka-leise">Am schnellsten über Slack: #{sicht.slack.channel}</p>}
      </section>
      {sicht.links.length > 0 && (
        <section className="ka-kasten">
          <h2>Links</h2>
          <ul>
            {sicht.links.map((l) => (
              <li key={l.titel}>
                <b>{l.titel}</b>
                {l.beschreibung && <span className="ka-leise">{l.beschreibung}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {sicht.werkzeuge.length > 0 && (
        <section className="ka-kasten">
          <h2>Werkzeuge</h2>
          <ul>
            {sicht.werkzeuge.map((w) => (
              <li key={w}>{w === 'utm' ? 'UTM-Generator' : w}</li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
