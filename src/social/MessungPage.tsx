import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toasts';
import { Card, Field, FormError } from '../components/ui';
import { EINSTELLUNG } from '../data/constants';
import { useCrm } from '../data/CrmContext';
import { isoDate } from '../data/ids';
import {
  MEDIAN_FENSTER,
  MINDEST_POSTS,
  SOCIAL_ZIEL_STANDARD,
  URTEIL_LABEL,
  VERDOPPELN_FAKTOR,
  WERT_ARTEN,
  bewerteGruppen,
  dmsJeStichwort,
  eigenerMedian,
  findeWert,
  inhaltById,
  inhaltName,
  montag,
  postKennwerte,
  sortiereInhalte,
  utmLink,
} from '../data/social';
import type { SocialDaten, SocialDm, SocialWert, SocialWertInput } from '../data/types';
import { fieldOf } from '../lib/errors';
import { formatDate, formatEuro, numberOrNull } from '../lib/format';
import { useIch } from '../lib/useIch';
import { DmDialog } from './Dialoge';
import { SocialSeite } from './SocialTeile';
import type { Aendern } from './useSocial';

const prozent = (wert: number) => `${(wert * 100).toFixed(1).replace('.', ',')} %`;

const LEERE_ZAHLEN = {
  reichweite: null,
  speicherungen: null,
  geteilt: null,
  profilaufrufe: null,
  link_klicks: null,
  kommentare: null,
  story_antworten: null,
  umfrage_antworten: null,
  neue_follower: null,
  follower_zielgruppe: null,
  sitzungen: null,
  formulare: null,
  erstgespraeche: null,
  angebote_wert_eur: null,
};

/** Which numbers belong to which kind of entry – section 10 asks for different ones per rhythm. */
const FELDER: Record<string, { feld: keyof typeof LEERE_ZAHLEN; label: string; hint?: string }[]> = {
  post: [
    { feld: 'reichweite', label: 'Reichweite' },
    { feld: 'speicherungen', label: 'Speicherungen' },
    { feld: 'geteilt', label: 'Geteilt' },
    { feld: 'profilaufrufe', label: 'Profilaufrufe' },
    { feld: 'link_klicks', label: 'Link-Klicks' },
    { feld: 'kommentare', label: 'Kommentare' },
  ],
  woche: [
    { feld: 'story_antworten', label: 'Story-Antworten' },
    { feld: 'umfrage_antworten', label: 'Umfrage-Teilnahmen' },
    { feld: 'profilaufrufe', label: 'Profilaufrufe' },
    { feld: 'link_klicks', label: 'Link-Klicks' },
  ],
  monat: [
    { feld: 'neue_follower', label: 'Neue Follower' },
    { feld: 'follower_zielgruppe', label: 'Davon Zielgruppe', hint: 'Stichprobe: die letzten 30 neuen Follower prüfen' },
    { feld: 'sitzungen', label: 'Sitzungen aus Social', hint: 'GA4, utm_source=instagram oder linkedin' },
    { feld: 'formulare', label: 'Formular-Absendungen' },
    { feld: 'erstgespraeche', label: 'Erstgespräche' },
    { feld: 'angebote_wert_eur', label: 'Wert der Angebote (€)' },
  ],
};

