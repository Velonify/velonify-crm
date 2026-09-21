import { useState, type ReactNode } from 'react';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toasts';
import { Field, FormError } from '../components/ui';
import type { CrmService } from '../data/crm';
import {
  AUFGABEN_BEREICHE,
  DRINGLICHKEITEN,
  FORMATE,
  INHALT_ARTEN,
  INHALT_STATUS,
  KANAELE,
  PLAN_STATUS,
  SAEULEN,
  STICHWORTE,
  inhaltName,
  sortiereInhalte,
} from '../data/social';
import type {
  SocialAufgabe,
  SocialAufgabeInput,
  SocialDm,
  SocialDmInput,
  SocialHook,
  SocialHookInput,
  SocialInhalt,
  SocialInhaltInput,
  SocialPlanEintrag,
  SocialPlanInput,
  SocialText,
  SocialTextInput,
} from '../data/types';
import { fieldOf } from '../lib/errors';
import type { Aendern } from './useSocial';

/** Shared plumbing of every dialog here: run a write, show the error inline, close on success. */
function useSpeichern(aendern: Aendern, onClose: () => void) {
  const toast = useToast();
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

  return { busy, error, run };
}

function ArchivButton({ archiviert, busy, onClick }: { archiviert: boolean; busy: boolean; onClick(): void }) {
  return (
    <button type="button" className="button subtle" onClick={onClick} disabled={busy}>
      {archiviert ? 'Wiederherstellen' : 'Archivieren'}
    </button>
  );
}

