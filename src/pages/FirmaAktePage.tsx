import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AuditKarte } from '../audit/AuditKarte';
import { DealsKarte, KontakteKarte, VerlaufKarte, WiedervorlagenKarte } from '../components/akte/AkteKarten';
import { DriveKarte, TermineKarte } from '../components/akte/GoogleKarten';
import { offenerLogin } from '../config';
import { usePhaseChange } from '../components/dialogs/PhaseChange';
import { brancheLabel } from '../data/branchen';
import { TagListe } from '../components/TagFilter';
import { FirmaForm } from '../components/FirmaForm';
import { useToast } from '../components/Toasts';
import { AuchOffen, useAnwesenheit } from '../components/Praesenz';
import { Card, ErrorBox, Loading, PageHeader, StatusBadge, TierBadge } from '../components/ui';
import { EOL_LABEL } from '../data/constants';
import { findeDubletten } from '../data/dubletten';
import { useCrm } from '../data/CrmContext';
import type { Firma, FirmaInput } from '../data/types';
import { faelligText, formatDateTime, formatEuro, relativeDays, shortUser, websiteUrl } from '../lib/format';
import { isoDate } from '../data/ids';
import { offeneDeals } from '../data/selectors';
import { useIch } from '../lib/useIch';
import { MitErwaehnungen } from '../components/Erwaehnungen';

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

function DublettenHinweis({ firma, alle }: { firma: Firma; alle: readonly Firma[] }) {
  if (firma.archiviert) return null;
  const treffer = findeDubletten(firma, alle).filter((t) => !t.firma.archiviert);
  if (treffer.length === 0) return null;
  return (
    <div className="hint-box warn">
      <strong>Mögliche Dublette:</strong>
      <ul className="dubletten-liste">
        {treffer.map((t) => (
          <li key={t.firma.id}>
            <Link to={`/crm/firmen/${t.firma.id}`}>
              {t.firma.name}
              {t.firma.domain && ` (${t.firma.domain})`}
            </Link>{' '}
            – {t.gruende.join(', ')}
          </li>
        ))}
      </ul>
      <p className="small">Ist es dieselbe Firma, eine davon archivieren und die zweite Domain in der Notiz vermerken. Der Hinweis verschwindet dann.</p>
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
  const offen = db?.firmen.find((firma) => firma.id === id);
  useAnwesenheit(offen ? { art: 'firma', id: offen.id, titel: offen.name } : null);

  if (!db) {
    return <div className="page">{error ? <ErrorBox error={error} onRetry={refresh} /> : <Loading />}</div>;
  }
  const f = db.firmen.find((firma) => firma.id === id);
  if (!f) {
    return (
      <div className="page">
        <PageHeader eyebrow="Firmen" title="Firma nicht gefunden" />
        <p>
          Diese Firma gibt es nicht (mehr). <Link to="/crm/firmen">Zur Firmenliste</Link>
        </p>
        {loading && <Loading />}
      </div>
    );
  }

  if (editing) {
    return (
      <div className="page narrow">
        <PageHeader eyebrow="Firma bearbeiten" title={f.name} />
        <AuchOffen art="firma" id={f.id} />
        <FirmaForm
          initial={toInput(f)}
          listen={db.listen}
          alleFirmen={db.firmen}
          selfId={f.id}
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

  const offeneDealsFirma = offeneDeals(db.deals.filter((d) => d.firma_id === f.id));
  const naechste = db.wiedervorlagen
    .filter((w) => w.firma_id === f.id && !w.erledigt_am)
    .sort((x, y) => x.faellig_am.localeCompare(y.faellig_am))[0];
  const letzte = db.aktivitaeten.filter((x) => x.firma_id === f.id).sort((x, y) => y.datum.localeCompare(x.datum))[0];
  const heute = isoDate(new Date());

  return (
    <div className="page wide">
      <PageHeader
        zahlen={[
          { wert: offeneDealsFirma.length, label: offeneDealsFirma.length === 1 ? 'offener Deal' : 'offene Deals' },
          { wert: formatEuro(offeneDealsFirma.reduce((sum, d) => sum + (d.wert_eur ?? 0), 0)), label: 'offener Wert' },
          { wert: naechste ? faelligText(naechste.faellig_am, heute) : '–', label: naechste ? `Wiedervorlage: ${naechste.titel}` : 'keine Wiedervorlage', warn: Boolean(naechste && naechste.faellig_am < heute) },
          { wert: letzte ? relativeDays(letzte.datum) : '–', label: 'letzter Eintrag im Verlauf' },
        ]}
        ueberlappen
        eyebrow={
          <nav aria-label="Pfad">
            <Link to="/crm/firmen">Firmen</Link>
          </nav>
        }
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
            {!f.archiviert && (
              <Link to={`/contact?firma=${f.id}`} className="button">
                Anschreiben
              </Link>
            )}
            <button type="button" className="button primary" onClick={() => setEditing(true)} disabled={f.archiviert}>
              Bearbeiten
            </button>
          </>
        }
      />

      <AuchOffen art="firma" id={f.id} />
      <DublettenHinweis firma={f} alle={db.firmen} />

      <div className="akte">
        <div className="akte-main">
          <DealsKarte firma={f} db={db} ich={ich} requestPhase={phaseChange.request} />
          <WiedervorlagenKarte firma={f} db={db} ich={ich} />
          <VerlaufKarte firma={f} db={db} />
        </div>
        <div className="akte-side">
          <KontakteKarte firma={f} db={db} />
          <AuditKarte firma={f} />
          {/* Appointments and folders live in Google; tenants sign in without calendar and Drive. */}
          {!offenerLogin && <TermineKarte firma={f} db={db} />}
          {!offenerLogin && <DriveKarte firma={f} db={db} />}
          <Card title="Firmendaten">
            <dl className="items">
              <Item label="Zuständig">{f.zustaendig}</Item>
              <Item label="E-Mail">{f.email_allgemein && <a href={`mailto:${f.email_allgemein}`}>{f.email_allgemein}</a>}</Item>
              <Item label="Telefon">{f.telefon_allgemein && <a href={`tel:${f.telefon_allgemein.replace(/[^\d+]/g, '')}`}>{f.telefon_allgemein}</a>}</Item>
              <Item label="Ort">{f.ort}</Item>
              <Item label="Register">{f.register}</Item>
              <Item label="USt-ID">{f.ust_id}</Item>
              <Item label="Slack">{f.slack_channel && `#${f.slack_channel}`}</Item>
            </dl>
          </Card>
          <Card title="Einordnung">
            <dl className="items">
              <Item label="Score">{f.score}</Item>
              <Item label="Branche">{brancheLabel(f.branche)}</Item>
              <Item label="Tags">{f.tags && <TagListe tags={f.tags} />}</Item>
              <Item label="Quelle">{f.quelle}</Item>
              <Item label="Plattform">{[f.plattform, f.version].filter(Boolean).join(' ')}</Item>
              <Item label="Support">{f.eol && (EOL_LABEL[f.eol] ?? f.eol)}</Item>
              <Item label="Technik">{f.tech_info}</Item>
            </dl>
          </Card>
          {f.notiz && (
            <Card title="Notiz">
              <p className="notiz">
                <MitErwaehnungen text={f.notiz} team={db.listen.team ?? []} />
              </p>
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
