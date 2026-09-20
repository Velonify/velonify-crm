import { Link } from 'react-router-dom';
import { Card } from '../components/ui';
import { istOffen, sortiereAnfragen } from '../data/eingang';
import { SchemaError } from '../data/errors';
import { formatDateTime } from '../lib/format';
import { useEingang } from './useEingang';

const MAX = 3;

/**
 * Open website inquiries on a start page – the inbox is only worth something if it is seen.
 * `ziel` is the inbox of the tool the card sits in, so nobody is thrown into another tool by a click.
 */
export function AnfragenKarte({ ziel = '/anfragen' }: { ziel?: string }) {
  const { data, error } = useEingang();
  // Before the tab is set up there is nothing to show, and the start page should not complain about it.
  if (error instanceof SchemaError || !data) return null;

  const offen = sortiereAnfragen(data).filter(istOffen);
  if (offen.length === 0) return null;

  return (
    <Card
      title={`Anfragen (${offen.length})`}
      actions={
        <Link to={ziel} className="button small">
          Öffnen
        </Link>
      }
    >
      <ul className="anfragen-erledigt">
        {offen.slice(0, MAX).map((anfrage) => (
          <li key={anfrage.id}>
            <Link to={ziel}>{anfrage.name || anfrage.email}</Link>
            {anfrage.themen && <> · {anfrage.themen}</>} <span className="muted">{formatDateTime(anfrage.eingegangen_am)}</span>
          </li>
        ))}
        {offen.length > MAX && <li className="muted">und {offen.length - MAX} weitere</li>}
      </ul>
    </Card>
  );
}
