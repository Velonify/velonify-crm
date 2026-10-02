import { useCallback } from 'react';
import { useCrm } from '../data/CrmContext';
import type { CrmService } from '../data/crm';
import { useLoad } from '../lib/useLoad';

/** Magnets and sign-ups; `aendern` runs a write and reloads them. */
export function useMagnetDaten() {
  const { service, mutate } = useCrm();
  const daten = useLoad(() => (service ? service.loadMagnetDaten() : new Promise<never>(() => {})), [service]);
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
