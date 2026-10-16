import { useEffect, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toasts';
import { Field, FormError } from '../components/ui';
import type { CrmService } from '../data/crm';
import { FREIGABE_LABEL, freigabeVon } from '../data/portal';
import { checklisteVon, neueSpaltenId, spaltenVon } from '../data/todos';
import type { Aufgabe, AufgabeInput, AufgabenKommentar, Board, ChecklistenPunkt, Spalte } from '../data/types';
import { fieldOf } from '../lib/errors';
import { formatDateTime, shortUser } from '../lib/format';
import { config } from '../config';
import { PersonenAuswahl } from '../components/PersonenAuswahl';
import { ErwaehnungsFeld, MitErwaehnungen } from '../components/Erwaehnungen';

/** Comments from outside the team domain come from the client portal. */
const istTeam = (von: string) => von.trim().toLowerCase().endsWith(`@${config.allowedDomain}`);

export type Aendern = <T>(action: (s: CrmService) => Promise<T>) => Promise<T>;

function useSpeichern(aendern: Aendern, onClose: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const run = async (action: (s: CrmService) => Promise<unknown>, meldung: string, schliessen = true) => {
    setBusy(true);
    setError(undefined);
    try {
      await aendern(action);
      toast.show(meldung);
      if (schliessen) onClose();
      else setBusy(false);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export function KarteDialog({
  board,
  aufgabe,
  spalteId,
  kommentare,
  team,
  istKundenBoard,
  aendern,
  onClose,
  kommentarId,
}: {
  board: Board;
  aufgabe?: Aufgabe;
  /** Comment to scroll to and mark, e.g. when opened from a mention. */
  kommentarId?: string;
  /** Column of a new card. */
  spalteId?: string;
  kommentare: AufgabenKommentar[];
  team: readonly string[];
  istKundenBoard: boolean;
  aendern: Aendern;
  onClose(): void;
}) {
  const spalten = spaltenVon(board);
  const [werte, setWerte] = useState<AufgabeInput>(() =>
    aufgabe
      ? {
          titel: aufgabe.titel, beschreibung: aufgabe.beschreibung, zustaendig: aufgabe.zustaendig, faellig_am: aufgabe.faellig_am, labels: aufgabe.labels,
          checkliste: aufgabe.checkliste, sichtbar_kunde: aufgabe.sichtbar_kunde, spalte_id: aufgabe.spalte_id,
        }
      : { titel: '', beschreibung: '', zustaendig: '', faellig_am: '', labels: '', checkliste: '', sichtbar_kunde: false, spalte_id: spalteId ?? spalten[0].id },
  );
  const [punkte, setPunkte] = useState<ChecklistenPunkt[]>(() => checklisteVon(werte));
  const [neuerPunkt, setNeuerPunkt] = useState('');
  const [kommentar, setKommentar] = useState('');
  const { busy, error, run } = useSpeichern(aendern, onClose);
  const eigene = aufgabe ? kommentare.filter((k) => k.aufgabe_id === aufgabe.id).sort((a, b) => a.datum.localeCompare(b.datum)) : [];
  useEffect(() => {
    if (kommentarId) document.getElementById(`kommentar-${kommentarId}`)?.scrollIntoView({ block: 'center' });
  }, [kommentarId]);

  const punktHinzu = () => {
    if (!neuerPunkt.trim()) return;
    setPunkte((p) => [...p, { text: neuerPunkt.trim(), erledigt: false }]);
    setNeuerPunkt('');
  };

  const speichern = () => {
    const eingabe = { ...werte, checkliste: JSON.stringify(neuerPunkt.trim() ? [...punkte, { text: neuerPunkt.trim(), erledigt: false }] : punkte) };
    void run((s) => s.saveKarte(board.id, eingabe, aufgabe && { id: aufgabe.id, expectedGeaendertAm: aufgabe.geaendert_am }), aufgabe ? 'Karte gespeichert' : 'Karte angelegt');
  };

  const freigabe = aufgabe ? freigabeVon(aufgabe) : null;
  /** Saves the open edits first, so nothing typed gets lost, then asks for (or clears) the client's approval. */
  const freigabeAendern = () => {
    if (!aufgabe) return;
    const eingabe = { ...werte, checkliste: JSON.stringify(punkte), sichtbar_kunde: freigabe ? werte.sichtbar_kunde : true };
    void run(
      async (s) => {
        const karte = await s.saveKarte(board.id, eingabe, { id: aufgabe.id, expectedGeaendertAm: aufgabe.geaendert_am });
        return freigabe ? s.freigabeZuruecksetzen(karte.id, karte.geaendert_am) : s.freigabeAnfragen(karte.id, karte.geaendert_am);
      },
      freigabe === 'offen' ? 'Anfrage zurückgezogen' : freigabe ? 'Antwort als erledigt markiert' : 'Freigabe angefragt – der Kunde sieht die Karte unter „Für dich zu tun“',
    );
  };

  const archivieren = () => {
    if (!aufgabe || (!aufgabe.archiviert && !window.confirm(`„${aufgabe.titel}“ archivieren? Die Karte verschwindet vom Board, bleibt aber im Sheet.`))) return;
    void run((s) => s.setKarteArchiviert(aufgabe.id, !aufgabe.archiviert, aufgabe.geaendert_am), aufgabe.archiviert ? 'Wiederhergestellt' : 'Archiviert');
  };

  const kommentieren = () => {
    if (!aufgabe || !kommentar.trim()) return;
    void run((s) => s.kommentiereKarte(aufgabe.id, kommentar), 'Kommentar gespeichert', false).then(() => setKommentar(''));
  };

  return (
    <Dialog
      title={aufgabe ? 'Karte' : 'Neue Karte'}
      onClose={onClose}
      onSubmit={speichern}
      busy={busy}
      wide
      extraActions={
        aufgabe && (
          <button type="button" className="button subtle" onClick={archivieren} disabled={busy}>
            {aufgabe.archiviert ? 'Wiederherstellen' : 'Archivieren'}
          </button>
        )
      }
    >
      <div className="grid">
        <Field label="Titel" invalid={fieldOf(error) === 'titel'} wide>
          <input value={werte.titel} onChange={(e) => setWerte((w) => ({ ...w, titel: e.target.value }))} maxLength={200} autoComplete="off" autoFocus />
        </Field>
        <Field label="Beschreibung" wide>
          <ErwaehnungsFeld rows={4} value={werte.beschreibung} onChange={(beschreibung) => setWerte((w) => ({ ...w, beschreibung }))} team={team} />
        </Field>
        <Field label="Spalte">
          <select value={werte.spalte_id} onChange={(e) => setWerte((w) => ({ ...w, spalte_id: e.target.value }))}>
            {spalten.map((s) => (
              <option key={s.id} value={s.id}>
                {s.titel}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Zuständig">
          <PersonenAuswahl team={team} wert={werte.zustaendig} onChange={(zustaendig) => setWerte((w) => ({ ...w, zustaendig }))} />
        </Field>
        <Field label="Fällig" invalid={fieldOf(error) === 'faellig_am'}>
          <input type="date" value={werte.faellig_am} onChange={(e) => setWerte((w) => ({ ...w, faellig_am: e.target.value }))} />
        </Field>
        <Field label="Labels" hint="Mit Komma getrennt, z. B. Theme, SEO">
          <input value={werte.labels} onChange={(e) => setWerte((w) => ({ ...w, labels: e.target.value }))} autoComplete="off" />
        </Field>
        <Field label="Checkliste" wide>
          <ul className="checkliste">
            {punkte.map((p, i) => (
              <li key={i}>
                <label className="checkbox">
                  <input type="checkbox" checked={p.erledigt} onChange={(e) => setPunkte((alle) => alle.map((q, j) => (j === i ? { ...q, erledigt: e.target.checked } : q)))} />
                  <span className={p.erledigt ? 'is-erledigt' : ''}>{p.text}</span>
                </label>
                <button type="button" className="icon-button" onClick={() => setPunkte((alle) => alle.filter((_, j) => j !== i))} aria-label={`„${p.text}“ entfernen`}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="inline-form">
            <input
              value={neuerPunkt}
              onChange={(e) => setNeuerPunkt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  punktHinzu();
                }
              }}
              placeholder="Neuer Punkt"
              autoComplete="off"
            />
            <button type="button" className="button small" onClick={punktHinzu}>
              Hinzufügen
            </button>
          </div>
        </Field>
        {istKundenBoard && (
          <Field label="Kunde" wide>
            <label className="checkbox">
              <input type="checkbox" checked={werte.sichtbar_kunde} onChange={(e) => setWerte((w) => ({ ...w, sichtbar_kunde: e.target.checked }))} />
              Für den Kunden sichtbar im Kundenportal
            </label>
            {aufgabe && !aufgabe.archiviert && (
              <div className="freigabe-zeile">
                {freigabe && <span className={`badge freigabe-${freigabe}`}>{FREIGABE_LABEL[freigabe]}</span>}
                {freigabe === 'offen' && <span className="muted small">angefragt {formatDateTime(aufgabe.freigabe_am)} von {shortUser(aufgabe.freigabe_von)}</span>}
                {(freigabe === 'freigegeben' || freigabe === 'aenderung') && (
                  <span className="muted small">
                    {formatDateTime(aufgabe.freigabe_am)}
                    {aufgabe.freigabe_von && ` von ${shortUser(aufgabe.freigabe_von)}`}
                  </span>
                )}
                <button type="button" className="button small" onClick={freigabeAendern} disabled={busy}>
                  {freigabe === 'offen' ? 'Anfrage zurückziehen' : freigabe ? 'Antwort erledigt' : 'Freigabe anfragen'}
                </button>
              </div>
            )}
          </Field>
        )}
        {aufgabe?.quelle === 'kunde' && (
          <Field label="Quelle" wide>
            <span>
              Anfrage aus dem Kundenportal von {shortUser(aufgabe.erstellt_von)}, {formatDateTime(aufgabe.erstellt_am)}
            </span>
          </Field>
        )}
        {aufgabe?.quelle_link && (
          <Field label="Quelle" wide>
            <a href={aufgabe.quelle_link} target="_blank" rel="noreferrer noopener">
              {aufgabe.quelle === 'agent' ? 'Slack-Nachricht öffnen ↗' : 'Link öffnen ↗'}
            </a>
          </Field>
        )}
      </div>
      <FormError error={error} />

      {aufgabe && (
        <section className="kommentare">
          <h3 className="subheading">Kommentare</h3>
          {eigene.length === 0 && <p className="muted small">Noch keine Kommentare.</p>}
          <ul className="kommentar-liste">
            {eigene.map((k) => (
              <li key={k.id} id={`kommentar-${k.id}`} className={k.id === kommentarId ? 'is-markiert' : undefined}>
                <div className="timeline-meta">
                  <strong>{shortUser(k.von)}</strong>
                  {!istTeam(k.von) && (
                    <>
                      {' '}
                      <span className="badge ok">Kunde</span>
                    </>
                  )}{' '}
                  · {formatDateTime(k.datum)}
                </div>
                <p className="timeline-text">
                  <MitErwaehnungen text={k.text} team={team} />
                </p>
              </li>
            ))}
          </ul>
          <div className="inline-form">
            <ErwaehnungsFeld
              rows={2}
              value={kommentar}
              onChange={setKommentar}
              team={team}
              placeholder="Kommentar schreiben – mit @ jemanden markieren"
              aria-label="Kommentar"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  kommentieren();
                }
              }}
            />
            <button type="button" className="button small" onClick={kommentieren} disabled={busy || !kommentar.trim()}>
              Kommentieren
            </button>
          </div>
        </section>
      )}
    </Dialog>
  );
}

export function SpaltenDialog({ board, aendern, onClose }: { board: Board; aendern: Aendern; onClose(): void }) {
  const [titel, setTitel] = useState(board.titel);
  const [spalten, setSpalten] = useState<Spalte[]>(() => spaltenVon(board));
  const { busy, error, run } = useSpeichern(aendern, onClose);

  const tauschen = (i: number, j: number) =>
    setSpalten((s) => {
      const neu = [...s];
      [neu[i], neu[j]] = [neu[j], neu[i]];
      return neu;
    });

  const speichern = () => {
    const fehlend = spaltenVon(board).filter((alt) => !spalten.some((s) => s.id === alt.id));
    if (fehlend.length > 0 && !window.confirm(`${fehlend.map((s) => `„${s.titel}“`).join(', ')} entfernen? Karten darin wandern in die erste Spalte.`)) return;
    void run((s) => s.saveBoard(board.id, titel, spalten, board.geaendert_am), 'Board gespeichert');
  };

  return (
    <Dialog title="Board bearbeiten" onClose={onClose} onSubmit={speichern} busy={busy}>
      <div className="grid">
        <Field label="Name" invalid={fieldOf(error) === 'titel'} wide>
          <input value={titel} onChange={(e) => setTitel(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Spalten" hint="Karten in der Spalte „Erledigt“ gelten als erledigt." invalid={fieldOf(error) === 'spalten'} wide>
          <ul className="spalten-editor">
            {spalten.map((s, i) => (
              <li key={s.id}>
                <input value={s.titel} onChange={(e) => setSpalten((alle) => alle.map((x, j) => (j === i ? { ...x, titel: e.target.value } : x)))} aria-label={`Name der Spalte ${i + 1}`} autoComplete="off" />
                <label className="checkbox">
                  <input
                    type="radio"
                    name="erledigt-spalte"
                    checked={Boolean(s.erledigt)}
                    onChange={() => setSpalten((alle) => alle.map((x, j) => ({ id: x.id, titel: x.titel, ...(j === i ? { erledigt: true } : {}) })))}
                  />
                  Erledigt
                </label>
                <button type="button" className="button small subtle" onClick={() => tauschen(i, i - 1)} disabled={i === 0} aria-label="Nach links">
                  ←
                </button>
                <button type="button" className="button small subtle" onClick={() => tauschen(i, i + 1)} disabled={i === spalten.length - 1} aria-label="Nach rechts">
                  →
                </button>
                <button type="button" className="icon-button" onClick={() => setSpalten((alle) => alle.filter((_, j) => j !== i))} disabled={spalten.length === 1} aria-label={`Spalte „${s.titel}“ entfernen`}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="button small" onClick={() => setSpalten((s) => [...s, { id: neueSpaltenId('Neue Spalte', s), titel: 'Neue Spalte' }])}>
            + Spalte
          </button>
        </Field>
      </div>
      <FormError error={error} />
    </Dialog>
  );
}
