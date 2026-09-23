import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toasts';
import { useCrm } from '../data/CrmContext';
import { ANLASS_BEREICH, ANLASS_LABEL, AUSSCHLUSS_LABEL, BEREICHE, type Bereich, type LeadFinderApi } from '../data/leadFinder';
import { useIch } from '../lib/useIch';
import { useUebernahme, type StartPhase, type UebernahmeErgebnis, type Ziel } from './useLeadFinder';

export function Item({ label, children }: { label: string; children: ReactNode }) {
  const leer = children === '' || children === null || children === undefined || children === false;
  return (
    <div className="item">
      <dt>{label}</dt>
      <dd>{leer ? <span className="muted">–</span> : children}</dd>
    </div>
  );
}

/** Strong reasons (end of support) in red, time-bound ones in amber, the rest neutral. */
const ANLASS_KLASSE: Record<string, string> = {
  system_ohne_support: 'schwere-hoch', support_endet: 'schwere-mittel', langsam: 'schwere-mittel',
  ads_aktiv: 'schwere-hoch', klaviyo_wechsel: 'schwere-hoch', klaviyo_ausbau: 'schwere-mittel', ads_ungenutzt: 'schwere-mittel', kein_email_tool: 'schwere-mittel',
};

/** Tools as small neutral badges, e.g. the ad pixels of a shop. */
export function ToolBadges({ tools, gtm }: { tools: string[] | null | undefined; gtm?: boolean }) {
  const liste = [...(tools ?? []), ...(gtm ? ['GTM'] : [])];
  if (liste.length === 0) return <span className="muted">–</span>;
  return (
    <span className="lead-badges">
      {liste.map((t) => (
        <span key={t} className={`badge ${t === 'GTM' ? 'subtle' : 'schwere-hinweis'}`}>
          {t}
        </span>
      ))}
    </span>
  );
}

export const anlassBereich = (id: string): Bereich => ANLASS_BEREICH[id] ?? 'migration';

export function AnlassBadges({ anlaesse }: { anlaesse: string[] }) {
  return (
    <span className="lead-badges">
      {anlaesse.map((a) => (
        <span key={a} className={`badge ${ANLASS_KLASSE[a] ?? 'schwere-hinweis'}`}>
          {ANLASS_LABEL[a] ?? a}
        </span>
      ))}
    </span>
  );
}

export function AusschlussBadges({ ausschluss }: { ausschluss: string[] }) {
  return (
    <span className="lead-badges">
      {ausschluss.map((a) => (
        <span key={a} className="badge schwere-hinweis">
          {AUSSCHLUSS_LABEL[a] ?? a}
        </span>
      ))}
    </span>
  );
}

const ABLEHNGRUENDE = ['Zu klein', 'Passt nicht zu uns', 'Schon im Gespräch oder Kunde', 'Firma nicht mehr aktiv', 'Daten falsch erkannt'];

type Offen = null | { art: 'uebernehmen'; ziel: Ziel } | { art: 'ablehnen' };

/**
 * The four decisions for a selection of backlog shops: into the pipeline (firm + deal), only into the firm list,
 * reject for good, or postpone for three months.
 */
