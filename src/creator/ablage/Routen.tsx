import { Route, Routes } from 'react-router-dom';
import { ImBau } from '../ImBau';

/** Pages of the module below its tool path (App.tsx mounts it with "/*"). */
export function AblageRouten() {
  return (
    <Routes>
      <Route index element={<ImBau titel="Ablage" punkt="Feste Ablagestruktur in Google Drive (Punkte 3, 27)" />} />
    </Routes>
  );
}
