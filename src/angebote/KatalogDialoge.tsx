import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toasts';
import { Field, FormError } from '../components/ui';
import type { CrmService } from '../data/crm';
import { ABRECHNUNGEN } from '../data/katalog';
import {
  EMPTY_KATEGORIE_INPUT,
  EMPTY_LEISTUNG_INPUT,
  type Leistung,
  type LeistungInput,
  type Leistungskategorie,
  type LeistungskategorieInput,
} from '../data/types';
import { fieldOf } from '../lib/errors';

type Aendern = <T>(action: (s: CrmService) => Promise<T>) => Promise<T>;

function useFormular<T>(start: T, aendern: Aendern, onClose: () => void) {
  const toast = useToast();
  const [values, setValues] = useState<T>(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const run = async (action: (s: CrmService) => Promise<unknown>, meldung: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await aendern(action);
      toast.show(meldung);
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  const text = (feld: keyof T) => ({
    value: String(values[feld] ?? ''),
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [feld]: e.target.value })),
  });
  return { values, setValues, busy, error, run, text };
}

export function KategorieDialog({ kategorie, aendern, onClose }: { kategorie?: Leistungskategorie; aendern: Aendern; onClose(): void }) {
  const start: LeistungskategorieInput = kategorie
    ? {
        titel_de: kategorie.titel_de,
        titel_en: kategorie.titel_en,
        umfang_de: kategorie.umfang_de,
        umfang_en: kategorie.umfang_en,
        abrechnung: kategorie.abrechnung || 'einmalig',
        outreach_anlass: kategorie.outreach_anlass,
        outreach_nutzen: kategorie.outreach_nutzen,
        outreach_beleg: kategorie.outreach_beleg,
      }
    : EMPTY_KATEGORIE_INPUT;
  const f = useFormular(start, aendern, onClose);
  const invalid = fieldOf(f.error);

  const speichern = () =>
    f.run(
      (s) => s.saveKategorie(f.values, kategorie && { id: kategorie.id, expectedGeaendertAm: kategorie.geaendert_am }),
      kategorie ? 'Hauptkategorie gespeichert' : 'Hauptkategorie angelegt',
    );
  const archivieren = () => {
    if (!kategorie || !window.confirm(`„${kategorie.titel_de}“ archivieren? Sie verschwindet aus der Auswahl, bleibt aber im Sheet erhalten.`)) return;
    void f.run((s) => s.setKategorieArchiviert(kategorie.id, !kategorie.archiviert, kategorie.geaendert_am), kategorie.archiviert ? 'Wiederhergestellt' : 'Archiviert');
  };

  return (
    <Dialog
      title={kategorie ? 'Hauptkategorie bearbeiten' : 'Neue Hauptkategorie'}
      onClose={onClose}
      onSubmit={speichern}
      busy={f.busy}
      wide
      extraActions={
        kategorie && (
          <button type="button" className="button subtle" onClick={archivieren} disabled={f.busy}>
            {kategorie.archiviert ? 'Wiederherstellen' : 'Archivieren'}
          </button>
        )
      }
    >
      <fieldset className="plain">
        <legend>Abrechnung</legend>
        <div className="segmented" role="radiogroup" aria-label="Abrechnung">
          {ABRECHNUNGEN.map((a) => (
            <button
              key={a.wert}
              type="button"
              role="radio"
              aria-checked={f.values.abrechnung === a.wert}
              className={f.values.abrechnung === a.wert ? 'is-active' : ''}
              onClick={() => f.setValues((v) => ({ ...v, abrechnung: a.wert }))}
            >
              {a.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid">
        <Field label="Titel Deutsch" invalid={invalid === 'titel_de'}>
          <input {...f.text('titel_de')} placeholder="z. B. Datenmigration" autoComplete="off" />
        </Field>
        <Field label="Titel Englisch">
          <input {...f.text('titel_en')} placeholder="e.g. Data Migration" autoComplete="off" />
        </Field>
        <Field label="Leistungsumfang Deutsch" hint="Kurzer Satz für die Übersichtstabelle im Angebot">
          <textarea rows={2} {...f.text('umfang_de')} />
        </Field>
        <Field label="Leistungsumfang Englisch">
          <textarea rows={2} {...f.text('umfang_en')} />
        </Field>
      </div>
      <fieldset className="plain outreach-felder">
        <legend>Für den Contact Generator</legend>
        <p className="small muted">Damit Claude weiß, womit diese Leistung in einer ersten Nachricht überzeugt. Nur auf Deutsch, Claude schreibt trotzdem in der gewählten Sprache.</p>
        <div className="grid">
          <Field label="Anlass" hint="Welches Problem oder welcher Anlass passt, z. B. „Magento 2.4.6 ohne Support seit 11.08.2026“">
            <textarea rows={2} {...f.text('outreach_anlass')} />
          </Field>
          <Field label="Nutzen" hint="Was der Kunde davon hat, in 1–2 Sätzen">
            <textarea rows={2} {...f.text('outreach_nutzen')} />
          </Field>
          <Field label="Beleg" hint="Referenz oder Zahl – Kundennamen nur mit Freigabe" wide>
            <textarea rows={2} {...f.text('outreach_beleg')} />
          </Field>
        </div>
      </fieldset>
      <FormError error={f.error} />
    </Dialog>
  );
}

export function LeistungDialog({
  leistung,
  kategorieId,
  kategorien,
  aendern,
  onClose,
}: {
  leistung?: Leistung;
  kategorieId?: string;
  kategorien: Leistungskategorie[];
  aendern: Aendern;
  onClose(): void;
}) {
  const start: LeistungInput = leistung
    ? { kategorie_id: leistung.kategorie_id, titel_de: leistung.titel_de, titel_en: leistung.titel_en, text_de: leistung.text_de, text_en: leistung.text_en }
    : { ...EMPTY_LEISTUNG_INPUT, kategorie_id: kategorieId ?? '' };
  const f = useFormular(start, aendern, onClose);
  const invalid = fieldOf(f.error);

  const speichern = () =>
    f.run((s) => s.saveLeistung(f.values, leistung && { id: leistung.id, expectedGeaendertAm: leistung.geaendert_am }), leistung ? 'Unterpunkt gespeichert' : 'Unterpunkt angelegt');
  const archivieren = () => {
    if (!leistung || (!leistung.archiviert && !window.confirm(`„${leistung.titel_de}“ archivieren?`))) return;
    void f.run((s) => s.setLeistungArchiviert(leistung.id, !leistung.archiviert, leistung.geaendert_am), leistung.archiviert ? 'Wiederhergestellt' : 'Archiviert');
  };

  return (
    <Dialog
      title={leistung ? 'Unterpunkt bearbeiten' : 'Neuer Unterpunkt'}
      onClose={onClose}
      onSubmit={speichern}
      busy={f.busy}
      wide
      extraActions={
        leistung && (
          <button type="button" className="button subtle" onClick={archivieren} disabled={f.busy}>
            {leistung.archiviert ? 'Wiederherstellen' : 'Archivieren'}
          </button>
        )
      }
    >
      <Field label="Hauptkategorie" invalid={invalid === 'kategorie_id'}>
        <select {...f.text('kategorie_id')}>
          <option value="">Bitte wählen …</option>
          {kategorien.map((k) => (
            <option key={k.id} value={k.id}>
              {k.titel_de}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid">
        <Field label="Titel Deutsch" invalid={invalid === 'titel_de'}>
          <input {...f.text('titel_de')} placeholder="z. B. Probemigrationen" autoComplete="off" />
        </Field>
        <Field label="Titel Englisch">
          <input {...f.text('titel_en')} placeholder="e.g. Trial migrations" autoComplete="off" />
        </Field>
        <Field label="Beschreibung Deutsch" hint="Erscheint als Aufzählungspunkt in der Leistungsbeschreibung">
          <textarea rows={3} {...f.text('text_de')} />
        </Field>
        <Field label="Beschreibung Englisch">
          <textarea rows={3} {...f.text('text_en')} />
        </Field>
      </div>
      <FormError error={f.error} />
    </Dialog>
  );
}
