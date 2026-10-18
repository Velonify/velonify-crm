import { useCallback } from 'react';
import { useCrm } from '../data/CrmContext';
import type { CrmService } from '../data/crm';
import { useLoad } from '../lib/useLoad';

/** Logins, client tools and roadmap of the client portal; `aendern` runs a write and reloads them. */
export function usePortalDaten() {
  const { service, mutate } = useCrm();
  const daten = useLoad(() => (service ? service.loadPortalDaten() : new Promise<never>(() => {})), [service], 'portal');
  const { reload } = daten;

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

  return { ...daten, aendern };
}
