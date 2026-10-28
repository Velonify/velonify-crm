import { useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { config } from '../config';
import { useMandant } from '../plattform/MandantContext';
import { anfrage, PlattformApiFehler } from '../plattform/api';
import type { BausteinId, InstanzSicht } from '../data/instanz';

export { PlattformApiFehler as CreatorApiFehler };

/** Calls of the creator modules to the instance's crm-api (/c/<modul>/…), signed in. GET without body, POST with. */
export interface CreatorApi {
  get<T>(pfad: string): Promise<T>;
  post<T>(pfad: string, body?: unknown): Promise<T>;
}

export function useCreatorApi(): CreatorApi {
  const { getToken } = useAuth();
  return useMemo(
    () => ({
      get: <T,>(pfad: string) => anfrage<T>(getToken, config.crmApiUrl, pfad),
      post: <T,>(pfad: string, body: unknown = {}) => anfrage<T>(getToken, config.crmApiUrl, pfad, body),
    }),
    [getToken],
  );
}

/** Public paths of the instance (/oeffentlich/<modul>/…), without login: forms, media kit, report links. */
export async function oeffentlich<T>(pfad: string, body?: unknown): Promise<T> {
  const antwort = await fetch(`${config.crmApiUrl.replace(/\/$/, '')}${pfad}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const daten = (await antwort.json().catch(() => null)) as (T & { fehler?: string }) | null;
  if (!antwort.ok || !daten) throw new PlattformApiFehler(daten?.fehler ?? `Fehler ${antwort.status}`, antwort.status);
  return daten;
}

/** The instance as crm-api described it to the signed-in person; throws outside an instance. */
export function useInstanz(): InstanzSicht {
  const { instanz } = useMandant();
  if (!instanz) throw new Error('useInstanz gibt es nur in einer eigenen Instanz.');
  return instanz;
}

/** Whether a building block of the concept is switched on in this instance. */
export function useBaustein(id: BausteinId): boolean {
  const { instanz } = useMandant();
  return instanz?.bausteine.includes(id) ?? false;
}
