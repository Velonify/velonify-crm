import { useCallback } from 'react';
import { useCrm } from '../data/CrmContext';
import type { CrmService } from '../data/crm';
import { useLoad } from '../lib/useLoad';

/** Loads the service catalogue for the offer tool; `aendern` runs a write and reloads it. */
export function useKatalog() {
  const { service, mutate } = useCrm();
  const katalog = useLoad(() => (service ? service.loadKatalog() : new Promise<never>(() => {})), [service]);
  const { reload } = katalog;

  const aendern = useCallback(
    async <T,>(action: (s: CrmService) => Promise<T>): Promise<T> => {
      try {
        return await mutate(action);
      } finally {
        reload();
      }
    },
    [mutate, reload],
  );

  return { ...katalog, aendern };
}
