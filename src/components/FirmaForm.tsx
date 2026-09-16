import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EOL, EOL_LABEL, STATUS, statusLabel, TIERS } from '../data/constants';
import { findeDubletten, type DublettenTreffer } from '../data/dubletten';
import { DuplicateError, ValidationError } from '../data/errors';
import type { Firma, FirmaInput, Listen } from '../data/types';
import { errorMessage } from '../lib/errors';

interface Props {
  initial: FirmaInput;
  listen: Listen;
  submitLabel: string;
  onSubmit(values: FirmaInput): Promise<void>;
  onCancel(): void;
  /** All firms, for the duplicate warning. */
  alleFirmen: readonly Firma[];
  /** The firm being edited; its own record and duplicates it already had are not warned about again. */
  selfId?: string;
}

type TextField = Exclude<keyof FirmaInput, 'score'>;

export function FirmaForm({ initial, listen, submitLabel, onSubmit, onCancel, alleFirmen, selfId }: Props) {
  const [values, setValues] = useState<FirmaInput>(initial);
  const [dubletten, setDubletten] = useState<DublettenTreffer[]>([]);
  const [scoreText, setScoreText] = useState(initial.score === null ? '' : String(initial.score));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>();
  const formId = useId();

  const set = (field: TextField) => (event: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: event.target.value }));

  const speichern = async (dublettenBestaetigt: boolean) => {
    const trimmedScore = scoreText.trim().replace(',', '.');
    const score = trimmedScore === '' ? null : Number(trimmedScore);
    if (score !== null && !Number.isFinite(score)) {
      setError(new ValidationError('score', 'Score muss eine Zahl sein.'));
      return;
    }
    if (!dublettenBestaetigt) {
      // Warn only about matches this change creates, not ones the firm already had when the form opened.
      const vorher = new Set(selfId ? findeDubletten({ ...initial, id: selfId }, alleFirmen).map((t) => t.firma.id) : []);
      const treffer = findeDubletten({ ...values, id: selfId }, alleFirmen).filter((t) => !vorher.has(t.firma.id) && !t.firma.archiviert);
      if (treffer.length > 0) {
        setDubletten(treffer);
        return;
      }
    }
    setDubletten([]);
    setSaving(true);
    setError(undefined);
    try {
      await onSubmit({ ...values, score });
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void speichern(false);
  };

  const invalidField = error instanceof ValidationError || error instanceof DuplicateError ? error.field : undefined;

  const field = (name: keyof FirmaInput, label: string, input: ReactNode, hint?: string, wide = false) => (
    <div className={`field${wide ? ' wide' : ''}${invalidField === name ? ' invalid' : ''}`}>
      <label htmlFor={`${formId}-${name}`}>{label}</label>
      {input}
      {hint && <small className="field-hint">{hint}</small>}
    </div>
  );

  const text = (name: TextField, props: { type?: string; placeholder?: string; required?: boolean } = {}) => (
    <input id={`${formId}-${name}`} value={values[name]} onChange={set(name)} {...props} />
  );

  const select = (name: TextField, options: string[], labels: (value: string) => string = (v) => v) => {
    // Keep a value that is no longer in the list selectable, so editing never silently drops it.
    const all = values[name] && !options.includes(values[name]) ? [...options, values[name]] : options;
    return (
      <select id={`${formId}-${name}`} value={values[name]} onChange={set(name)}>
        <option value="">–</option>
        {all.map((option) => (
          <option key={option} value={option}>
            {labels(option)}
          </option>
        ))}
      </select>
    );
  };

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <fieldset>
        <legend>Grunddaten</legend>
        <div className="grid">
          {field('name', 'Name *', text('name', { required: true, placeholder: 'Firmenname' }), undefined, true)}
          {field('domain', 'Domain', text('domain', { placeholder: 'shop.de' }), 'Eindeutig – daran erkennt der Import Dubletten.')}
          {field('kuerzel', 'Kürzel', text('kuerzel', { placeholder: 'ABC' }), 'Neue Kürzel: 3 Buchstaben. Wie in Drive, Slack, Trello.')}
          {field('status', 'Status', select('status', [...STATUS], statusLabel))}
          {field('zustaendig', 'Zuständig', select('zustaendig', listen.team ?? []))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Einordnung</legend>
        <div className="grid">
          {field('tier', 'Tier', select('tier', [...TIERS]))}
          {field(
            'score',
            'Score',
            <input id={`${formId}-score`} inputMode="numeric" value={scoreText} onChange={(e) => setScoreText(e.target.value)} placeholder="0–100" />,
          )}
          {field('quelle', 'Quelle', text('quelle', { placeholder: 'z. B. Magento Lauf 1, Empfehlung' }))}
          {field('plattform', 'Plattform', text('plattform', { placeholder: 'magento2' }))}
          {field('version', 'Version', text('version', { placeholder: '2.4.6' }))}
          {field('eol', 'Support-Status', select('eol', [...EOL], (v) => EOL_LABEL[v] ?? v))}
          {field('tech_info', 'Technik', <textarea id={`${formId}-tech_info`} rows={2} value={values.tech_info} onChange={set('tech_info')} placeholder="Tracking, Payment, Katalogumfang …" />, undefined, true)}
        </div>
      </fieldset>

      <fieldset>
        <legend>Firmendaten</legend>
        <div className="grid">
          {field('email_allgemein', 'E-Mail allgemein', text('email_allgemein', { type: 'email', placeholder: 'info@shop.de' }))}
          {field('telefon_allgemein', 'Telefon allgemein', text('telefon_allgemein', { type: 'tel' }))}
          {field('ort', 'Ort', text('ort'))}
          {field('register', 'Handelsregister', text('register', { placeholder: 'HRB 12345 (AG Hamburg)' }))}
          {field('ust_id', 'USt-ID', text('ust_id', { placeholder: 'DE123456789' }))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Verknüpfungen</legend>
        <div className="grid">
          {field('drive_ordner_id', 'Drive-Ordner', text('drive_ordner_id', { placeholder: 'Link oder Ordner-ID' }), 'Den Link aus der Adresszeile einfügen reicht.')}
          {field('slack_channel', 'Slack-Channel', text('slack_channel', { placeholder: 'client-abc-general' }))}
          {field('trello_url', 'Trello-Board', text('trello_url', { type: 'url', placeholder: 'https://trello.com/b/…' }))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Notiz</legend>
        <textarea aria-label="Notiz" rows={4} value={values.notiz} onChange={set('notiz')} />
      </fieldset>

      {error !== undefined && (
        <div className="alert error" role="alert">
          <span>
            {errorMessage(error)}
            {error instanceof DuplicateError && (
              <>
                {' '}
                <Link to={`/firmen/${error.existingId}`}>Zur Firma</Link>
              </>
            )}
          </span>
        </div>
      )}

      {dubletten.length > 0 && (
        <div className="hint-box warn" role="alert">
          <strong>Mögliche Dublette.</strong> Diese Firma sieht aus wie:
          <ul className="dubletten-liste">
            {dubletten.map((t) => (
              <li key={t.firma.id}>
                <Link to={`/firmen/${t.firma.id}`} target="_blank" rel="noopener">
                  {t.firma.name}
                  {t.firma.domain && ` (${t.firma.domain})`}
                </Link>{' '}
                – {t.gruende.join(', ')}
              </li>
            ))}
          </ul>
          <div className="form-actions">
            <button type="button" className="button" onClick={() => setDubletten([])}>
              Zurück zum Formular
            </button>
            <button type="button" className="button primary" onClick={() => void speichern(true)} disabled={saving}>
              Trotzdem speichern
            </button>
          </div>
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="button" onClick={onCancel} disabled={saving}>
          Abbrechen
        </button>
        <button type="submit" className="button primary" disabled={saving}>
          {saving ? 'Speichert …' : submitLabel}
        </button>
      </div>
    </form>
  );
}
