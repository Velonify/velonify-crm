import type { Db } from '../../../../src/data/postgres/postgresStore';
import { InstanzFehler } from '../../../../src/data/postgres/instanzStore';

/** Claude in an own instance: the instance's own key (ANTHROPIC_API_KEY), every call counted in instanz_ki_nutzung. */
export interface KiAnfrage {
  /** What it is for, e.g. "merkmale", "wochenbericht"; shows up in the usage. */
  zweck: string;
  /** schnell: Haiku for many small jobs (features, captions); gut: Sonnet for reports, scripts, research. */
  modell?: 'schnell' | 'gut';
  system: string;
  nachricht: string;
  maxTokens?: number;
  /** Who triggered it; empty for timed jobs. */
  email?: string;
}

export interface Ki {
  frage(anfrage: KiAnfrage): Promise<string>;
}

export const MODELLE = { schnell: 'claude-haiku-5-5', gut: 'claude-sonnet-5-5' } as const;

/** Asks for JSON and parses the first JSON value in the answer (Claude may wrap it in a code fence). */
export async function frageJson<T>(ki: Ki, anfrage: KiAnfrage): Promise<T> {
  const text = await ki.frage({ ...anfrage, system: `${anfrage.system}\n\nAntworte ausschließlich mit gültigem JSON, ohne Erklärung davor oder danach.` });
  const roh = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1] ?? text;
  const start = roh.search(/[[{]/);
  if (start < 0) throw new Error(`Claude hat kein JSON geliefert: ${text.slice(0, 200)}`);
  return JSON.parse(roh.slice(start)) as T;
}

export function claudeKi(apiKey: string, db: Db, holen: typeof fetch = fetch): Ki {
  return {
    async frage(a) {
      const modell = MODELLE[a.modell ?? 'schnell'];
      const antwort = await holen('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: modell, max_tokens: a.maxTokens ?? 2000, system: a.system, messages: [{ role: 'user', content: a.nachricht }] }),
      });
      const daten = (await antwort.json().catch(() => null)) as {
        content?: { type: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
        error?: { message?: string };
      } | null;
      if (!antwort.ok || !daten) throw new Error(`Claude antwortet mit ${antwort.status}: ${daten?.error?.message ?? 'ohne Inhalt'}`);
      await db.query('INSERT INTO instanz_ki_nutzung (email, zweck, modell, tokens_ein, tokens_aus) VALUES ($1, $2, $3, $4, $5)', [
        a.email ?? null,
        a.zweck,
        modell,
        daten.usage?.input_tokens ?? 0,
        daten.usage?.output_tokens ?? 0,
      ]);
      return (daten.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
    },
  };
}

/** Without ANTHROPIC_API_KEY: every KI feature answers 503 with a clear message instead of failing somewhere deeper. */
export const ohneKi: Ki = {
  frage: () => Promise.reject(new InstanzFehler('Claude ist in diesem Hub noch nicht eingerichtet (ANTHROPIC_API_KEY fehlt).', 503)),
};

/** For tests and the local preview: answers from a function, records the questions. */
export function testKi(antwort: (a: KiAnfrage) => string): Ki & { fragen: KiAnfrage[] } {
  const fragen: KiAnfrage[] = [];
  return {
    fragen,
    frage: async (a) => {
      fragen.push(a);
      return antwort(a);
    },
  };
}
