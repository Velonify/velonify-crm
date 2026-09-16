import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { FirmaForm } from '../components/FirmaForm';
import { ErrorBox, Loading, PageHeader, StatusBadge, TierBadge } from '../components/ui';
import { AuthExpiredError, NotFoundError } from '../data/errors';
import { useRepository } from '../data/RepositoryContext';
import type { Firma, FirmaInput } from '../data/types';
import { errorMessage } from '../lib/errors';
import { driveFolderUrl, EOL_LABEL, formatDateTime, shortUser, websiteUrl } from '../lib/format';
import { useLoad } from '../lib/useLoad';

function toInput({ id: _id, archiviert: _a, erstellt_am: _ea, erstellt_von: _ev, geaendert_am: _ga, geaendert_von: _gv, ...input }: Firma): FirmaInput {
  return input;
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  const empty = children === '' || children === null || children === undefined;
  return (
    <div className="item">
      <dt>{label}</dt>
      <dd>{empty ? <span className="muted">–</span> : children}</dd>
    </div>
  );
}

export function FirmaAktePage() {
  const { id = '' } = useParams();
  const { repository } = useRepository();
  const { expire } = useAuth();
  const navigate = useNavigate();
  const firma = useLoad(() => repository.getFirma(id), [repository, id]);
  const listen = useLoad(() => repository.getListen(), [repository]);
  const [editing, setEditing] = useState(false);
  const [archiveError, setArchiveError] = useState<unknown>();
  const [archiving, setArchiving] = useState(false);

  if (firma.loading && !firma.data) return <div className="page"><Loading /></div>;
  if (firma.error instanceof NotFoundError) {
    return (
      <div className="page">
        <PageHeader title="Firma nicht gefunden" />
        <p>Diese Firma gibt es nicht (mehr). <Link to="/firmen">Zur Firmenliste</Link></p>
      </div>
    );
  }
  if (firma.error || !firma.data) return <div className="page"><ErrorBox error={firma.error} onRetry={firma.reload} /></div>;

  const f = firma.data;

  const toggleArchive = async () => {
    const question = f.archiviert
      ? `„${f.name}“ wiederherstellen?`
      : `„${f.name}“ archivieren?\n\nDie Firma verschwindet aus der Liste, bleibt aber im Sheet erhalten und kann jederzeit wiederhergestellt werden.`;
    if (!window.confirm(question)) return;
    setArchiving(true);
    setArchiveError(undefined);
    try {
      firma.setData(await repository.setFirmaArchiviert(f.id, !f.archiviert, f.geaendert_am));
    } catch (err) {
      if (err instanceof AuthExpiredError) expire();
      setArchiveError(err);
    } finally {
      setArchiving(false);
    }
  };

  if (editing && listen.data) {
    return (
      <div className="page narrow">
        <PageHeader title={`${f.name} bearbeiten`} />
        <FirmaForm
          initial={toInput(f)}
          listen={listen.data}
          submitLabel="Speichern"
          onCancel={() => setEditing(false)}
          onReload={() => {
            setEditing(false);
            firma.reload();
          }}
          onSubmit={async (values) => {
            firma.setData(await repository.updateFirma(f.id, values, f.geaendert_am));
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <nav className="breadcrumb">
        <Link to="/firmen">Firmen</Link> <span aria-hidden="true">/</span> {f.name}
      </nav>
      <PageHeader
        title={f.name}
        subtitle={
          <span className="badges">
            <StatusBadge status={f.status} />
            {f.tier && <TierBadge tier={f.tier} />}
            {f.kuerzel && <span className="kuerzel">{f.kuerzel}</span>}
            {f.archiviert && <span className="badge archived">Archiviert</span>}
            {f.domain && (
              <a href={websiteUrl(f.domain)} target="_blank" rel="noreferrer noopener">
                {f.domain} ↗
              </a>
            )}
          </span>
        }
        actions={
          <>
            <button type="button" className="button" onClick={toggleArchive} disabled={archiving}>
              {f.archiviert ? 'Wiederherstellen' : 'Archivieren'}
            </button>
            <button type="button" className="button primary" onClick={() => setEditing(true)} disabled={!listen.data || f.archiviert}>
              Bearbeiten
            </button>
          </>
        }
      />
      {archiveError !== undefined && (
        <div className="alert error" role="alert">
          <span>{errorMessage(archiveError)}</span>
          <button type="button" className="button small" onClick={firma.reload}>
            Neu laden
          </button>
        </div>
      )}

      <div className="akte">
        <section className="card">
          <h2>Einordnung</h2>
          <dl className="items">
            <Item label="Zuständig">{f.zustaendig}</Item>
            <Item label="Score">{f.score}</Item>
            <Item label="Quelle">{f.quelle}</Item>
            <Item label="Plattform">{[f.plattform, f.version].filter(Boolean).join(' ')}</Item>
            <Item label="Support-Status">{f.eol ? (EOL_LABEL[f.eol] ?? f.eol) : ''}</Item>
            <Item label="Technik">{f.tech_info}</Item>
          </dl>
        </section>

        <section className="card">
          <h2>Firmendaten</h2>
          <dl className="items">
            <Item label="E-Mail">{f.email_allgemein && <a href={`mailto:${f.email_allgemein}`}>{f.email_allgemein}</a>}</Item>
            <Item label="Telefon">{f.telefon_allgemein && <a href={`tel:${f.telefon_allgemein.replace(/[^\d+]/g, '')}`}>{f.telefon_allgemein}</a>}</Item>
            <Item label="Ort">{f.ort}</Item>
            <Item label="Handelsregister">{f.register}</Item>
            <Item label="USt-ID">{f.ust_id}</Item>
          </dl>
        </section>

        <section className="card">
          <h2>Verknüpfungen</h2>
          <dl className="items">
            <Item label="Drive-Ordner">
              {f.drive_ordner_id && (
                <a href={driveFolderUrl(f.drive_ordner_id)} target="_blank" rel="noreferrer noopener">
                  Ordner öffnen ↗
                </a>
              )}
            </Item>
            <Item label="Slack">{f.slack_channel && `#${f.slack_channel}`}</Item>
            <Item label="Trello">
              {f.trello_url && (
                <a href={f.trello_url} target="_blank" rel="noreferrer noopener">
                  Board öffnen ↗
                </a>
              )}
            </Item>
          </dl>
        </section>

        <section className="card">
          <h2>Notiz</h2>
          {f.notiz ? <p className="notiz">{f.notiz}</p> : <p className="muted">Keine Notiz.</p>}
        </section>

        <section className="card later">
          <h2>Kontakte, Deals &amp; Verlauf</h2>
          <p className="muted">Kommt in Schritt 2 und 3: Ansprechpartner, Deals mit Angebotswert, Aktivitäten und Wiedervorlagen.</p>
        </section>
      </div>

      <p className="meta">
        Angelegt {formatDateTime(f.erstellt_am)} von {shortUser(f.erstellt_von)} · Zuletzt geändert {formatDateTime(f.geaendert_am)} von{' '}
        {shortUser(f.geaendert_von)} · <span title="Interne ID">{f.id}</span>
      </p>
      <button type="button" className="link-button back" onClick={() => navigate(-1)}>
        ← Zurück
      </button>
    </div>
  );
}
