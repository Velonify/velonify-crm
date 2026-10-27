import { useMemo, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { Field, FormError } from '../components/ui';
import { Schalter } from '../components/Schalter';
import type { Database, Whiteboard } from '../data/types';
import { VORLAGEN } from './vorlagen';

/** Firms to pick from: clients first, then everyone else who is not archived, each alphabetically. */
export function FirmenAuswahl({ db, value, onChange }: { db: Database; value: string; onChange(id: string): void }) {
  const [kunden, andere] = useMemo(() => {
    const aktiv = db.firmen.filter((f) => !f.archiviert || f.id === value).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return [aktiv.filter((f) => f.status === 'kunde'), aktiv.filter((f) => f.status !== 'kunde')];
  }, [db, value]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Velonify intern (kein Kunde)</option>
      {kunden.length > 0 && (
        <optgroup label="Kunden">
          {kunden.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Weitere Firmen">
        {andere.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

export function NeuesBoardDialog({ db, firmaId = '', onClose, onAnlegen }: { db: Database; firmaId?: string; onClose(): void; onAnlegen(input: { titel: string; firma_id: string; vorlage: string }): Promise<void> }) {
  const [titel, setTitel] = useState('');
  const [firma, setFirma] = useState(firmaId);
  const [vorlage, setVorlage] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<unknown>(null);
  return (
    <Dialog
      title="Neues Whiteboard"
      submitLabel="Anlegen"
      busy={busy}
      onClose={onClose}
      onSubmit={async () => {
        setBusy(true);
        setFehler(null);
        try {
          await onAnlegen({ titel, firma_id: firma, vorlage });
        } catch (err) {
          setFehler(err);
          setBusy(false);
        }
      }}
    >
      <Field label="Name">
        <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z. B. Sitemap Relaunch" required maxLength={120} />
      </Field>
      <Field label="Gehört zu" hint="Boards eines Kunden stehen in seiner Akte und können im Kundenportal gezeigt werden.">
        <FirmenAuswahl db={db} value={firma} onChange={setFirma} />
      </Field>
      <fieldset className="wb-vorlagen-wahl">
        <legend>Start mit</legend>
        {[{ id: '', name: 'Leer', beschreibung: 'Weiße Fläche' }, ...VORLAGEN].map((v) => (
          <label key={v.id} className={vorlage === v.id ? 'is-aktiv' : undefined}>
            <input type="radio" name="vorlage" value={v.id} checked={vorlage === v.id} onChange={() => setVorlage(v.id)} />
            <strong>{v.name}</strong>
            <span>{v.beschreibung}</span>
          </label>
        ))}
      </fieldset>
      <FormError error={fehler} />
    </Dialog>
  );
}

export function BoardEinstellungenDialog({
  db,
  board,
  onClose,
  onSpeichern,
}: {
  db: Database;
  board: Whiteboard;
  onClose(): void;
  onSpeichern(changes: Partial<Pick<Whiteboard, 'titel' | 'firma_id' | 'sichtbar_kunde' | 'archiviert'>>): Promise<void>;
}) {
  const [titel, setTitel] = useState(board.titel);
  const [firma, setFirma] = useState(board.firma_id);
  const [portal, setPortal] = useState(board.sichtbar_kunde);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<unknown>(null);
  const speichere = async (changes: Parameters<typeof onSpeichern>[0]) => {
    setBusy(true);
    setFehler(null);
    try {
      await onSpeichern(changes);
    } catch (err) {
      setFehler(err);
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Whiteboard"
      busy={busy}
      onClose={onClose}
      onSubmit={() => speichere({ titel, firma_id: firma, sichtbar_kunde: firma ? portal : false })}
      extraActions={
        <button type="button" className="button subtle" disabled={busy} onClick={() => speichere({ archiviert: !board.archiviert })}>
          {board.archiviert ? 'Wiederherstellen' : 'Archivieren'}
        </button>
      }
    >
      <Field label="Name">
        <input value={titel} onChange={(e) => setTitel(e.target.value)} required maxLength={120} />
      </Field>
      <Field label="Gehört zu">
        <FirmenAuswahl db={db} value={firma} onChange={setFirma} />
      </Field>
      <Schalter an={Boolean(firma) && portal} onChange={setPortal} disabled={!firma} label="Im Kundenportal zeigen (nur ansehen)" />
      <FormError error={fehler} />
    </Dialog>
  );
}
