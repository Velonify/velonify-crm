import { Route, Routes } from 'react-router-dom';
import { ImBau } from '../ImBau';

/** Pages of the module below its tool path (App.tsx mounts it with "/*"). */
export function EinnahmenRouten() {
  return (
    <Routes>
      <Route index element={<ImBau titel="Einnahmen" punkt="Einnahmen-Übersicht, EUR/JPY, Dashboards (Punkte 26–28)" />} />
    </Routes>
  );
}
