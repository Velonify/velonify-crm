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

/** Last results per key, so a page opened again shows its data at once while it is read again in the background. */
export class LadeCache {
  private readonly werte = new Map<string, unknown>();

  constructor(private readonly hoechstens = 50) {}

  has(schluessel: string): boolean {
    return this.werte.has(schluessel);
  }

  get<T>(schluessel: string): T | undefined {
    return this.werte.get(schluessel) as T | undefined;
  }

  set(schluessel: string, wert: unknown): void {
    // Re-inserting moves the key to the end, so the oldest entry is the one dropped.
    this.werte.delete(schluessel);
    this.werte.set(schluessel, wert);
    if (this.werte.size > this.hoechstens) this.werte.delete(this.werte.keys().next().value!);
  }

  clear(): void {
    this.werte.clear();
  }
}

const cache = new LadeCache();

/** Forget all cached results, e.g. when another person signs in. */
export function leereLadeCache(): void {
  cache.clear();
}

/**
 * Runs an async loader when `deps` change; an expired Google token opens the re-login dialog instead of an error.
 * With a `schluessel` the last result is kept across page changes (stale-while-revalidate): it is shown right away,
 * without a loading state, and replaced once the fresh read is back.
 */
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList, schluessel?: string): LoadState<T> {
  const { expire } = useAuth();
  const [data, setDataState] = useState<T | undefined>(() => (schluessel === undefined ? undefined : cache.get<T>(schluessel)));
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(() => schluessel === undefined || !cache.has(schluessel));
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const schluesselRef = useRef(schluessel);
  schluesselRef.current = schluessel;

  useEffect(() => {
    let cancelled = false;
    if (schluessel !== undefined && cache.has(schluessel)) {
      setDataState(cache.get<T>(schluessel));
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(undefined);
    loadRef.current().then(
      (result) => {
        if (cancelled) return;
        if (schluessel !== undefined) cache.set(schluessel, result);
        setDataState(result);
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
  }, [...deps, schluessel, attempt, expire]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const setData = useCallback((wert: T) => {
    if (schluesselRef.current !== undefined) cache.set(schluesselRef.current, wert);
    setDataState(wert);
  }, []);
  return { data, error, loading, reload, setData };
}
