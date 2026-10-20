import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { config, isDemo } from '../config';
import { useToast } from '../components/Toasts';
import { errorMessage } from '../lib/errors';
import { CrmService } from './crm';
import { AuthExpiredError } from './errors';
import { GoogleCalendar } from './google/calendar';
import { GoogleDrive } from './google/drive';
import { ApiStore } from './api/apiStore';
import { SheetsClient } from './sheets/sheetsClient';
import type { Database } from './types';
import { read as gemerktesIch } from '../lib/useIch';
import { leereLadeCache } from '../lib/useLoad';

interface CrmContextValue {
  service: CrmService | null;
  db: Database | null;
  loading: boolean;
  error: Error | null;
  refresh(): Promise<void>;
  /**
   * Runs a write, shows its result (a full reload only after errors) and reports failures. Rethrows, so forms can show the error inline;
   * use `perform` for fire-and-forget buttons.
   */
  mutate<T>(action: (service: CrmService) => Promise<T>): Promise<T>;
  perform<T>(action: (service: CrmService) => Promise<T>, success?: string): Promise<T | undefined>;
}

const CrmContext = createContext<CrmContextValue | null>(null);

// Colleagues' changes show up without reloading the page, without putting much load on crm-api.
const REFRESH_INTERVAL_MS = 120_000;
const REFRESH_ON_FOCUS_AFTER_MS = 30_000;

export function CrmProvider({ children }: { children: ReactNode }) {
  const { getToken, userEmail, expire } = useAuth();
  const toast = useToast();
  const [backend, setBackend] = useState<{ service: CrmService } | null>(null);
  const [db, setDb] = useState<Database | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const loadedAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    // Cached page data belongs to the previous sign-in.
    leereLadeCache();
    if (isDemo) {
      // Sample data and the in-memory store only reach the browser in demo mode.
      // The visitor's own copy is kept in this browser (IndexedDB), so it survives a reload.
      import('./demo/dauerhaft').then(({ starteDemo }) => starteDemo(userEmail)).then(
        (demo) => !cancelled && setBackend(demo),
        (err: Error) => !cancelled && (setError(err), setLoading(false)),
      );
    } else {
      // The data lives in Postgres behind crm-api; the Sheets client is only used for the offer calculations.
      const service = new CrmService({
        store: new ApiStore(config.crmApiUrl, getToken),
        drive: new GoogleDrive(getToken),
        calendar: new GoogleCalendar(getToken),
        currentUser: userEmail,
        tabelle: (spreadsheetId) => new SheetsClient(spreadsheetId, getToken),
        ich: gemerktesIch,
      });
      setBackend({ service });
    }
    return () => {
      cancelled = true;
    };
  }, [getToken, userEmail]);

  const refresh = useCallback(async () => {
    if (!backend) return;
    setLoading(true);
    try {
      setDb(await backend.service.load());
      setError(null);
      loadedAt.current = Date.now();
    } catch (err) {
      if (err instanceof AuthExpiredError) expire();
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [backend, expire]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible' && Date.now() - loadedAt.current > REFRESH_ON_FOCUS_AFTER_MS) void refresh();
    };
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void refresh(), REFRESH_INTERVAL_MS);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);

  const mutate = useCallback(
    async <T,>(action: (service: CrmService) => Promise<T>): Promise<T> => {
      if (!backend) throw new Error('Das CRM wird noch geladen.');
      let fehler = false;
      try {
        return await action(backend.service);
      } catch (err) {
        fehler = true;
        if (err instanceof AuthExpiredError) expire();
        throw err;
      } finally {
        // The service already applied its writes to the snapshot, so a success needs no reload.
        // After errors everything is read again: a conflict or partial failure should show the current state.
        const stand = fehler ? null : backend.service.aktuellerStand;
        if (stand) setDb(stand);
        else await refresh();
      }
    },
    [backend, expire, refresh],
  );

  const perform = useCallback(
    async <T,>(action: (service: CrmService) => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const result = await mutate(action);
        if (success) toast.show(success);
        return result;
      } catch (err) {
        if (!(err instanceof AuthExpiredError)) toast.show(errorMessage(err), 'error');
        return undefined;
      }
    },
    [mutate, toast],
  );

  const value = useMemo<CrmContextValue>(
    () => ({ service: backend?.service ?? null, db, loading, error, refresh, mutate, perform }),
    [backend, db, loading, error, refresh, mutate, perform],
  );
  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm(): CrmContextValue {
  const context = useContext(CrmContext);
  if (!context) throw new Error('useCrm must be used inside CrmProvider');
  return context;
}
