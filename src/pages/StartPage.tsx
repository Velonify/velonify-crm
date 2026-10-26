import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TerminEintrag, useTermine } from '../components/Termine';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, Loading, PageHeader } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { addDays, isoDate } from '../data/ids';
import { istVorbei, tagesBeginn, termineJeTag } from '../data/kalender';
import { kennzahlen, meinTag } from '../data/selectors';
import { firmenLinks, pipelineStufen, schnellzugriff } from '../data/start';
import type { Database, KundenNews, TodoDaten } from '../data/types';
import { dateiname } from '../lib/dateiname';
import { faelligText, formatEuro } from '../lib/format';
import { useIch } from '../lib/useIch';
import { useLoad } from '../lib/useLoad';
import { MonsteraKarte } from '../monstera/MonsteraKarte';
import { WordleKarte } from '../wordle/WordleKarte';
import { boardVon, faelligkeit, istErledigt, meineAufgaben } from '../data/todos';
import { phaseLabel } from '../data/constants';
import { istOffen } from '../data/eingang';
import { ticker } from '../data/kunden';
import { AKTIONEN } from '../data/suche';
import { useEingang } from '../eingang/useEingang';
import { useKundenDaten } from '../kunden/useKundenDaten';
import { useTodoDaten } from '../todo/useTodoDaten';
import { istZustaendig } from '../data/zustaendig';
import { zeigeStart } from '../data/ansicht';
import { mandantenModus } from '../config';

/** Start sections tenants do not get (see config.mandantenModus). */
const OHNE_MANDANT: string[] = ['kalender', 'kunden', 'dateiname'];
import { useAnsicht } from '../lib/useAnsicht';

const MAX_AUFGABEN = 5;

interface HeuteEintrag {
  key: string;
  typ: 'Wiedervorlage' | 'Deal' | 'Karte';
  titel: string;
  faellig: string;
  wo: ReactNode;
  pfad: string;
}

/** Everything due today or overdue, from the CRM and the to-do boards, in one list. */
function HeuteDran({ eintraege, heute, bald }: { eintraege: HeuteEintrag[]; heute: string; bald: number }) {
  return (
    <Card
      title={
        <>
          Heute dran <span className="count">{eintraege.length}</span>
        </>
      }
      actions={
        <Link to="/eingang" className="button small">
          Zum Eingang
        </Link>
      }
    >
      {eintraege.length === 0 ? (
        <p className="muted">Für heute ist nichts offen.{bald > 0 && ` In den nächsten Tagen: ${bald}.`}</p>
      ) : (
        <ul className="heute-liste">
          {eintraege.slice(0, MAX_AUFGABEN).map((e) => (
            <li key={e.key} className={e.faellig < heute ? 'is-ueberfaellig' : ''}>
              <span className={`typ typ-${e.typ.toLowerCase()}`}>{e.typ}</span>
              <div className="heute-text">
                <Link to={e.pfad} className="heute-titel">
                  {e.titel}
                </Link>
                <div className="row-sub">{e.wo}</div>
              </div>
              <span className="heute-wann">{faelligText(e.faellig, heute)}</span>
            </li>
          ))}
        </ul>
      )}
      {eintraege.length > MAX_AUFGABEN && (
        <p className="hint">
          Und {eintraege.length - MAX_AUFGABEN} weitere im <Link to="/eingang">Eingang</Link> · <Link to="/crm">Mein Tag</Link> · <Link to="/todo/meine">Meine Aufgaben</Link>
        </p>
      )}
    </Card>
  );
}

