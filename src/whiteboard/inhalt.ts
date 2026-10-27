import { config, isDemo } from '../config';
import { AuthExpiredError } from '../data/errors';
import type { WbElement, WbInhalt } from '../data/whiteboard';

/**
 * Drawing and images of a board. Against crm-api (routes /whiteboard/…) in the hub; in the demo only in this browser,
 * so the tool can be tried without a backend.
 */
export interface InhaltApi {
  lade(boardId: string): Promise<WbInhalt>;
  /** Sends changed (or all) elements; the server merges them into what it has. */
  speichere(boardId: string, elemente: readonly WbElement[], vorschau?: string): Promise<{ stand: number }>;
  vorschauen(): Promise<Record<string, string>>;
  dateiHoch(boardId: string, dateiId: string, datei: Blob): Promise<void>;
  dateiLaden(boardId: string, dateiId: string): Promise<Blob>;
}

export function apiInhalt(url: string, getToken: () => Promise<string>): InhaltApi {
  const basis = url.replace(/\/$/, '');
  async function anfrage(pfad: string, init: RequestInit = {}): Promise<Response> {
    let antwort: Response;
    try {
      antwort = await fetch(`${basis}${pfad}`, { ...init, headers: { Authorization: `Bearer ${await getToken()}`, ...init.headers } });
    } catch {
      throw new Error('Die CRM-Datenbank ist gerade nicht erreichbar. Bitte Internetverbindung prüfen.');
    }
    if (antwort.ok) return antwort;
    if (antwort.status === 401) throw new AuthExpiredError();
    const daten = (await antwort.json().catch(() => null)) as { fehler?: string } | null;
    throw new Error(daten?.fehler ?? `Die CRM-Datenbank hat mit Fehler ${antwort.status} geantwortet.`);
  }
  const json = async <T,>(pfad: string, body?: unknown): Promise<T> =>
    (await anfrage(pfad, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json() as Promise<T>;
  return {
    lade: (id) => json(`/whiteboard/${id}/inhalt`),
    speichere: (id, elemente, vorschau) => json(`/whiteboard/${id}/inhalt`, { elemente, vorschau }),
    vorschauen: async () => (await json<{ vorschauen: Record<string, string> }>('/whiteboard/vorschauen')).vorschauen,
    dateiHoch: async (id, dateiId, datei) => {
      await anfrage(`/whiteboard/${id}/datei/${dateiId}`, { method: 'POST', headers: { 'Content-Type': datei.type }, body: datei });
    },
    dateiLaden: async (id, dateiId) => (await anfrage(`/whiteboard/${id}/datei/${dateiId}`)).blob(),
  };
}

/** Demo: drawings in localStorage (shared by the tabs of this browser), images only in memory. */
export function demoInhalt(): InhaltApi {
  const schluessel = (id: string) => `velonify-whiteboard-${id}`;
  const dateien = new Map<string, Blob>();
  const lies = (id: string): WbInhalt & { vorschau?: string } => {
    try {
      return JSON.parse(localStorage.getItem(schluessel(id)) ?? '') as WbInhalt;
    } catch {
      return { elemente: [], dateien: {}, stand: 0 };
    }
  };
  return {
    lade: async (id) => lies(id),
    speichere: async (id, elemente, vorschau) => {
      // Same merge as crm-api, so the demo behaves like the hub.
      const { fuehreZusammen } = await import('../data/whiteboard');
      const alt = lies(id);
      const neu = { ...alt, elemente: fuehreZusammen(alt.elemente, elemente), stand: alt.stand + 1, vorschau: vorschau ?? alt.vorschau };
      try {
        localStorage.setItem(schluessel(id), JSON.stringify(neu));
      } catch {
        // Full storage only costs the demo its copy.
      }
      return { stand: neu.stand };
    },
    vorschauen: async () => {
      const alle: Record<string, string> = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) ?? '';
          if (!k.startsWith('velonify-whiteboard-')) continue;
          const v = (JSON.parse(localStorage.getItem(k) ?? '{}') as { vorschau?: string }).vorschau;
          if (v) alle[k.slice('velonify-whiteboard-'.length)] = v;
        }
      } catch {
        // No previews then.
      }
      return alle;
    },
    dateiHoch: async (id, dateiId, datei) => void dateien.set(`${id}/${dateiId}`, datei),
    dateiLaden: async (id, dateiId) => {
      const datei = dateien.get(`${id}/${dateiId}`);
      if (!datei) throw new Error('Bild nicht gefunden.');
      return datei;
    },
  };
}

let demo: InhaltApi | null = null;
export function inhaltApi(getToken: () => Promise<string>): InhaltApi {
  if (isDemo) return (demo ??= demoInhalt());
  return apiInhalt(config.crmApiUrl, getToken);
}

/** Address of the live relay (https:// of Cloud Run works too); without it (demo, local runs) the board works alone. */
export const LIVE_URL: string = ((import.meta.env.VITE_WHITEBOARD_LIVE_URL as string | undefined) ?? '').trim().replace(/\/$/, '').replace(/^http/, 'ws');
