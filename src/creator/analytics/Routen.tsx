import { Route, Routes } from 'react-router-dom';
import { ImBau } from '../ImBau';

/** Pages of the module below its tool path (App.tsx mounts it with "/*"). */
export function AnalyticsRouten() {
  return (
    <Routes>
      <Route index element={<ImBau titel="Analytics" punkt="Übersicht aller Kanäle (Punkte 13, 16)" />} />
      <Route path="videos" element={<ImBau titel="Videos" punkt="Videos mit Werten (Punkt 15)" />} />
      <Route path="merkmale" element={<ImBau titel="Merkmale" punkt="Merkmale je Video (Punkt 17)" />} />
      <Route path="berichte" element={<ImBau titel="Berichte" punkt="Wochen- und Monatsbericht (Punkte 18, 20)" />} />
      <Route path="benchmarking" element={<ImBau titel="Benchmarking" punkt="Wettbewerbs-Benchmarking (Punkt 19)" />} />
      <Route path="twitch" element={<ImBau titel="Twitch" punkt="Twitch-Anbindung und Repurposing (Punkte 12, 14)" />} />
      <Route path="kanaele" element={<ImBau titel="Kanäle" punkt="Anbindung der Kanäle (Punkt 13)" />} />
    </Routes>
  );
}
