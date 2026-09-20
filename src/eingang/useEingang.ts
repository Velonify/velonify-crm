import { useCrm } from '../data/CrmContext';
import { useLoad } from '../lib/useLoad';

/** All website inquiries; `reload` after one was taken over or discarded. */
export function useEingang() {
  const { service } = useCrm();
  return useLoad(() => (service ? service.loadEingang() : new Promise<never>(() => {})), [service]);
}