function WertDialog({ daten, heute, vorgabe, aendern, onClose }: { daten: SocialDaten; heute: string; vorgabe?: SocialWert; aendern: Aendern; onClose(): void }) {
  const toast = useToast();
  const [werte, setWerte] = useState<SocialWertInput>(() =>
    vorgabe
      ? { ...vorgabe }
      : { art: 'post', datum: heute, inhalt_id: '', ...LEERE_ZAHLEN, notiz: '' },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const setze = <K extends keyof SocialWertInput>(feld: K, wert: SocialWertInput[K]) => setWerte((w) => ({ ...w, [feld]: wert }));

  // Switching the kind adjusts the date to what that kind means: Monday, first of the month, the day itself.
  const setzeArt = (art: string) => {
    const datum = art === 'woche' ? montag(werte.datum || heute) : art === 'monat' ? `${(werte.datum || heute).slice(0, 7)}-01` : werte.datum || heute;
    setWerte((w) => ({ ...w, art, datum, inhalt_id: art === 'post' ? w.inhalt_id : '' }));
  };

  const zahl = (feld: keyof typeof LEERE_ZAHLEN) => ({
    value: werte[feld] === null ? '' : String(werte[feld]),
    onChange: (e: { target: { value: string } }) => setze(feld, numberOrNull(e.target.value) as never),
  });

  const speichern = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await aendern((s) => s.speichereWert(werte));
      toast.show('Zahlen gespeichert');
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const schonDa = findeWert(daten.werte, werte);

  return (
    <Dialog title="Zahlen eintragen" onClose={onClose} busy={busy} wide onSubmit={speichern}>
      <div className="grid">
        <Field label="Rhythmus">
          <select value={werte.art} onChange={(e) => setzeArt(e.target.value)}>
            {WERT_ARTEN.map((a) => (
              <option key={a.wert} value={a.wert}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={werte.art === 'woche' ? 'Woche ab' : werte.art === 'monat' ? 'Monat ab' : 'Tag des Posts'}
          invalid={fieldOf(error) === 'datum'}
        >
          <input type="date" value={werte.datum} onChange={(e) => setze('datum', e.target.value)} />
        </Field>
        {werte.art === 'post' && (
          <Field label="Post" invalid={fieldOf(error) === 'inhalt_id'} wide>
            <select value={werte.inhalt_id} onChange={(e) => setze('inhalt_id', e.target.value)}>
              <option value="">Bitte auswählen</option>
              {sortiereInhalte(daten.inhalte)
                .filter((i) => i.art !== 'story')
                .map((inhalt) => (
                  <option key={inhalt.id} value={inhalt.id}>
                    {inhaltName(inhalt)}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {FELDER[werte.art]?.map((f) => (
          <Field key={f.feld} label={f.label} hint={f.hint}>
            <input inputMode="numeric" {...zahl(f.feld)} autoComplete="off" />
          </Field>
        ))}
        <Field label="Notiz" wide>
          <input value={werte.notiz} onChange={(e) => setze('notiz', e.target.value)} autoComplete="off" />
        </Field>
      </div>
      {schonDa && <p className="hint">Für diesen Eintrag gibt es schon Zahlen. Speichern überschreibt sie.</p>}
      <FormError error={error} />
    </Dialog>
  );
}

/** Builds the links of section 10, so Instagram and LinkedIn end up in the same GA4 report. */
function UtmKarte({ ziel }: { ziel: string }) {
  const { perform } = useCrm();
  const toast = useToast();
  const [basis, setBasis] = useState(ziel);
  const [quelle, setQuelle] = useState<'instagram' | 'linkedin'>('instagram');
  const [kampagne, setKampagne] = useState('profil');
  const [inhalt, setInhalt] = useState('');
  const link = utmLink(basis, { quelle, kampagne, inhalt });

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.show('Link kopiert');
    } catch {
      toast.show('Kopieren ging nicht – bitte markieren und von Hand kopieren.', 'error');
    }
  };

  return (
    <Card
      title="UTM-Link"
      actions={
        basis !== ziel && (
          <button type="button" className="button small" onClick={() => void perform((s) => s.saveEinstellungen({ [EINSTELLUNG.socialZiel]: basis }), 'Linkziel gespeichert')}>
            Linkziel merken
          </button>
        )
      }
    >
      <p className="muted small">Ein Ziel, eine Handlung: der Kontaktabschnitt auf velonify.de mit Terminbuchung. Kein Linktree.</p>
      <div className="filename-form">
        <label className="field wide">
          <span className="field-label">Linkziel</span>
          <input value={basis} onChange={(e) => setBasis(e.target.value)} placeholder={SOCIAL_ZIEL_STANDARD} autoComplete="off" />
        </label>
        <label className="field">
          <span className="field-label">Quelle</span>
          <select value={quelle} onChange={(e) => setQuelle(e.target.value as 'instagram' | 'linkedin')}>
            <option value="instagram">Instagram</option>
            <option value="linkedin">LinkedIn</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Kampagne</span>
          <input value={kampagne} onChange={(e) => setKampagne(e.target.value)} list="social-kampagnen" autoComplete="off" />
          <datalist id="social-kampagnen">
            <option value="profil" />
            <option value="story" />
            <option value="post" />
          </datalist>
        </label>
        <label className="field">
          <span className="field-label">Inhalt</span>
          <input
            value={inhalt}
            onChange={(e) => setInhalt(e.target.value)}
            placeholder={quelle === 'linkedin' ? 'lukas' : '2026-09-24'}
            autoComplete="off"
          />
        </label>
      </div>
      <div className="filename-result">
        <code>{link}</code>
        <button type="button" className="button small" onClick={() => void kopieren()}>
          Kopieren
        </button>
      </div>
    </Card>
  );
}

function DmListe({ dms, daten, onBearbeiten }: { dms: readonly SocialDm[]; daten: SocialDaten; onBearbeiten(dm: SocialDm): void }) {
  if (dms.length === 0) return <p className="muted">Noch keine DM erfasst.</p>;
  return (
    <div className="table-wrap">
      <table className="table compact">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Stichwort</th>
            <th>Wer</th>
            <th>Ausgelöst durch</th>
            <th>Qualifiziert</th>
            <th>Beantwortet</th>
          </tr>
        </thead>
        <tbody>
          {[...dms]
            .sort((a, b) => b.datum.localeCompare(a.datum))
            .map((dm) => {
              const inhalt = inhaltById(daten.inhalte, dm.inhalt_id);
              return (
                <tr key={dm.id} onClick={() => onBearbeiten(dm)}>
                  <td>{formatDate(dm.datum)}</td>
                  <td className="row-title">{dm.stichwort || '–'}</td>
                  <td>
                    {dm.name || '–'}
                    {dm.shop && <div className="row-sub">{dm.shop}</div>}
                  </td>
                  <td>{inhalt ? inhaltName(inhalt) : <span className="muted">–</span>}</td>
                  <td>{dm.qualifiziert ? <span className="badge ok">ja</span> : <span className="muted">nein</span>}</td>
                  <td>{dm.beantwortet_von || <span className="muted">–</span>}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

export function SocialMessungPage() {
  const { db } = useCrm();
  const team = db?.listen.team ?? [];
  const [ich] = useIch(team);
  const heute = isoDate(new Date());
  const ziel = (db?.einstellungen[EINSTELLUNG.socialZiel] ?? '').trim() || SOCIAL_ZIEL_STANDARD;
  const [dialog, setDialog] = useState<{ art: 'wert'; wert?: SocialWert } | { art: 'dm'; dm?: SocialDm } | null>(null);

  return (
    <SocialSeite
      title="Messung"
      subtitle="Vergleichsgröße ist der eigene Median, nicht ein Branchenwert: Speicherungen plus Geteilt pro Reichweite über die letzten acht Posts."
      breit
      actions={
        <>
          <button type="button" className="button" onClick={() => setDialog({ art: 'dm' })}>
            DM erfassen
          </button>
          <button type="button" className="button primary" onClick={() => setDialog({ art: 'wert' })}>
            Zahlen eintragen
          </button>
        </>
      }
    >
      {(daten, aendern) => {
        const posts = postKennwerte(daten.werte, daten.inhalte);
        const mittelwert = eigenerMedian(posts);
        const bewertungen = bewerteGruppen(daten.werte, daten.inhalte, daten.dms);
        const dieseWoche = montag(heute);
        const dmsWoche = dmsJeStichwort(daten.dms, dieseWoche, heute);
        const perioden = daten.werte.filter((w) => w.art !== 'post').sort((a, b) => b.datum.localeCompare(a.datum));

        return (
          <>
            <section className="kpis" aria-label="Kennzahlen">
              <div className="kpi panel">
                <span className="kpi-label">Eigener Median</span>
                <span className="kpi-value">{mittelwert === null ? '–' : prozent(mittelwert)}</span>
                <span className="kpi-sub">Speicherungen + Geteilt pro Reichweite, letzte {MEDIAN_FENSTER} Posts</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">Gemessene Posts</span>
                <span className="kpi-value">{posts.length}</span>
                <span className="kpi-sub">{posts.length < MINDEST_POSTS ? `Ab ${MINDEST_POSTS} wird verglichen` : 'Vergleich läuft'}</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">DMs diese Woche</span>
                <span className="kpi-value">{dmsWoche.reduce((n, d) => n + d.anzahl, 0)}</span>
                <span className="kpi-sub">{dmsWoche.length > 0 ? dmsWoche.map((d) => `${d.stichwort} ${d.anzahl}`).join(' · ') : `seit ${formatDate(dieseWoche)}`}</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">Qualifizierte DMs</span>
                <span className="kpi-value">{daten.dms.filter((d) => d.qualifiziert).length}</span>
                <span className="kpi-sub">Eine davon zählt mehr als jede Reichweite</span>
              </div>
            </section>

            <Card title="Aussortieren oder verdoppeln">
              <p className="muted small">
                Aussortieren: dreimal hintereinander unter dem Median und keine DM. Verdoppeln: zweimal über dem {String(VERDOPPELN_FAKTOR).replace('.', ',')}
                -Fachen des Medians oder mindestens eine qualifizierte DM.
              </p>
              {bewertungen.length === 0 ? (
                <p className="muted">Noch nichts gemessen. Trag die Zahlen eines Posts ein, dann rechnet der Hub mit.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table compact">
                    <thead>
                      <tr>
                        <th>Serie oder Format</th>
                        <th className="num">Posts</th>
                        <th className="num">Letzter Kennwert</th>
                        <th className="num">DMs</th>
                        <th>Urteil</th>
                        <th>Warum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bewertungen.map((b) => (
                        <tr key={b.gruppe}>
                          <td className="row-title">{b.gruppe}</td>
                          <td className="num">{b.posts.length}</td>
                          <td className="num">{prozent(b.posts[0].kennwert)}</td>
                          <td className="num">
                            {b.dms}
                            {b.qualifizierteDms > 0 && ` (${b.qualifizierteDms} qual.)`}
                          </td>
                          <td>
                            <span className={`badge urteil-${b.urteil}`}>{URTEIL_LABEL[b.urteil]}</span>
                          </td>
                          <td className="muted small">{b.begruendung}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title={<>Posts <span className="count">{posts.length}</span></>}>
              {posts.length === 0 ? (
                <p className="muted">Noch keine Zahlen erfasst.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table compact">
                    <thead>
                      <tr>
                        <th>Tag</th>
                        <th>Post</th>
                        <th className="num">Reichweite</th>
                        <th className="num">Speichern</th>
                        <th className="num">Geteilt</th>
                        <th className="num">Kennwert</th>
                        <th>Gegen den Median</th>
                      </tr>
                    </thead>
                    <tbody>
                      {posts.map((post) => {
                        const ueber = mittelwert !== null && post.kennwert >= mittelwert;
                        return (
                          <tr key={post.wert.id} onClick={() => setDialog({ art: 'wert', wert: post.wert })}>
                            <td>{formatDate(post.datum)}</td>
                            <td className="row-title">{post.inhalt ? inhaltName(post.inhalt) : <span className="muted">gelöschter Inhalt</span>}</td>
                            <td className="num">{post.wert.reichweite}</td>
                            <td className="num">{post.wert.speicherungen ?? '–'}</td>
                            <td className="num">{post.wert.geteilt ?? '–'}</td>
                            <td className="num">{prozent(post.kennwert)}</td>
                            <td>
                              {mittelwert === null ? (
                                <span className="muted">–</span>
                              ) : (
                                <span className={`badge ${ueber ? 'ok' : 'subtle'}`}>
                                  {ueber ? '+' : ''}
                                  {Math.round((post.kennwert / mittelwert - 1) * 100)} %
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title={<>DMs <span className="count">{daten.dms.length}</span></>}>
              <p className="muted small">Wer eine DM beantwortet, trägt sie am selben Tag ein. Mit Haken landet sie zusätzlich im Anfragen-Eingang.</p>
              <DmListe dms={daten.dms} daten={daten} onBearbeiten={(dm) => setDialog({ art: 'dm', dm })} />
            </Card>

            <div className="tag-grid">
              <Card title="Wochen und Monate">
                {perioden.length === 0 ? (
                  <p className="muted">Noch nichts erfasst. Montags 15 Minuten, monatlich einmal länger.</p>
                ) : (
                  <ul className="social-perioden">
                    {perioden.map((wert) => (
                      <li key={wert.id}>
                        <button type="button" className="link-button strong" onClick={() => setDialog({ art: 'wert', wert })}>
                          {wert.art === 'woche' ? `Woche ab ${formatDate(wert.datum)}` : `Monat ab ${formatDate(wert.datum)}`}
                        </button>
                        <span className="row-sub">
                          {wert.art === 'woche'
                            ? [
                                wert.story_antworten !== null && `${wert.story_antworten} Story-Antworten`,
                                wert.umfrage_antworten !== null && `${wert.umfrage_antworten} Umfragen`,
                                wert.link_klicks !== null && `${wert.link_klicks} Link-Klicks`,
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'ohne Zahlen'
                            : [
                                wert.neue_follower !== null && `${wert.neue_follower} neue Follower`,
                                wert.sitzungen !== null && `${wert.sitzungen} Sitzungen`,
                                wert.erstgespraeche !== null && `${wert.erstgespraeche} Erstgespräche`,
                                wert.angebote_wert_eur !== null && formatEuro(wert.angebote_wert_eur),
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'ohne Zahlen'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <UtmKarte ziel={ziel} />
            </div>

            {dialog?.art === 'wert' && <WertDialog daten={daten} heute={heute} vorgabe={dialog.wert} aendern={aendern} onClose={() => setDialog(null)} />}
            {dialog?.art === 'dm' && (
              <DmDialog dm={dialog.dm} heute={heute} ich={ich} inhalte={daten.inhalte} team={team} aendern={aendern} onClose={() => setDialog(null)} />
            )}
          </>
        );
      }}
    </SocialSeite>
  );
}
