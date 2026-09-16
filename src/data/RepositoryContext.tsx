import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { config, isDemo } from '../config';
import { DemoRepository } from './demo/demoRepository';
import type { Repository } from './repository';
import { SheetsClient } from './sheets/sheetsClient';
import { SheetsRepository } from './sheets/sheetsRepository';

interface RepositoryContextValue {
  repository: Repository;
  /** Raw Sheets access for the setup page; null in demo mode. */
  sheets: SheetsClient | null;
}

const RepositoryContext = createContext<RepositoryContextValue | null>(null);

export function RepositoryProvider({ children }: { children: ReactNode }) {
  const { getToken, userEmail } = useAuth();
  const value = useMemo<RepositoryContextValue>(() => {
    if (isDemo) return { repository: new DemoRepository(), sheets: null };
    const sheets = new SheetsClient(config.spreadsheetId, getToken);
    return { repository: new SheetsRepository(sheets, userEmail), sheets };
  }, [getToken, userEmail]);
  return <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>;
}

export function useRepository(): RepositoryContextValue {
  const context = useContext(RepositoryContext);
  if (!context) throw new Error('useRepository must be used inside RepositoryProvider');
  return context;
}
