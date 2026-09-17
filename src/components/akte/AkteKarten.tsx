import { useMemo, useState } from 'react';
import { AKTIVITAET_LABEL, AKTIVITAET_TYPEN, isAbgeschlossen, PHASEN, phaseLabel } from '../../data/constants';
import { useCrm } from '../../data/CrmContext';
import { isoDate } from '../../data/ids';
import { kontaktName } from '../../data/rules';
import { wahrscheinlichkeit } from '../../data/selectors';
import type { Aktivitaet, Database, Deal, Firma, Kontakt, Wiedervorlage } from '../../data/types';
import { faelligText, formatDate, formatDateTime, formatEuro, shortUser } from '../../lib/format';
import { DealDialog } from '../dialogs/DealDialog';
import { KontaktDialog } from '../dialogs/KontaktDialog';
import { TerminDialog } from '../dialogs/TerminDialog';
import { WiedervorlageDialog } from '../dialogs/WiedervorlageDialog';
import { useToast } from '../Toasts';
import { Card, FormError } from '../ui';

// ─── Deals ───────────────────────────────────────────────────────────────────

export function DealsKarte({ firma, db, ich, requestPhase }: { firma: Firma; db: Database; ich: string | null; requestPhase(deal: Deal, phase: string): void }) {
  const [dialog, setDialog] = useState<{ deal?: Deal } | null>(null);
  const [zeigeAbgeschlossene, setZeigeAbgeschlossene] = useState(false);
  const heute = isoDate(new Date());
  const deals = db.deals.filter((d) => d.firma_id === firma.id && !d.archiviert);
  const offen = deals.filter((d) => !isAbgeschlossen(d.phase));
  const abgeschlossen = deals.filter((d) => isAbgeschlossen(d.phase));
  const sichtbar = zeigeAbgeschlossene ? [...offen, ...abgeschlossen] : offen;
  const kontakte = new Map(db.kontakte.map((k) => [k.id, k]));

  return (
    <Card
      title="Deals"
      actions={
        <button type="button" className="button small" onClick={() => setDialog({})} disabled={firma.archiviert}>
          + Deal
        </button>
      }
    >
      {deals.length === 0 && <p className="muted">Noch kein Deal. Mit „+ Deal“ startet die Pipeline für diese Firma.</p>}
      <ul className="deal-list">
        {sichtbar.map((deal) => {
          const kontakt = kontakte.get(deal.kontakt_id);
          const ueberfaellig = deal.naechster_schritt_am && deal.naechster_schritt_am < heute && !isAbgeschlossen(deal.phase);
          return (
            <li key={deal.id} className="deal-row">
              <div className="deal-main">
                <button type="button" className="link-button strong" onClick={() => setDialog({ deal })}>
                  {deal.titel}
                </button>
                <div className="row-sub">
                  {formatEuro(deal.wert_eur)}
                  {deal.wert_eur !== null && !isAbgeschlossen(deal.phase) && <span> · {wahrscheinlichkeit(deal)} %</span>}
                  {deal.zustaendig && <span> · {deal.zustaendig}</span>}
                  {kontakt && <span> · {kontaktName(kontakt)}</span>}
                </div>
                {!isAbgeschlossen(deal.phase) && (
                  <div className={`next-step${ueberfaellig ? ' overdue' : ''}`}>
                    {deal.naechster_schritt || deal.naechster_schritt_am ? (
                      <>
                        → {deal.naechster_schritt || 'Nächster Schritt'}
                        {deal.naechster_schritt_am && ` · ${formatDate(deal.naechster_schritt_am)} (${faelligText(deal.naechster_schritt_am, heute)})`}
                      </>
                    ) : (
                      <span className="muted">Kein nächster Schritt geplant</span>
                    )}
                  </div>
                )}
                {deal.phase === 'verloren' && deal.verlustgrund && <div className="row-sub">Grund: {deal.verlustgrund}</div>}
              </div>
              <select
                className="phase-select"
                value={deal.phase}
                onChange={(e) => requestPhase(deal, e.target.value)}
                aria-label={`Phase von ${deal.titel}`}
                disabled={firma.archiviert}
              >
                {PHASEN.map((p) => (
                  <option key={p} value={p}>
                    {phaseLabel(p)}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
      {abgeschlossen.length > 0 && (
        <button type="button" className="link-button small" onClick={() => setZeigeAbgeschlossene((v) => !v)}>
          {zeigeAbgeschlossene ? 'Abgeschlossene ausblenden' : `${abgeschlossen.length} abgeschlossene zeigen`}
        </button>
      )}
      {dialog && <DealDialog firmaId={firma.id} deal={dialog.deal} ich={ich} onClose={() => setDialog(null)} />}
    </Card>
  );
}

// ─── Kontakte ────────────────────────────────────────────────────────────────

export function KontakteKarte({ firma, db }: { firma: Firma; db: Database }) {
  const [dialog, setDialog] = useState<{ kontakt?: Kontakt } | null>(null);
  const [termin, setTermin] = useState<string | null>(null);
  const kontakte = db.kontakte
    .filter((k) => k.firma_id === firma.id && !k.archiviert)
    .sort((a, b) => Number(b.hauptkontakt) - Number(a.hauptkontakt) || kontaktName(a).localeCompare(kontaktName(b), 'de'));

  return (
    <Card
      title="Kontakte"
      actions={
        <button type="button" className="button small" onClick={() => setDialog({})} disabled={firma.archiviert}>
          + Kontakt
        </button>
      }
    >
      {kontakte.length === 0 && <p className="muted">Noch keine Ansprechpartner.</p>}
      <ul className="contact-list">
        {kontakte.map((k) => (
          <li key={k.id}>
            <div className="contact-head">
              <button type="button" className="link-button strong" onClick={() => setDialog({ kontakt: k })}>
                {kontaktName(k)}
              </button>
              {k.hauptkontakt && <span className="badge subtle" title="Hauptansprechpartner">Haupt</span>}
            </div>
            {k.rolle && <div className="row-sub">{k.rolle}</div>}
            <div className="contact-links">
              {k.email && <a href={`mailto:${k.email}`}>{k.email}</a>}
              {k.telefon && <a href={`tel:${k.telefon.replace(/[^\d+]/g, '')}`}>{k.telefon}</a>}
              {k.linkedin && (
                <a href={k.linkedin} target="_blank" rel="noreferrer noopener">
                  LinkedIn ↗
                </a>
              )}
              {k.email && !firma.archiviert && (
                <button type="button" className="link-button" onClick={() => setTermin(k.id)}>
                  Termin planen
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {dialog && <KontaktDialog firmaId={firma.id} kontakt={dialog.kontakt} onClose={() => setDialog(null)} />}
      {termin && <TerminDialog firma={firma} kontaktId={termin} onClose={() => setTermin(null)} />}
    </Card>
  );
}

// ─── Wiedervorlagen ──────────────────────────────────────────────────────────

export function WiedervorlagenKarte({ firma, db, ich }: { firma: Firma; db: Database; ich: string | null }) {
  const { perform } = useCrm();
  const [dialog, setDialog] = useState<{ wiedervorlage?: Wiedervorlage } | null>(null);
  const heute = isoDate(new Date());
  const alle = db.wiedervorlagen.filter((w) => w.firma_id === firma.id);
  const offen = alle.filter((w) => !w.erledigt_am).sort((a, b) => a.faellig_am.localeCompare(b.faellig_am));
  const erledigt = alle.length - offen.length;

  return (
    <Card
      title="Wiedervorlagen"
      actions={
        <button type="button" className="button small" onClick={() => setDialog({})} disabled={firma.archiviert}>
          + Wiedervorlage
        </button>
      }
    >
      {offen.length === 0 && <p className="muted">Nichts offen{erledigt > 0 ? ` (${erledigt} erledigt)` : ''}.</p>}
      <ul className="task-list">
        {offen.map((w) => (
          <li key={w.id} className={w.faellig_am < heute ? 'overdue' : w.faellig_am === heute ? 'today' : ''}>
            <input
              type="checkbox"
              aria-label={`${w.titel} erledigt`}
              onChange={() => perform((s) => s.setWiedervorlageErledigt(w.id, true), `Erledigt: ${w.titel}`)}
            />
            <div>
              <button type="button" className="link-button" onClick={() => setDialog({ wiedervorlage: w })}>
                {w.titel}
              </button>
              <div className="row-sub">
                {formatDate(w.faellig_am)} ({faelligText(w.faellig_am, heute)}){w.zustaendig && ` · ${w.zustaendig}`}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {dialog && <WiedervorlageDialog firmaId={firma.id} wiedervorlage={dialog.wiedervorlage} ich={ich} onClose={() => setDialog(null)} />}
    </Card>
  );
}

// ─── Verlauf ─────────────────────────────────────────────────────────────────

export function VerlaufKarte({ firma, db }: { firma: Firma; db: Database }) {
  const { mutate } = useCrm();
  const toast = useToast();
  const [typ, setTyp] = useState<string>('notiz');
  const [text, setText] = useState('');
  const [dealId, setDealId] = useState('');
  const [kontaktId, setKontaktId] = useState('');
  const [datum, setDatum] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [alle, setAlle] = useState(false);

  const eintraege = useMemo(
    () =>
      db.aktivitaeten
        .map((a, index) => ({ a, index }))
        .filter(({ a }) => a.firma_id === firma.id)
        // Newest first; entries from the same moment in reverse order of writing.
        .sort((x, y) => y.a.datum.localeCompare(x.a.datum) || y.index - x.index)
        .map(({ a }) => a),
    [db.aktivitaeten, firma.id],
  );
  const kontakte = db.kontakte.filter((k) => k.firma_id === firma.id && !k.archiviert);
  const deals = db.deals.filter((d) => d.firma_id === firma.id && !d.archiviert);
  const kontaktNamen = new Map(db.kontakte.map((k) => [k.id, kontaktName(k)]));
  const dealTitel = new Map(db.deals.map((d) => [d.id, d.titel]));
  const sichtbar = alle ? eintraege : eintraege.slice(0, 15);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await mutate((s) =>
        s.addAktivitaet({ firma_id: firma.id, kontakt_id: kontaktId, deal_id: dealId, typ, text, datum: datum ? new Date(datum).toISOString() : '' }),
      );
      setText('');
      setDatum('');
      toast.show('Im Verlauf eingetragen');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Verlauf" className="verlauf">
      {!firma.archiviert && (
        <form className="activity-form" onSubmit={submit}>
          <div className="segmented" role="radiogroup" aria-label="Art">
            {AKTIVITAET_TYPEN.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={typ === t} className={typ === t ? 'is-active' : ''} onClick={() => setTyp(t)}>
                {AKTIVITAET_LABEL[t]}
              </button>
            ))}
          </div>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Was ist passiert? Was wurde besprochen?" aria-label="Eintrag" />
          <div className="activity-options">
            {kontakte.length > 0 && (
              <select value={kontaktId} onChange={(e) => setKontaktId(e.target.value)} aria-label="Mit wem">
                <option value="">Mit wem? –</option>
                {kontakte.map((k) => (
                  <option key={k.id} value={k.id}>
                    {kontaktName(k)}
                  </option>
                ))}
              </select>
            )}
            {deals.length > 0 && (
              <select value={dealId} onChange={(e) => setDealId(e.target.value)} aria-label="Zu Deal">
                <option value="">Zu Deal? –</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.titel}
                  </option>
                ))}
              </select>
            )}
            <input type="datetime-local" value={datum} onChange={(e) => setDatum(e.target.value)} aria-label="Zeitpunkt (leer = jetzt)" title="Leer = jetzt" />
            <button type="submit" className="button primary" disabled={busy || !text.trim()}>
              {busy ? 'Speichert …' : 'Eintragen'}
            </button>
          </div>
          <FormError error={error} />
        </form>
      )}
      {eintraege.length === 0 && <p className="muted">Noch keine Einträge.</p>}
      <ol className="timeline">
        {sichtbar.map((a: Aktivitaet) => (
          <li key={a.id} className={`timeline-item typ-${a.typ}`}>
            <span className="timeline-icon" aria-hidden="true" />
            <div>
              <div className="timeline-meta">
                <strong>{AKTIVITAET_LABEL[a.typ] ?? a.typ}</strong> · {formatDateTime(a.datum)} · {shortUser(a.von)}
                {a.kontakt_id && kontaktNamen.get(a.kontakt_id) && ` · mit ${kontaktNamen.get(a.kontakt_id)}`}
                {a.deal_id && dealTitel.get(a.deal_id) && a.typ !== 'phasenwechsel' && ` · ${dealTitel.get(a.deal_id)}`}
              </div>
              <p className="timeline-text">{linkify(a.text)}</p>
            </div>
          </li>
        ))}
      </ol>
      {eintraege.length > 15 && (
        <button type="button" className="link-button small" onClick={() => setAlle((v) => !v)}>
          {alle ? 'Weniger zeigen' : `Alle ${eintraege.length} Einträge zeigen`}
        </button>
      )}
    </Card>
  );
}

/** Turns URLs in activity text (e.g. Meet links) into links. */
function linkify(text: string) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer noopener">
        {part}
      </a>
    ) : (
      part
    ),
  );
}
