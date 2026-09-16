import { useNavigate } from 'react-router-dom';
import { FirmaForm } from '../components/FirmaForm';
import { Loading, PageHeader } from '../components/ui';
import { useRepository } from '../data/RepositoryContext';
import { EMPTY_FIRMA_INPUT } from '../data/types';
import { useLoad } from '../lib/useLoad';

export function FirmaNeuPage() {
  const { repository } = useRepository();
  const navigate = useNavigate();
  const listen = useLoad(() => repository.getListen(), [repository]);

  return (
    <div className="page narrow">
      <PageHeader title="Neue Firma" />
      {listen.data ? (
        <FirmaForm
          initial={EMPTY_FIRMA_INPUT}
          listen={listen.data}
          submitLabel="Firma anlegen"
          onCancel={() => navigate('/firmen')}
          onSubmit={async (values) => {
            const firma = await repository.createFirma(values);
            navigate(`/firmen/${firma.id}`, { replace: true });
          }}
        />
      ) : (
        <Loading />
      )}
    </div>
  );
}