/** Clients as tiles with open cards and the latest news; leads with an open offer below. */
function Kunden({ db, todos, news, heute }: { db: Database; todos?: TodoDaten; news?: KundenNews[]; heute: string }) {
  const eintraege = useMemo(() => schnellzugriff(db), [db]);
  const kunden = eintraege.filter((e) => e.art === 'kunde').map((e) => e.firma);
  const angebote = eintraege.filter((e) => e.art === 'angebot').map((e) => e.firma);
  return (
    <Card
      title={
        <>
          Kunden <span className="count">{kunden.length}</span>
        </>
      }
      actions={
        <Link to="/kunden" className="button small">
          Alle Kunden
        </Link>
      }
    >
      {kunden.length === 0 && <p className="muted">Noch keine Kunden.</p>}
      <ul className="kunden-zeilen">
        {kunden.map((f) => {
          const board = todos ? boardVon(todos.boards, f.id) : undefined;
          const karten = board && todos ? todos.aufgaben.filter((a) => a.board_id === board.id && !a.archiviert) : [];
          const offen = karten.filter((a) => !istErledigt(a));
          const ueber = offen.filter((a) => faelligkeit(a, heute) === 'ueberfaellig').length;
          const anteil = karten.length > 0 ? Math.round(((karten.length - offen.length) / karten.length) * 100) : 0;
          const neueste = news ? ticker(news, f.id, heute).find((n) => !n.alleKunden) : undefined;
          return (
            <li key={f.id}>
              <Link to={`/kunden/${f.id}`} className="kunden-zeile" title={neueste ? `Neueste News: ${neueste.titel}` : undefined}>
                <span className="kunden-zeile-zeichen" aria-hidden="true">{(f.kuerzel || f.name).slice(0, 3)}</span>
                <span className="kunden-zeile-text">
                  <strong>{f.name}</strong>
                  <span className="kunden-zeile-balken" aria-hidden="true">
                    <span style={{ width: `${anteil}%` }} />
                  </span>
                </span>
                <span className="kunden-zeile-zahl">
                  {ueber > 0 ? <span className="is-warn">{ueber} überfällig</span> : <span className="muted">{offen.length} offen</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {angebote.length > 0 && (
        <>
          <h3 className="subheading">Offene Angebote</h3>
          <ul className="angebot-zeilen">
            {angebote.map((f) => (
              <li key={f.id}>
                {f.kuerzel && <span className="kuerzel">{f.kuerzel}</span>}
                <Link to={`/crm/firmen/${f.id}`}>{f.name}</Link>
                <span className="muted small">{f.zustaendig}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function Pipeline({ db, ich }: { db: Database; ich: string | null }) {
  const stufen = useMemo(() => {
    const firmen = new Map(db.firmen.map((f) => [f.id, f]));
    return pipelineStufen(db.deals.filter((d) => !firmen.get(d.firma_id)?.archiviert && (!ich || istZustaendig(d.zustaendig, ich))));
  }, [db, ich]);
  const max = Math.max(1, ...stufen.map((s) => s.anzahl));
  return (
    <Card
      title={ich ? 'Meine Pipeline' : 'Pipeline'}
      actions={
        <Link to="/crm/pipeline" className="button small">
          Öffnen
        </Link>
      }
    >
      <div className="stufen">
        {stufen.map((s) => (
          <div key={s.phase} className="stufe">
            <span className="stufe-name">
              {phaseLabel(s.phase)} <span className="muted">{s.anzahl}</span>
            </span>
            <span className="stufe-balken" aria-hidden="true">
              <span style={{ width: `${(s.anzahl / max) * 100}%` }} />
            </span>
            <span className="stufe-wert">{s.wert > 0 ? formatEuro(s.wert) : '–'}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

const SCHNELL = ['Neue Firma anlegen', 'Neues Angebot', 'Anschreiben erstellen', 'Shop prüfen'];


function Kalender({ db, heute }: { db: Database; heute: string }) {
  // Today and the next six days: enough to show the next appointment when today is free.
  const termine = useTermine(tagesBeginn(heute), tagesBeginn(addDays(heute, 7)));
  const jetzt = new Date();
  const heuteListe = termineJeTag(termine.data ?? [], [heute]).get(heute) ?? [];
  const offen = heuteListe.filter((e) => !istVorbei(e, jetzt));
  const naechster = (termine.data ?? []).find((e) => !e.ganztaegig && new Date(e.start).getTime() > jetzt.getTime() && isoDate(new Date(e.start)) > heute);

  return (
    <Card
      title={
        <>
          Kalender heute <span className="count">{heuteListe.length}</span>
        </>
      }
      actions={
        <Link to="/kalender" className="button small">
          Woche
        </Link>
      }
    >
      {termine.error ? (
        <ErrorBox error={termine.error} onRetry={termine.reload} />
      ) : termine.loading && !termine.data ? (
        <Loading label="Termine werden geladen …" />
      ) : (
        <>
          {heuteListe.length === 0 ? (
            <p className="muted">Heute keine Termine.</p>
          ) : (
            <div className="termin-liste">
              {heuteListe.map((event) => (
                <TerminEintrag key={event.id} event={event} tag={heute} db={db} jetzt={jetzt} kompakt />
              ))}
            </div>
          )}
          {naechster && offen.length === 0 && (
            <p className="hint">
              Nächster Termin: {new Date(naechster.start).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })} · {naechster.titel}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function Links({ db }: { db: Database }) {
  const links = firmenLinks(db.einstellungen);
  return (
    <Card title="Links">
      <ul className="link-list">
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.url} target="_blank" rel="noreferrer noopener">
              {l.label} <span aria-hidden="true">↗</span>
            </a>
          </li>
        ))}
      </ul>
      {links.length < 5 && (
        <p className="hint">
          Weitere Links unter <Link to="/einrichtung">Einrichtung</Link>.
        </p>
      )}
    </Card>
  );
}

function Dateiname({ db, heute }: { db: Database; heute: string }) {
  const toast = useToast();
  const [datum, setDatum] = useState(heute);
  const [kuerzel, setKuerzel] = useState('');
  const [thema, setThema] = useState('');
  const [version, setVersion] = useState(1);
  const name = dateiname({ datum: datum || heute, kuerzel, thema, version });
  const kuerzelListe = useMemo(() => [...new Set(db.firmen.filter((f) => f.kuerzel && !f.archiviert).map((f) => f.kuerzel))].sort(), [db]);

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(name);
      toast.show('Dateiname kopiert');
    } catch {
      toast.show('Kopieren ging nicht – bitte markieren und von Hand kopieren.', 'error');
    }
  };

  return (
    <Card title="Dateiname">
      <p className="muted small">Nach dem Schema der Shared Drive: Datum, Kürzel, Thema, Version.</p>
      <div className="filename-form">
        <label className="field">
          <span className="field-label">Datum</span>
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Kürzel</span>
          <input value={kuerzel} onChange={(e) => setKuerzel(e.target.value)} list="start-kuerzel" placeholder="leer = firmenweit" />
          <datalist id="start-kuerzel">
            {kuerzelListe.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </label>
        <label className="field wide">
          <span className="field-label">Thema</span>
          <input value={thema} onChange={(e) => setThema(e.target.value)} placeholder="z. B. Kalkulation Shopify-Migration" />
        </label>
        <label className="field">
          <span className="field-label">Version</span>
          <input type="number" min={1} max={99} value={version} onChange={(e) => setVersion(Number(e.target.value))} />
        </label>
      </div>
      <div className="filename-result">
        <code>{name}</code>
        <button type="button" className="button small primary" onClick={kopieren} disabled={!thema.trim()}>
          Kopieren
        </button>
      </div>
    </Card>
  );
}

export function StartPage() {
  const { db, service, loading, error, refresh } = useCrm();
  // Word game and plant share one request, so opening the start page stays a small load for Google.
  const spiele = useLoad(() => (service ? service.loadSpiele() : new Promise<never>(() => {})), [service], 'spiele');
  const todos = useTodoDaten();
  const kundenDaten = useKundenDaten();
  const eingang = useEingang();
  const [ich] = useIch(db?.listen.team ?? []);
  const { ansicht } = useAnsicht();
  // Tenants have no Google calendar, no Shared Drive and no client hub.
  const zeige = (b: Parameters<typeof zeigeStart>[1]) => !(mandantenModus && OHNE_MANDANT.includes(b)) && zeigeStart(ansicht, b);
  const heute = isoDate(new Date());

  const cockpit = useMemo(() => {
    if (!db) return null;
    const tag = meinTag(db, ich, heute);
    const crm: HeuteEintrag[] = [...tag.ueberfaellig, ...tag.heute].map((a) => ({
      key: a.key,
      typ: a.art === 'wiedervorlage' ? 'Wiedervorlage' : 'Deal',
      titel: a.titel,
      faellig: a.faellig,
      wo: a.firma ? `${a.firma.kuerzel ? `${a.firma.kuerzel} · ` : ''}${a.firma.name}` : '',
      pfad: a.firma ? `/crm/firmen/${a.firma.id}` : '/crm',
    }));
    const meine = todos.data && ich ? meineAufgaben(todos.data.aufgaben, todos.data.boards, ich) : [];
    const kartenHeute: HeuteEintrag[] = meine
      .filter((k) => ['ueberfaellig', 'heute'].includes(faelligkeit(k, heute)))
      .map((k) => ({ key: k.id, typ: 'Karte', titel: k.titel, faellig: k.faellig_am, wo: todos.data!.boards.find((b) => b.id === k.board_id)?.titel ?? '', pfad: `/todo/${k.board_id}` }));
    const eintraege = [...crm, ...kartenHeute].sort((x, y) => x.faellig.localeCompare(y.faellig));
    const bald = tag.naechsteTage.length + meine.filter((k) => faelligkeit(k, heute) === 'bald').length;
    const firmen = new Map(db.firmen.map((f) => [f.id, f]));
    const deals = db.deals.filter((d) => !firmen.get(d.firma_id)?.archiviert && (!ich || istZustaendig(d.zustaendig, ich)));
    return {
      eintraege,
      bald,
      ueberfaellig: eintraege.filter((e) => e.faellig < heute).length,
      offeneKarten: todos.data ? meine.length : null,
      pipelineWert: kennzahlen(deals, heute).pipelineWert,
      anfragen: eingang.data ? eingang.data.filter(istOffen).length : null,
    };
  }, [db, ich, heute, todos.data, eingang.data]);

  if (!db || !cockpit) return <div className="page">{error ? <ErrorBox error={error} onRetry={refresh} /> : loading && <Loading />}</div>;

  const stunde = new Date().getHours();
  const begruessung = stunde < 11 ? 'Guten Morgen' : stunde < 18 ? 'Hallo' : 'Guten Abend';
  // One calm sentence instead of a row of numbers: what is due, what is new.
  const teile = [
    cockpit.eintraege.length === 0 ? 'Heute ist nichts fällig' : `${cockpit.eintraege.length} ${cockpit.eintraege.length === 1 ? 'Sache ist' : 'Dinge sind'} heute dran${cockpit.ueberfaellig > 0 ? `, ${cockpit.ueberfaellig} davon überfällig` : ''}`,
    ...(cockpit.anfragen ? [`${cockpit.anfragen} ${cockpit.anfragen === 1 ? 'neue Anfrage' : 'neue Anfragen'}`] : []),
    `${ich ? 'deine' : 'die'} Pipeline steht bei ${formatEuro(cockpit.pipelineWert)}`,
  ];
  const satz = `${teile.join(' · ')}.`;

  const rechts = zeige('kalender') || zeige('kunden');
  const helfer = [zeige('pipeline'), zeige('links'), zeige('dateiname')].some(Boolean);

  return (
    <div className="page start-ruhig">
      <PageHeader
        title={`${begruessung}${ich ? `, ${ich}` : ''}`}
        subtitle={satz}
        actions={
          zeige('schnellstart') ? (
            <div className="start-schnell" aria-label="Schnell starten">
              {AKTIONEN.filter((a) => SCHNELL.includes(a.titel)).map((a) => (
                <Link key={a.pfad} to={a.pfad} className="button small">
                  {a.titel}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      />
      {error && <ErrorBox error={error} onRetry={refresh} />}
      {(zeige('heute') || rechts) && (
        <div className={`start-raster${zeige('heute') && rechts ? '' : ' is-einspaltig'}`}>
          {zeige('heute') && <HeuteDran eintraege={cockpit.eintraege} heute={heute} bald={cockpit.bald} />}
          {rechts && (
            <div className="start-rechts">
              {zeige('kalender') && <Kalender db={db} heute={heute} />}
              {zeige('kunden') && <Kunden db={db} todos={todos.data} news={kundenDaten.data?.news} heute={heute} />}
            </div>
          )}
        </div>
      )}

      {((zeige('monstera') && spiele.data?.monstera) || (zeige('wort') && spiele.data?.wordle)) && (
        <section className="start-pause" aria-label="Kurze Pause">
          {zeige('monstera') && spiele.data?.monstera && <MonsteraKarte eintraege={spiele.data.monstera} db={db} ich={ich} heute={heute} neuLaden={spiele.reload} />}
          {zeige('wort') && spiele.data?.wordle && <WordleKarte ergebnisse={spiele.data.wordle} team={db.listen.team ?? []} ich={ich} heute={heute} />}
        </section>
      )}

      {helfer && (
        <div className="start-mehr-raster">
          {zeige('pipeline') && <Pipeline db={db} ich={ich} />}
          {zeige('links') && <Links db={db} />}
          {zeige('dateiname') && <Dateiname db={db} heute={heute} />}
        </div>
      )}
      <p className="hint start-tipp">
        Mehr auf die Startseite holen oder ausblenden: <Link to="/einstellungen#einst-start">Einstellungen</Link>
      </p>
    </div>
  );
}
