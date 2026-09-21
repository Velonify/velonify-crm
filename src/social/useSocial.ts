import { useCallback } from 'react';
import { useCrm } from '../data/CrmContext';
import type { CrmService } from '../data/crm';
import { useLoad } from '../lib/useLoad';
import type { SocialDaten } from '../data/types';

/** Plan, content, tasks and numbers of the social media tool; `aendern` runs a write and reloads them. */
export function useSocial() {
  const { service, mutate } = useCrm();
  const daten = useLoad<SocialDaten>(() => (service ? service.loadSocialDaten() : new Promise<never>(() => {})), [service]);
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

export type Aendern = <T>(action: (s: CrmService) => Promise<T>) => Promise<T>;
