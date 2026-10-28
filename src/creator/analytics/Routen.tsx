import { Route, Routes } from 'react-router-dom';
import { Bereich } from '../content/gemeinsam';
import { AnalyticsBenchmark } from './Benchmark';
import { AnalyticsBericht, AnalyticsBerichte } from './Berichte';
import { AnalyticsKanaele, AnalyticsTwitch } from './Kanaele';
import { AnalyticsMerkmale } from './Merkmale';
import { AnalyticsUebersicht, AnalyticsVideos } from './Uebersicht';
import './analytics.css';

/** Pages of the module below /analytics (App.tsx mounts it with "/*"); each page needs its building block. */
export function AnalyticsRouten() {
  return (
    <Routes>
      <Route index element={<Bereich id="kanaele" titel="Analytics"><AnalyticsUebersicht /></Bereich>} />
      <Route path="videos" element={<Bereich id="kanaele" titel="Videos"><AnalyticsVideos /></Bereich>} />
      <Route path="kanaele" element={<Bereich id="kanaele" titel="Kanäle"><AnalyticsKanaele /></Bereich>} />
      <Route path="merkmale" element={<Bereich id="merkmale" titel="Merkmale"><AnalyticsMerkmale /></Bereich>} />
      <Route path="berichte" element={<Bereich id="berichte" titel="Berichte"><AnalyticsBerichte /></Bereich>} />
      <Route path="berichte/:id" element={<Bereich id="berichte" titel="Bericht"><AnalyticsBericht /></Bereich>} />
      <Route path="benchmarking" element={<Bereich id="benchmarking" titel="Benchmarking"><AnalyticsBenchmark /></Bereich>} />
      <Route path="twitch" element={<Bereich id="twitch" titel="Twitch"><AnalyticsTwitch /></Bereich>} />
    </Routes>
  );
}
