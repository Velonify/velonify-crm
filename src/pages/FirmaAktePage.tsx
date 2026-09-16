import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DealsKarte, KontakteKarte, VerlaufKarte, WiedervorlagenKarte } from '../components/akte/AkteKarten';
import { DriveKarte, TermineKarte } from '../components/akte/GoogleKarten';
import { usePhaseChange } from '../components/dialogs/PhaseChange';
import { FirmaForm } from '../components/FirmaForm';
import { useToast } from '../components/Toasts';
import { Card, ErrorBox, Loading, PageHeader, StatusBadge, TierBadge } from '../components/ui';
import { EOL_LABEL } from '../data/constants';
import { useCrm } from '../data/CrmContext';
import type { Firma, FirmaInput } from '../data/types';
import { formatDateTime, shortUser, websiteUrl } from '../lib/format';
import { useIch } from '../lib/useIch';

function toInput({ id: _id, archiviert: _a, erstellt_am: _ea, erstellt_von: _ev, geaendert_am: _ga, geaendert_von: _gv, ...input }: Firma): FirmaInput {
  return input;
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  const empty = children === '' || children === null || children === undefined || children === false;
  return (
    <div className="item">
      <dt>{label}</dt>
      <dd>{empty ? <span className="muted">–</span> : children}</dd>
    </div>
  );
}

export function FirmaAktePage() {
  const { id = '' } = useParams();
  const { db, loading, error, refresh, mutate, perform } = useCrm();
  const toast = useToast();
  const [ich] = useIch(db?.listen.team ?? []);
  const [editing, setEditing] = useState(false);
  const phaseChange = usePhaseChange();

  if (!db) {
    return <div className="page">{error ? <ErrorBox error={error} onRetry={refresh} /> : <Loading />}</div>;
  }
  const f = db.firmen.find((firma) => firma.id === id);
  if (!f) {
    return (
      <div className="page">
        <PageHeader title="Firma nicht gefunden" />
        <p>
          Diese Firma gibt es nicht (mehr). <Link to="/firmen">Zur Firmenliste</Link>
        </p>
        {loading && <Loading />}
      </div>
    );
  }

  if (editing) {
    return (
      <div className="page narrow">
        <PageHeader title={`${f.name} bearbeiten`} />
        <FirmaForm
          initial={toInput(f)}
          listen={db.listen}
          submitLabel="Speichern"
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            await mutate((s) => s.updateFirma(f.id, values, f.geaendert_am));
            toast.show('Firma gespeichert');
            setEditing(false);
          }}
        />
      </div>
    );
  }

  const toggleArchive = () => {
    const frage = f.archiviert
      ? `„${f.name}“ wiederherstellen?`
      : `„${f.name}“ archivieren?\n\nDie Firma verschwindet aus Listen, Pipeline und „Mein Tag“, bleibt aber im Sheet erhalten.`;
    if (window.confirm(frage)) {
      void perform((s) => s.setFirmaArchiviert(f.id, !f.archiviert, f.geaendert_am), f.archiviert ? 'Wiederhergestellt' : 'Archiviert');
    }
  };

  return (
    <div className="page wide">
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
            <button type="button" className="button" onClick={toggleArchive}>
              {f.archiviert ? 'Wiederherstellen' : 'Archivieren'}
            </button>
            <button type="button" className="button primary" onClick={() => setEditing(true)} disabled={f.archiviert}>
              Bearbeiten
            </button>
          </>
        }
      />

      <div className="akte">
        <div className="akte-main">
          <DealsKarte firma={f} db={db} ich={ich} requestPhase={phaseChange.request} />
          <WiedervorlagenKarte firma={f} db={db} ich={ich} />
          <VerlaufKarte firma={f} db={db} />
        </div>
        <div className="akte-side">
          <KontakteKarte firma={f} db={db} />
          <TermineKarte firma={f} db={db} />
          <DriveKarte firma={f} db={db} />
          <Card title="Firmendaten">
            <dl className="items">
              <Item label="Zuständig">{f.zustaendig}</Item>
              <Item label="E-Mail">{f.email_allgemein && <a href={`mailto:${f.email_allgemein}`}>{f.email_allgemein}</a>}</Item>
              <Item label="Telefon">{f.telefon_allgemein && <a href={`tel:${f.telefon_allgemein.replace(/[^\d+]/g, '')}`}>{f.telefon_allgemein}</a>}</Item>
              <Item label="Ort">{f.ort}</Item>
              <Item label="Register">{f.register}</Item>
              <Item label="USt-ID">{f.ust_id}</Item>
              <Item label="Slack">{f.slack_channel && `#${f.slack_channel}`}</Item>
              <Item label="Trello">
                {f.trello_url && (
                  <a href={f.trello_url} target="_blank" rel="noreferrer noopener">
                    Board öffnen ↗
                  </a>
                )}
              </Item>
            </dl>
          </Card>
          <Card title="Einordnung">
            <dl className="items">
              <Item label="Score">{f.score}</Item>
              <Item label="Quelle">{f.quelle}</Item>
              <Item label="Plattform">{[f.plattform, f.version].filter(Boolean).join(' ')}</Item>
              <Item label="Support">{f.eol && (EOL_LABEL[f.eol] ?? f.eol)}</Item>
              <Item label="Technik">{f.tech_info}</Item>
            </dl>
          </Card>
          {f.notiz && (
            <Card title="Notiz">
              <p className="notiz">{f.notiz}</p>
            </Card>
          )}
        </div>
      </div>

      <p className="meta">
        Angelegt {formatDateTime(f.erstellt_am)} von {shortUser(f.erstellt_von)} · Zuletzt geändert {formatDateTime(f.geaendert_am)} von{' '}
        {shortUser(f.geaendert_von)} · <span title="Interne ID">{f.id}</span>
      </p>
      {phaseChange.element}
    </div>
  );
}
