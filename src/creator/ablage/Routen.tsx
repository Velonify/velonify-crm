import { Link, Route, Routes } from 'react-router-dom';
import { PageHeader } from '../../components/ui';
import { darfEinrichten } from '../../data/instanz';
import { useInstanz } from '../api';
import { Explorer } from './Explorer';
import '../kalender/kalender.css';

function AblageSeite() {
  const instanz = useInstanz();
  return <><PageHeader title="Ablage" subtitle="Rohmaterial, Schnitt und gemeinsame Unterlagen in eurer Google Drive." actions={darfEinrichten(instanz.rolle) && <Link className="button" to="/einrichtung">Ablage einrichten</Link>} /><div className="page organisation-page"><Explorer /></div></>;
}
export function AblageRouten() { return <Routes><Route index element={<AblageSeite />} /></Routes>; }
