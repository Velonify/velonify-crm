import { useCallback, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { config, isDemo } from '../config';
import { CloudGenerator, DemoGenerator, type GeneratorApi } from '../data/contactGenerator';
import { useCrm } from '../data/CrmContext';
import type { CrmService } from '../data/crm';
import { useLoad } from '../lib/useLoad';

/** Services and sent messages of the Contact Generator; `aendern` runs a write and reloads them. */
export function useContactDaten() {
  const { service, mutate } = useCrm();
  const daten = useLoad(() => (service ? service.loadContactDaten() : new Promise<never>(() => {})), [service]);
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

/** The Cloud Function in production, sample texts in demo mode; null while the address is not configured. */
export function useGenerator(): GeneratorApi | null {
  const { getToken } = useAuth();
  return useMemo(() => {
    if (isDemo) return new DemoGenerator();
    return config.contactGeneratorUrl ? new CloudGenerator(config.contactGeneratorUrl, getToken) : null;
  }, [getToken]);
}