export function EntscheidungsLeiste({ api, domains, bereich, onErledigt, disabled }: { api: LeadFinderApi | null; domains: string[]; bereich: Bereich; onErledigt: (entschieden: string[]) => void; disabled?: boolean }) {
  const deal = BEREICHE.find((b) => b.id === bereich)?.deal ?? '';
  const { db } = useCrm();
  const toast = useToast();
  const uebernehmen = useUebernahme(api);
  const team = db?.listen.team ?? [];
  const [ich] = useIch(team);
  const [offen, setOffen] = useState<Offen>(null);
  const [zustaendig, setZustaendig] = useState('');
  const [phase, setPhase] = useState<StartPhase>('neu');
  const [grund, setGrund] = useState(ABLEHNGRUENDE[0]);
  const [freitext, setFreitext] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');
  const [ergebnis, setErgebnis] = useState<(UebernahmeErgebnis & { phase: StartPhase }) | null>(null);

  const n = domains.length;
  const oeffne = (o: Offen) => {
    setFehler('');
    setZustaendig(ich ?? '');
    setOffen(o);
  };

  const ausfuehren = async () => {
    if (!offen || !api) return;
    setBusy(true);
    setFehler('');
    try {
      if (offen.art === 'uebernehmen') {
        const e = await uebernehmen(domains, offen.ziel, zustaendig, bereich, phase);
        setErgebnis({ ...e, phase });
        const dubletten = new Set(e.dubletten.map((d) => d.domain));
        onErledigt(domains.filter((d) => !dubletten.has(d)));
        toast.show(offen.ziel === 'pipeline' ? `${e.neu + e.ergaenzt} in die Pipeline übernommen` : `${e.neu + e.ergaenzt} in die Firmenübersicht übernommen`);
      } else {
        const text = grund === 'Sonstiges' ? freitext.trim() : grund;
        await api.entscheide(domains.map((domain) => ({ domain, entscheidung: 'abgelehnt', grund: text })));
        onErledigt(domains);
        toast.show(`${n} abgelehnt`);
      }
      setOffen(null);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const zurueckstellen = async () => {
    if (!api) return;
    setBusy(true);
    try {
      await api.entscheide(domains.map((domain) => ({ domain, entscheidung: 'zurueckgestellt' })));
      onErledigt(domains);
      toast.show(`${n} für 3 Monate zurückgestellt`);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const aus = disabled || busy || n === 0 || !api;
  return (
    <>
      <div className="lead-aktionen">
        <button type="button" className="button primary" disabled={aus} onClick={() => oeffne({ art: 'uebernehmen', ziel: 'pipeline' })}>
          In Pipeline{n > 1 ? ` (${n})` : ''}
        </button>
        <button type="button" className="button" disabled={aus} onClick={() => oeffne({ art: 'uebernehmen', ziel: 'firma' })}>
          Nur Firmenübersicht
        </button>
        <button type="button" className="button" disabled={aus} onClick={() => void zurueckstellen()} title="Verschwindet für 3 Monate aus dem Backlog">
          Zurückstellen
        </button>
        <button type="button" className="button" disabled={aus} onClick={() => oeffne({ art: 'ablehnen' })}>
          Ablehnen
        </button>
      </div>

      {ergebnis && (
        <div className={`hint-box ${ergebnis.dubletten.length ? 'warn' : 'success'}`} role="status">
          {ergebnis.neu} neu angelegt{ergebnis.ergaenzt > 0 && `, ${ergebnis.ergaenzt} schon vorhandene ergänzt`}
          {ergebnis.deals > 0 && `, ${ergebnis.deals} Deals in Phase „${ergebnis.phase === 'qualifiziert' ? 'Qualifiziert' : 'Neu'}“`}. <Link to="/crm/pipeline">Zur Pipeline</Link> · <Link to="/crm/firmen?status=lead">Zu den Firmen</Link>
          {ergebnis.dubletten.length > 0 && (
            <ul className="small">
              {ergebnis.dubletten.map((d) => (
                <li key={d.domain}>
                  {d.domain}: {d.hinweis}. Bleibt im Backlog.
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="button small" onClick={() => setErgebnis(null)}>
            Ausblenden
          </button>
        </div>
      )}

      {offen?.art === 'uebernehmen' && (
        <Dialog
          title={offen.ziel === 'pipeline' ? `${n === 1 ? 'Shop' : `${n} Shops`} in die Pipeline` : `${n === 1 ? 'Shop' : `${n} Shops`} in die Firmenübersicht`}
          onClose={() => setOffen(null)}
          onSubmit={ausfuehren}
          submitLabel="Übernehmen"
          busy={busy}
        >
          <p>
            {offen.ziel === 'pipeline'
              ? `Legt je Shop eine Firma (Lead) mit Geschäftsführung als Ansprechpartner und einen Deal „${deal}“ in der gewählten Phase an.`
              : 'Legt je Shop eine Firma (Lead) mit Geschäftsführung als Ansprechpartner an, ohne Deal.'}{' '}
            Firmen, die es schon gibt, werden nicht überschrieben, nur leere Felder ergänzt. Mögliche Dubletten bleiben im Backlog.
          </p>
          {offen.ziel === 'pipeline' && (
            <label className="field">
              <span className="field-label">Phase</span>
              <select value={phase} onChange={(e) => setPhase(e.target.value as StartPhase)}>
                <option value="neu">Neu</option>
                <option value="qualifiziert">Qualifiziert</option>
              </select>
            </label>
          )}
          <label className="field">
            <span className="field-label">Zuständig</span>
            <select value={zustaendig} onChange={(e) => setZustaendig(e.target.value)}>
              <option value="">Niemand</option>
              {team.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {fehler && <p className="alert error">{fehler}</p>}
        </Dialog>
      )}

      {offen?.art === 'ablehnen' && (
        <Dialog title={`${n === 1 ? 'Shop' : `${n} Shops`} ablehnen`} onClose={() => setOffen(null)} onSubmit={ausfuehren} submitLabel="Ablehnen" busy={busy}>
          <p>Abgelehnte Shops kommen nicht wieder in den Backlog, auch nicht bei späteren Prüfungen.</p>
          <label className="field">
            <span className="field-label">Grund</span>
            <select value={grund} onChange={(e) => setGrund(e.target.value)}>
              {[...ABLEHNGRUENDE, 'Sonstiges'].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          {grund === 'Sonstiges' && (
            <label className="field">
              <span className="field-label">Welcher?</span>
              <input value={freitext} onChange={(e) => setFreitext(e.target.value)} maxLength={500} required />
            </label>
          )}
          {fehler && <p className="alert error">{fehler}</p>}
        </Dialog>
      )}
    </>
  );
}
