import { useCallback, useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { ErrorBox, Loading, PageHeader } from '../../components/ui';
import { darfEinrichten } from '../../data/instanz';
import { useCreatorApi, useInstanz } from '../api';
import type { AblageOrdner } from './typen';
import '../kalender/kalender.css';

function AblageSeite() {
  const api = useCreatorApi(); const instanz = useInstanz();
  const [ordner, setOrdner] = useState<AblageOrdner[]>([]); const [laedt, setLaedt] = useState(true); const [fehler, setFehler] = useState<unknown>(null);
  const laden = useCallback(async () => {
    setLaedt(true); setFehler(null);
    try { setOrdner((await api.get<{ ordner: AblageOrdner[] }>('/c/ablage')).ordner); }
    catch (e) { setFehler(e); } finally { setLaedt(false); }
  }, [api]);
  useEffect(() => { void laden(); }, [laden]);
  return <><PageHeader title="Ablage" subtitle="Rohmaterial, Schnitt und gemeinsame Unterlagen in Google Drive." actions={darfEinrichten(instanz.rolle) && <Link className="button" to="/einrichtung">Ablage einrichten</Link>} /><div className="page organisation-page">{fehler != null && <ErrorBox error={fehler} onRetry={() => void laden()} />}{laedt ? <Loading /> : <><p className="muted">Die Dateien öffnen sich in Google Drive. Dort gelten die Freigaben deines Google-Kontos.</p>{!ordner.length ? <p>Noch keine Ordner verknüpft. Bitte einen Admin um die Einrichtung bitten.</p> : <div className="organisation-table"><table className="table compact"><thead><tr><th>Bereich</th><th>Ordner</th><th>Verknüpfung</th></tr></thead><tbody>{ordner.map(o => <tr key={o.schluessel}><td>{o.schluessel.split('/').join(' / ')}</td><td>{o.name}</td><td>{o.bereit ? <a href={o.url} target="_blank" rel="noreferrer">In Google Drive öffnen</a> : <span className="muted">Anlage noch nicht abgeschlossen</span>}</td></tr>)}</tbody></table></div>}</>}</div></>;
}
export function AblageRouten() { return <Routes><Route index element={<AblageSeite />} /></Routes>; }
