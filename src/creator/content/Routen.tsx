import { Route, Routes } from 'react-router-dom';
import { ImBau } from '../ImBau';

/** Pages of the module below its tool path (App.tsx mounts it with "/*"). */
export function ContentRouten() {
  return (
    <Routes>
      <Route index element={<ImBau titel="Content-Plan" punkt="Content-Plan je Kanal (Punkt 7)" />} />
      <Route path="recherche" element={<ImBau titel="Recherche" punkt="Recherche-Assistent (Punkt 8)" />} />
      <Route path="skripte" element={<ImBau titel="Skripte" punkt="Skripte, Titel und Hooks (Punkt 9)" />} />
      <Route path="thumbnails" element={<ImBau titel="Thumbnails" punkt="Thumbnail-Briefings (Punkt 10)" />} />
      <Route path="upload" element={<ImBau titel="Upload-Hygiene" punkt="Upload-Hygiene (Punkte 11, 30)" />} />
    </Routes>
  );
}
