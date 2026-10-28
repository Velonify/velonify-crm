import { Route, Routes } from 'react-router-dom';
import { ImBau } from '../ImBau';

/** Pages of the module below its tool path (App.tsx mounts it with "/*"). */
export function KooperationenRouten() {
  return (
    <Routes>
      <Route index element={<ImBau titel="Kooperationen" punkt="Interne Kooperations-Übersicht (Punkt 21)" />} />
      <Route path="pipeline" element={<ImBau titel="Pipeline" punkt="Kooperations-Pipeline (Punkt 22)" />} />
      <Route path="anfragen" element={<ImBau titel="Anfragen" punkt="Anfrageformular (Punkt 23)" />} />
      <Route path="mediakit" element={<ImBau titel="Mediakit" punkt="Live-Mediakit (Punkt 24)" />} />
      <Route path="reportings" element={<ImBau titel="Reportings" punkt="Partner-Reporting (Punkt 25)" />} />
    </Routes>
  );
}
