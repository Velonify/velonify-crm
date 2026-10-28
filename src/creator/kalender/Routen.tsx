import { Route, Routes } from 'react-router-dom';
import { ImBau } from '../ImBau';

/** Pages of the module below its tool path (App.tsx mounts it with "/*"). */
export function KalenderRouten() {
  return (
    <Routes>
      <Route index element={<ImBau titel="Kalender" punkt="Kalender mit Fristen (Punkte 2, 27, 29)" />} />
    </Routes>
  );
}
