import { useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useCrm } from '../data/CrmContext';
import type { CrmService } from '../data/crm';
import { AuthExpiredError } from '../data/errors';
import { useLoad } from '../lib/useLoad';

/**
 * Boards, cards and comments. `aendern` runs a write and reloads only the to-do tabs – card moves happen often and
 * leave the CRM data untouched, so the whole CRM is not reloaded each time.
 */
export function useTodoDaten() {
  const { service } = useCrm();
  const { expire } = useAuth();
  const daten = useLoad(() => (service ? service.loadTodoDaten() : new Promise<never>(() => {})), [service], 'todo');
  const { reload } = daten;

  const aendern = useCallback(
    async <T,>(action: (s: CrmService) => Promise<T>): Promise<T> => {
      if (!service) throw new Error('Der Hub wird noch geladen.');
      try {
        return await action(service);
      } catch (err) {
        if (err instanceof AuthExpiredError) expire();
        throw err;
      } finally {
        reload();
      }
    },
    [service, expire, reload],
  );

  return { ...daten, aendern };
}
