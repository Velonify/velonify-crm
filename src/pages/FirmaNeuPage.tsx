import { useNavigate } from 'react-router-dom';
import { FirmaForm } from '../components/FirmaForm';
import { useToast } from '../components/Toasts';
import { Loading, PageHeader } from '../components/ui';
import { useCrm } from '../data/CrmContext';
import { EMPTY_FIRMA_INPUT } from '../data/types';
import { useIch } from '../lib/useIch';

export function FirmaNeuPage() {
  const { db, mutate } = useCrm();
  const navigate = useNavigate();
  const toast = useToast();
  const [ich] = useIch(db?.listen.team ?? []);

  return (
    <div className="page narrow">
      <PageHeader eyebrow="Firmen" title="Neue Firma" />
      {db ? (
        <FirmaForm
          initial={{ ...EMPTY_FIRMA_INPUT, zustaendig: ich ?? '' }}
          listen={db.listen}
          alleFirmen={db.firmen}
          submitLabel="Firma anlegen"
          onCancel={() => navigate('/firmen')}
          onSubmit={async (values) => {
            const firma = await mutate((s) => s.createFirma(values));
            toast.show(`${firma.name} angelegt`);
            navigate(`/firmen/${firma.id}`, { replace: true });
          }}
        />
      ) : (
        <Loading />
      )}
    </div>
  );
}
