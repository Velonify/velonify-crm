import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { config, isDemo } from '../config';
import { useToast } from '../components/Toasts';
import { errorMessage } from '../lib/errors';
import { CrmService } from './crm';
import { createDemoBackend } from './demo/seed';
import { AuthExpiredError } from './errors';
import { GoogleCalendar } from './google/calendar';
import { GoogleDrive } from './google/drive';
import { SheetsClient, type SheetsApi } from './sheets/sheetsClient';
import { SheetStore } from './sheets/sheetStore';
import type { Database } from './types';

interface CrmContextValue {
  service: CrmService | null;
  /** Raw sheet access for the setup page. */
  sheets: SheetsApi | null;
  db: Database | null;
  loading: boolean;
  error: Error | null;
  refresh(): Promise<void>;
  /**
   * Runs a write, reloads the data and reports failures. Rethrows, so forms can show the error inline;
   * use `perform` for fire-and-forget buttons.
   */
  mutate<T>(action: (service: CrmService) => Promise<T>): Promise<T>;
  perform<T>(action: (service: CrmService) => Promise<T>, success?: string): Promise<T | undefined>;
}

const CrmContext = createContext<CrmContextValue | null>(null);

// Colleagues' changes show up without reloading the page; at 60 reads/minute per person this stays far below Google's limit.
const REFRESH_INTERVAL_MS = 120_000;
const REFRESH_ON_FOCUS_AFTER_MS = 30_000;

export function CrmProvider({ children }: { children: ReactNode }) {
  const { getToken, userEmail, expire } = useAuth();
  const toast = useToast();
  const [backend, setBackend] = useState<{ service: CrmService; sheets: SheetsApi } | null>(null);
  const [db, setDb] = useState<Database | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const loadedAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    if (isDemo) {
      createDemoBackend(userEmail).then(
        (demo) => !cancelled && setBackend(demo),
        (err: Error) => !cancelled && (setError(err), setLoading(false)),
      );
    } else {
      const sheets = new SheetsClient(config.spreadsheetId, getToken);
      const service = new CrmService({
        store: new SheetStore(sheets),
        drive: new GoogleDrive(getToken),
        calendar: new GoogleCalendar(getToken),
        currentUser: userEmail,
      });
      setBackend({ service, sheets });
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
      try {
        return await action(backend.service);
      } catch (err) {
        if (err instanceof AuthExpiredError) expire();
        throw err;
      } finally {
        // Also after errors: a conflict or partial failure should show the current state.
        await refresh();
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
    () => ({ service: backend?.service ?? null, sheets: backend?.sheets ?? null, db, loading, error, refresh, mutate, perform }),
    [backend, db, loading, error, refresh, mutate, perform],
  );
  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm(): CrmContextValue {
  const context = useContext(CrmContext);
  if (!context) throw new Error('useCrm must be used inside CrmProvider');
  return context;
}
