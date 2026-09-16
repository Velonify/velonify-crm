import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { useAuth } from '../auth/AuthContext';
import { AuthExpiredError } from '../data/errors';

export interface LoadState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload(): void;
  setData(data: T): void;
}

/** Runs an async loader when `deps` change; an expired Google token opens the re-login dialog instead of an error. */
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList): LoadState<T> {
  const { expire } = useAuth();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    loadRef.current().then(
      (result) => {
        if (cancelled) return;
        setData(result);
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        if (err instanceof AuthExpiredError) expire();
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [...deps, attempt, expire]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, error, loading, reload, setData };
}