function SaeuleFeld({ wert, onChange }: { wert: number | null; onChange(wert: number | null): void }) {
  return (
    <Field label="Säule">
      <select value={wert ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Keine</option>
        {SAEULEN.map((s) => (
          <option key={s.nr} value={s.nr}>
            {s.nr} · {s.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function AuswahlFeld({ label, wert, onChange, optionen, leer }: { label: string; wert: string; onChange(wert: string): void; optionen: readonly { wert: string; label: string }[]; leer?: string }) {
  return (
    <Field label={label}>
      <select value={wert} onChange={(e) => onChange(e.target.value)}>
        {leer && <option value="">{leer}</option>}
        {optionen.map((o) => (
          <option key={o.wert} value={o.wert}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function TeamFeld({ team, wert, onChange }: { team: readonly string[]; wert: string; onChange(wert: string): void }) {
  return (
    <Field label="Zuständig">
      <select value={wert} onChange={(e) => onChange(e.target.value)}>
        <option value="">Niemand</option>
        {team.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function InhaltFeld({ inhalte, wert, onChange, label = 'Inhalt', hint }: { inhalte: readonly SocialInhalt[]; wert: string; onChange(wert: string): void; label?: string; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <select value={wert} onChange={(e) => onChange(e.target.value)}>
        <option value="">Keiner</option>
        {sortiereInhalte(inhalte).map((inhalt) => (
          <option key={inhalt.id} value={inhalt.id}>
            {inhaltName(inhalt)}
          </option>
        ))}
      </select>
    </Field>
  );
}

// ─── Redaktionsplan ──────────────────────────────────────────────────────────

const LEERER_PLAN = (datum: string): SocialPlanInput => ({
  datum,
  uhrzeit: '07:30',
  kanal: 'instagram',
  format: 'karussell',
  saeule: 1,
  thema: '',
  inhalt_id: '',
  status: 'geplant',
  hinweis: '',
  zustaendig: '',
});

export function PlanDialog({
  eintrag,
  heute,
  inhalte,
  team,
  aendern,
  onClose,
}: {
  eintrag?: SocialPlanEintrag;
  heute: string;
  inhalte: readonly SocialInhalt[];
  team: readonly string[];
  aendern: Aendern;
  onClose(): void;
}) {
  const [werte, setWerte] = useState<SocialPlanInput>(() =>
    eintrag
      ? {
          datum: eintrag.datum,
          uhrzeit: eintrag.uhrzeit,
          kanal: eintrag.kanal,
          format: eintrag.format,
          saeule: eintrag.saeule,
          thema: eintrag.thema,
          inhalt_id: eintrag.inhalt_id,
          status: eintrag.status,
          hinweis: eintrag.hinweis,
          zustaendig: eintrag.zustaendig,
        }
      : LEERER_PLAN(heute),
  );
  const { busy, error, run } = useSpeichern(aendern, onClose);
  const setze = <K extends keyof SocialPlanInput>(feld: K, wert: SocialPlanInput[K]) => setWerte((w) => ({ ...w, [feld]: wert }));

  const archivieren = () => {
    if (!eintrag || (!eintrag.archiviert && !window.confirm(`Termin „${eintrag.thema}“ archivieren? Er verschwindet aus dem Plan, bleibt aber im Sheet.`))) return;
    void run((s) => s.setPlanArchiviert(eintrag.id, !eintrag.archiviert, eintrag.geaendert_am), eintrag.archiviert ? 'Wiederhergestellt' : 'Archiviert');
  };

  return (
    <Dialog
      title={eintrag ? 'Termin bearbeiten' : 'Neuer Termin'}
      onClose={onClose}
      busy={busy}
      wide
      extraActions={eintrag && <ArchivButton archiviert={eintrag.archiviert} busy={busy} onClick={archivieren} />}
      onSubmit={() => run((s) => s.savePlanEintrag(werte, eintrag && { id: eintrag.id, expectedGeaendertAm: eintrag.geaendert_am }), eintrag ? 'Termin gespeichert' : 'Termin angelegt')}
    >
      <div className="grid">
        <Field label="Datum" invalid={fieldOf(error) === 'datum'}>
          <input type="date" value={werte.datum} onChange={(e) => setze('datum', e.target.value)} />
        </Field>
        <Field label="Uhrzeit" hint="Leer lassen für Stories, die live rausgehen" invalid={fieldOf(error) === 'uhrzeit'}>
          <input type="time" value={werte.uhrzeit} onChange={(e) => setze('uhrzeit', e.target.value)} />
        </Field>
        <AuswahlFeld label="Kanal" wert={werte.kanal} onChange={(w) => setze('kanal', w)} optionen={KANAELE} />
        <AuswahlFeld label="Format" wert={werte.format} onChange={(w) => setze('format', w)} optionen={FORMATE} leer="–" />
        <SaeuleFeld wert={werte.saeule} onChange={(w) => setze('saeule', w)} />
        <AuswahlFeld label="Status" wert={werte.status} onChange={(w) => setze('status', w)} optionen={PLAN_STATUS} />
        <Field label="Thema" invalid={fieldOf(error) === 'thema'} wide>
          <input value={werte.thema} onChange={(e) => setze('thema', e.target.value)} placeholder="z. B. UMZUGSPLAN #1: 7 Dinge vor dem ersten Export" autoComplete="off" />
        </Field>
        <InhaltFeld inhalte={inhalte} wert={werte.inhalt_id} onChange={(w) => setze('inhalt_id', w)} hint="Der Post, der an diesem Tag rausgeht" />
        <TeamFeld team={team} wert={werte.zustaendig} onChange={(w) => setze('zustaendig', w)} />
        <Field label="Hinweis" hint="Was noch fehlt, z. B. „Design offen“" wide>
          <input value={werte.hinweis} onChange={(e) => setze('hinweis', e.target.value)} autoComplete="off" />
        </Field>
      </div>
      <FormError error={error} />
    </Dialog>
  );
}

// ─── Aufgaben ────────────────────────────────────────────────────────────────

const LEERE_AUFGABE: SocialAufgabeInput = { bereich: 'fehlt', titel: '', beschreibung: '', dringlichkeit: 'diese_woche', faellig_am: '', zustaendig: '' };

export function AufgabeDialog({
  aufgabe,
  bereich,
  team,
  aendern,
  onClose,
}: {
  aufgabe?: SocialAufgabe;
  bereich?: string;
  team: readonly string[];
  aendern: Aendern;
  onClose(): void;
}) {
  const [werte, setWerte] = useState<SocialAufgabeInput>(() =>
    aufgabe
      ? { bereich: aufgabe.bereich, titel: aufgabe.titel, beschreibung: aufgabe.beschreibung, dringlichkeit: aufgabe.dringlichkeit, faellig_am: aufgabe.faellig_am, zustaendig: aufgabe.zustaendig }
      : { ...LEERE_AUFGABE, bereich: bereich ?? LEERE_AUFGABE.bereich },
  );
  const { busy, error, run } = useSpeichern(aendern, onClose);
  const setze = <K extends keyof SocialAufgabeInput>(feld: K, wert: SocialAufgabeInput[K]) => setWerte((w) => ({ ...w, [feld]: wert }));

  const archivieren = () => {
    if (!aufgabe || (!aufgabe.archiviert && !window.confirm(`Aufgabe „${aufgabe.titel}“ archivieren?`))) return;
    void run((s) => s.setAufgabeArchiviert(aufgabe.id, !aufgabe.archiviert, aufgabe.geaendert_am), aufgabe.archiviert ? 'Wiederhergestellt' : 'Archiviert');
  };

  return (
    <Dialog
      title={aufgabe ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
      onClose={onClose}
      busy={busy}
      wide
      extraActions={aufgabe && <ArchivButton archiviert={aufgabe.archiviert} busy={busy} onClick={archivieren} />}
      onSubmit={() => run((s) => s.saveAufgabe(werte, aufgabe && { id: aufgabe.id, expectedGeaendertAm: aufgabe.geaendert_am }), aufgabe ? 'Aufgabe gespeichert' : 'Aufgabe angelegt')}
    >
      <div className="grid">
        <AuswahlFeld label="Bereich" wert={werte.bereich} onChange={(w) => setze('bereich', w)} optionen={AUFGABEN_BEREICHE} />
        <AuswahlFeld label="Dringlichkeit" wert={werte.dringlichkeit} onChange={(w) => setze('dringlichkeit', w)} optionen={DRINGLICHKEITEN} leer="Ohne" />
        <Field label="Titel" invalid={fieldOf(error) === 'titel'} wide>
          <input value={werte.titel} onChange={(e) => setze('titel', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Beschreibung" wide>
          <textarea rows={4} value={werte.beschreibung} onChange={(e) => setze('beschreibung', e.target.value)} />
        </Field>
        <Field label="Fällig am" invalid={fieldOf(error) === 'faellig_am'}>
          <input type="date" value={werte.faellig_am} onChange={(e) => setze('faellig_am', e.target.value)} />
        </Field>
        <TeamFeld team={team} wert={werte.zustaendig} onChange={(w) => setze('zustaendig', w)} />
      </div>
      <FormError error={error} />
    </Dialog>
  );
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function HookDialog({ hook, inhalte, aendern, onClose }: { hook?: SocialHook; inhalte: readonly SocialInhalt[]; aendern: Aendern; onClose(): void }) {
  const [werte, setWerte] = useState<SocialHookInput>(() =>
    hook ? { saeule: hook.saeule, text: hook.text, status: hook.status, inhalt_id: hook.inhalt_id } : { saeule: 1, text: '', status: 'frei', inhalt_id: '' },
  );
  const { busy, error, run } = useSpeichern(aendern, onClose);
  const setze = <K extends keyof SocialHookInput>(feld: K, wert: SocialHookInput[K]) => setWerte((w) => ({ ...w, [feld]: wert }));

  const archivieren = () => {
    if (!hook || (!hook.archiviert && !window.confirm('Hook archivieren?'))) return;
    void run((s) => s.setHookArchiviert(hook.id, !hook.archiviert, hook.geaendert_am), hook.archiviert ? 'Wiederhergestellt' : 'Archiviert');
  };

  return (
    <Dialog
      title={hook ? 'Hook bearbeiten' : 'Neuer Hook'}
      onClose={onClose}
      busy={busy}
      wide
      extraActions={hook && <ArchivButton archiviert={hook.archiviert} busy={busy} onClick={archivieren} />}
      onSubmit={() => run((s) => s.saveHook(werte, hook && { id: hook.id, expectedGeaendertAm: hook.geaendert_am }), hook ? 'Hook gespeichert' : 'Hook angelegt')}
    >
      <div className="grid">
        <Field label="Hook" hint="In Großbuchstaben, wie er auf Slide 1 steht" invalid={fieldOf(error) === 'text'} wide>
          <textarea rows={2} value={werte.text} onChange={(e) => setze('text', e.target.value)} />
        </Field>
        <SaeuleFeld wert={werte.saeule} onChange={(w) => setze('saeule', w)} />
        <AuswahlFeld
          label="Status"
          wert={werte.status}
          onChange={(w) => setze('status', w)}
          optionen={[
            { wert: 'frei', label: 'Frei' },
            { wert: 'benutzt', label: 'Benutzt' },
          ]}
        />
        <InhaltFeld inhalte={inhalte} wert={werte.inhalt_id} onChange={(w) => setze('inhalt_id', w)} label="Benutzt in" hint="Welcher Post diesen Hook trägt" />
      </div>
      <FormError error={error} />
    </Dialog>
  );
}

// ─── Strategietexte ──────────────────────────────────────────────────────────

export function TextDialog({ text, aendern, onClose }: { text?: SocialText; aendern: Aendern; onClose(): void }) {
  const [werte, setWerte] = useState<SocialTextInput>(() => (text ? { schluessel: text.schluessel, titel: text.titel, text: text.text } : { schluessel: '', titel: '', text: '' }));
  const { busy, error, run } = useSpeichern(aendern, onClose);
  const setze = <K extends keyof SocialTextInput>(feld: K, wert: SocialTextInput[K]) => setWerte((w) => ({ ...w, [feld]: wert }));

  const archivieren = () => {
    if (!text || (!text.archiviert && !window.confirm(`Abschnitt „${text.titel}“ archivieren?`))) return;
    void run((s) => s.setSocialTextArchiviert(text.id, !text.archiviert, text.geaendert_am), text.archiviert ? 'Wiederhergestellt' : 'Archiviert');
  };

  return (
    <Dialog
      title={text ? 'Abschnitt bearbeiten' : 'Neuer Abschnitt'}
      onClose={onClose}
      busy={busy}
      wide
      extraActions={text && <ArchivButton archiviert={text.archiviert} busy={busy} onClick={archivieren} />}
      onSubmit={() => run((s) => s.saveSocialText(werte, text && { id: text.id, expectedGeaendertAm: text.geaendert_am }), text ? 'Abschnitt gespeichert' : 'Abschnitt angelegt')}
    >
      <div className="grid">
        <Field label="Überschrift" invalid={fieldOf(error) === 'titel'} wide>
          <input value={werte.titel} onChange={(e) => setze('titel', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Text" wide>
          <textarea rows={18} value={werte.text} onChange={(e) => setze('text', e.target.value)} />
        </Field>
      </div>
      <FormError error={error} />
    </Dialog>
  );
}

// ─── DMs ─────────────────────────────────────────────────────────────────────

const LEERE_DM = (datum: string, ich: string | null): SocialDmInput => ({
  datum,
  kanal: 'instagram',
  stichwort: '',
  inhalt_id: '',
  name: '',
  shop: '',
  nachricht: '',
  qualifiziert: false,
  beantwortet_von: ich ?? '',
  notiz: '',
});

export function DmDialog({
  dm,
  heute,
  ich,
  inhalte,
  team,
  aendern,
  onClose,
}: {
  dm?: SocialDm;
  heute: string;
  ich: string | null;
  inhalte: readonly SocialInhalt[];
  team: readonly string[];
  aendern: Aendern;
  onClose(): void;
}) {
  const [werte, setWerte] = useState<SocialDmInput>(() =>
    dm
      ? {
          datum: dm.datum,
          kanal: dm.kanal,
          stichwort: dm.stichwort,
          inhalt_id: dm.inhalt_id,
          name: dm.name,
          shop: dm.shop,
          nachricht: dm.nachricht,
          qualifiziert: dm.qualifiziert,
          beantwortet_von: dm.beantwortet_von,
          notiz: dm.notiz,
        }
      : LEERE_DM(heute, ich),
  );
  const [anfrageAnlegen, setAnfrageAnlegen] = useState(!dm);
  const { busy, error, run } = useSpeichern(aendern, onClose);
  const setze = <K extends keyof SocialDmInput>(feld: K, wert: SocialDmInput[K]) => setWerte((w) => ({ ...w, [feld]: wert }));

  return (
    <Dialog
      title={dm ? 'DM bearbeiten' : 'DM erfassen'}
      onClose={onClose}
      busy={busy}
      wide
      onSubmit={() =>
        dm
          ? run((s) => s.aendereDm(dm.id, werte, dm.geaendert_am), 'DM gespeichert')
          : run(
              (s) => s.erfasseDm(werte, { anfrageAnlegen }),
              anfrageAnlegen ? 'DM erfasst und in den Anfragen-Eingang gelegt' : 'DM erfasst',
            )
      }
    >
      <div className="grid">
        <Field label="Datum" invalid={fieldOf(error) === 'datum'}>
          <input type="date" value={werte.datum} onChange={(e) => setze('datum', e.target.value)} />
        </Field>
        <AuswahlFeld
          label="Kanal"
          wert={werte.kanal}
          onChange={(w) => setze('kanal', w)}
          optionen={[
            { wert: 'instagram', label: 'Instagram' },
            { wert: 'linkedin', label: 'LinkedIn' },
          ]}
        />
        <Field label="Stichwort" hint={`Aus dem Plan: ${STICHWORTE.join(', ')}`}>
          <input list="social-stichworte" value={werte.stichwort} onChange={(e) => setze('stichwort', e.target.value)} autoComplete="off" />
          <datalist id="social-stichworte">
            {STICHWORTE.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <InhaltFeld inhalte={inhalte} wert={werte.inhalt_id} onChange={(w) => setze('inhalt_id', w)} label="Ausgelöst durch" hint="Entscheidet mit, welches Format ihr verdoppelt" />
        <Field label="Name oder Handle" invalid={fieldOf(error) === 'name'}>
          <input value={werte.name} onChange={(e) => setze('name', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Shop">
          <input value={werte.shop} onChange={(e) => setze('shop', e.target.value)} placeholder="beispielshop.de" autoComplete="off" />
        </Field>
        <Field label="Nachricht" wide>
          <textarea rows={3} value={werte.nachricht} onChange={(e) => setze('nachricht', e.target.value)} />
        </Field>
        <TeamFeld team={team} wert={werte.beantwortet_von} onChange={(w) => setze('beantwortet_von', w)} />
        <Field label="Notiz">
          <input value={werte.notiz} onChange={(e) => setze('notiz', e.target.value)} autoComplete="off" />
        </Field>
        <div className="field wide">
          <label className="checkbox">
            <input type="checkbox" checked={werte.qualifiziert} onChange={(e) => setze('qualifiziert', e.target.checked)} />
            Qualifiziert: Onlineshop im DACH-Raum, Entscheider:in, konkreter Bedarf in den nächsten sechs Monaten
          </label>
          {!dm && (
            <label className="checkbox">
              <input type="checkbox" checked={anfrageAnlegen} onChange={(e) => setAnfrageAnlegen(e.target.checked)} />
              Auch in den Anfragen-Eingang legen, damit daraus eine Firma im CRM werden kann
            </label>
          )}
        </div>
      </div>
      <FormError error={error} />
    </Dialog>
  );
}

// ─── Inhalt anlegen (Bearbeiten passiert auf der Detailseite) ────────────────

const LEERER_INHALT: SocialInhaltInput = {
  kennung: '',
  art: 'karussell',
  serie: '',
  saeule: 1,
  titel: '',
  ziel: '',
  hook: '',
  slides: [],
  caption: '',
  cta: '',
  hashtags: '',
  alt_text: '',
  ton: '',
  material: '',
  hinweis: '',
  status: 'idee',
};

export function InhaltNeuDialog({ aendern, onClose, onAngelegt }: { aendern: Aendern; onClose(): void; onAngelegt(id: string): void }) {
  const [werte, setWerte] = useState<SocialInhaltInput>(LEERER_INHALT);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const setze = <K extends keyof SocialInhaltInput>(feld: K, wert: SocialInhaltInput[K]) => setWerte((w) => ({ ...w, [feld]: wert }));

  const speichern = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const inhalt = await aendern((s) => s.saveInhalt(werte));
      toast.show('Inhalt angelegt');
      onAngelegt(inhalt.id);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Dialog title="Neuer Inhalt" onClose={onClose} busy={busy} wide onSubmit={speichern} submitLabel="Anlegen und öffnen">
      <div className="grid">
        <Field label="Kennung" hint="Kurzzeichen wie im Plan: K6, R5, E4, S11" wide={false}>
          <input value={werte.kennung} onChange={(e) => setze('kennung', e.target.value)} autoComplete="off" />
        </Field>
        <AuswahlFeld label="Art" wert={werte.art} onChange={(w) => setze('art', w)} optionen={INHALT_ARTEN} />
        <Field label="Titel" invalid={fieldOf(error) === 'titel'} wide>
          <input value={werte.titel} onChange={(e) => setze('titel', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Serie" hint="z. B. UMZUGSPLAN #2">
          <input value={werte.serie} onChange={(e) => setze('serie', e.target.value)} autoComplete="off" />
        </Field>
        <SaeuleFeld wert={werte.saeule} onChange={(w) => setze('saeule', w)} />
        <AuswahlFeld label="Status" wert={werte.status} onChange={(w) => setze('status', w)} optionen={INHALT_STATUS} />
      </div>
      <FormError error={error} />
    </Dialog>
  );
}

/** Small helper so pages can show a labelled block of read-only text. */
export function Feldwert({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="item">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
