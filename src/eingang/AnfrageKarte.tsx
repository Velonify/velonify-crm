import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, Field, FormError } from '../components/ui';
import { anfrageDubletten, anfrageFirmenname } from '../data/eingang';
import type { Anfrage, Firma } from '../data/types';
import { formatDateTime } from '../lib/format';

/** One line of the inquiry: label left, value right; empty values are left out. */
function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="item">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

interface Props {
  anfrage: Anfrage;
  firmen: readonly Firma[];
  team: readonly string[];
  ich: string | null;
  onUebernehmen(eingabe: { firmaId?: string; firma?: { name: string }; zustaendig: string; dealAnlegen: boolean }): Promise<void>;
  onVerwerfen(): Promise<void>;
}

/** One open inquiry with everything needed to decide: what came in, which firm it fits, what happens on takeover. */
export function AnfrageKarte({ anfrage, firmen, team, ich, onUebernehmen, onVerwerfen }: Props) {
  const treffer = useMemo(() => anfrageDubletten(anfrage, firmen), [anfrage, firmen]);
  const [firmaId, setFirmaId] = useState(treffer[0]?.firma.id ?? '');
  const [name, setName] = useState(anfrageFirmenname(anfrage));
  const [zustaendig, setZustaendig] = useState(ich ?? '');
  const [dealAnlegen, setDealAnlegen] = useState(true);
  const [laeuft, setLaeuft] = useState<'' | 'uebernehmen' | 'verwerfen'>('');
  const [fehler, setFehler] = useState<unknown>(null);

  const fuehre = async (was: 'uebernehmen' | 'verwerfen', aktion: () => Promise<void>) => {
    setLaeuft(was);
    setFehler(null);
    try {
      await aktion();
    } catch (err) {
      setFehler(err);
      setLaeuft('');
    }
  };

  return (
    <Card
      title={
        <>
          {anfrage.name || anfrage.email}
          {anfrage.sprache === 'en' && <span className="badge subtle"> EN</span>}
        </>
      }
      actions={<span className="muted">{formatDateTime(anfrage.eingegangen_am)}</span>}
    >
      <dl className="items">
        <Item label="E-Mail">
          <a href={`mailto:${anfrage.email}`}>{anfrage.email}</a>
        </Item>
        {anfrage.shop && (
          <Item label="Shop">
            <a href={anfrage.shop} target="_blank" rel="noreferrer">
              {anfrage.shop}
            </a>
          </Item>
        )}
        {anfrage.themen && <Item label="Themen">{anfrage.themen}</Item>}
      </dl>
      {anfrage.nachricht && <p className="notiz">{anfrage.nachricht}</p>}

      <div className="grid">
        <Field label="Firma" hint={treffer.length > 0 ? 'Sieht aus wie eine Firma, die schon im CRM steht.' : 'Wird neu angelegt.'}>
          <select value={firmaId} onChange={(e) => setFirmaId(e.target.value)}>
            <option value="">Neue Firma anlegen</option>
            {treffer.map((t) => (
              <option key={t.firma.id} value={t.firma.id}>
                {t.firma.name} ({t.gruende.join(', ')})
              </option>
            ))}
            {firmen
              .filter((f) => !treffer.some((t) => t.firma.id === f.id))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
        </Field>
        {!firmaId && (
          <Field label="Name der neuen Firma" hint="Im Formular fragen wir ihn nicht ab – hier korrigieren.">
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <Field label="Zuständig">
          <select value={zustaendig} onChange={(e) => setZustaendig(e.target.value)}>
            <option value="">–</option>
            {team.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pipeline">
          <label className="checkbox">
            <input type="checkbox" checked={dealAnlegen} onChange={(e) => setDealAnlegen(e.target.checked)} />
            Deal in Phase „Neu“ anlegen
          </label>
        </Field>
      </div>

      <FormError error={fehler} />
      <div className="form-actions">
        <button
          type="button"
          className="button primary"
          disabled={laeuft !== ''}
          onClick={() => fuehre('uebernehmen', () => onUebernehmen({ firmaId: firmaId || undefined, firma: firmaId ? undefined : { name }, zustaendig, dealAnlegen }))}
        >
          {laeuft === 'uebernehmen' ? 'Wird übernommen …' : 'Ins CRM übernehmen'}
        </button>
        <button type="button" className="button" disabled={laeuft !== ''} onClick={() => fuehre('verwerfen', onVerwerfen)}>
          Verwerfen
        </button>
      </div>
    </Card>
  );
}

/** An inquiry that is already dealt with – one line, with the way into the firm's file. */
export function ErledigteAnfrage({ anfrage, firma }: { anfrage: Anfrage; firma?: Firma }) {
  return (
    <li>
      <span className="muted">{formatDateTime(anfrage.eingegangen_am)}</span> {anfrage.name || anfrage.email}
      {anfrage.status === 'verworfen' ? (
        <span className="badge subtle"> verworfen</span>
      ) : firma ? (
        <>
          {' → '}
          <Link to={`/crm/firmen/${firma.id}`}>{firma.name}</Link>
        </>
      ) : (
        <span className="badge subtle"> übernommen</span>
      )}
    </li>
  );
}
