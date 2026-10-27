import { useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useCrm } from '../data/CrmContext';
import type { CrmService } from '../data/crm';
import { AuthExpiredError } from '../data/errors';
import { useLoad } from '../lib/useLoad';

/** Boards and comments; `aendern` runs a write and reloads only these two tabs, like the to-dos. */
export function useWhiteboardDaten() {
  const { service } = useCrm();
  const { expire } = useAuth();
  const daten = useLoad(() => (service ? service.loadWhiteboardDaten() : new Promise<never>(() => {})), [service], 'whiteboard');
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
