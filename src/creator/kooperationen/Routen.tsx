import { Route, Routes } from 'react-router-dom';
import { Uebersicht } from './Uebersicht';
import { Anfragen, BausteinSeite, MediakitEditor, Reportings } from './Verwaltung';
export function KooperationenRouten() {
  return <Routes>
    <Route index element={<BausteinSeite id="kooperationen"><Uebersicht/></BausteinSeite>}/>
    <Route path="pipeline" element={<BausteinSeite id="pipeline"><Uebersicht board/></BausteinSeite>}/>
    <Route path="anfragen" element={<BausteinSeite id="anfrageformular"><Anfragen/></BausteinSeite>}/>
    <Route path="mediakit" element={<BausteinSeite id="mediakit"><MediakitEditor/></BausteinSeite>}/>
    <Route path="reportings" element={<BausteinSeite id="partnerreporting"><Reportings/></BausteinSeite>}/>
  </Routes>;
}
