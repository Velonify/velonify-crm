import { Route, Routes } from 'react-router-dom';
import { ContentPlan, InhaltDetail } from './Plan';
import { Recherche, Skripte, Thumbnails } from './Assistenten';
import { Upload } from './Upload';

export function ContentRouten() {
  return <Routes>
    <Route index element={<ContentPlan/>}/>
    <Route path="inhalte/:id" element={<InhaltDetail/>}/>
    <Route path="recherche" element={<Recherche/>}/>
    <Route path="skripte" element={<Skripte/>}/>
    <Route path="thumbnails" element={<Thumbnails/>}/>
    <Route path="upload" element={<Upload/>}/>
  </Routes>;
}
