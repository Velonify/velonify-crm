import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

/**
 * "Frag den Hub" (⌘K in the hub): a short question about the hub's data. The model, prompt and tools are fixed here;
 * the browser only sends the conversation. The tools run in the browser on the data the person already sees in the hub,
 * so this function needs no database access and nobody can read more than in the hub itself.
 */

/** Always the cheapest current model (decision 2026-10-19); questions are short lookups. */
export const FRAGE_MODELL = 'claude-haiku-5-5';
const MAX_RUNDEN = 6;
const MAX_ZEICHEN = 60_000;

export const FRAGE_SYSTEM = `Du bist „Frag den Hub“ im Velonify Hub, dem internen CRM einer Shopify-Agentur aus Deutschland.
Du beantwortest kurze Fragen des Teams zu Pipeline, fälligen Aufgaben, Firmen, To-dos und Kennzahlen.

So arbeitest du:
- Hol dir Fakten immer über die Werkzeuge, nie aus dem Gedächtnis. Erfinde keine Firmen, Beträge oder Daten.
- Antworte auf Deutsch, per du, in zwei bis fünf kurzen Sätzen oder einer knappen Liste. Kein Markdown außer „- “ für Listen.
- Nenne Firmen mit ihrem genauen Namen, Beträge in Euro mit Punkt als Tausendertrenner (z. B. 12.400 €).
- Wenn die Werkzeuge etwas nicht hergeben, sag das ehrlich in einem Satz und was man stattdessen im Hub öffnen kann.
- Du kannst nichts ändern, nur lesen. Bitten um Änderungen beantwortest du mit dem passenden Ort im Hub.
- Heute ist {HEUTE}. Die fragende Person heißt im Team {ICH}.`;

export const FRAGE_WERKZEUGE: Anthropic.Tool[] = [
  {
    name: 'suche',
    description: 'Sucht Firmen, Kontakte und Deals im CRM nach Name, Domain, Kürzel oder Ort. Gibt Treffer mit id zurück.',
    input_schema: { type: 'object', properties: { text: { type: 'string', description: 'Suchbegriff' } }, required: ['text'], additionalProperties: false },
  },
  {
    name: 'firma',
    description: 'Details einer Firma: Status, Deals mit Phase, Wert und nächstem Schritt, Kontakte, offene Wiedervorlagen, letzte Einträge im Verlauf.',
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'id aus der Suche' } }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'pipeline',
    description: 'Offene Deals, optional gefiltert nach Phase (neu, qualifiziert, vernetzung, kontaktiert, gespraech, angebot) und Zuständigen. Mit Wert, Wahrscheinlichkeit, nächstem Schritt und Tagen ohne Aktivität.',
    input_schema: {
      type: 'object',
      properties: { phase: { type: 'string' }, zustaendig: { type: 'string', description: 'Vorname aus dem Team' } },
      additionalProperties: false,
    },
  },
  {
    name: 'faellig',
    description: 'Überfällige, heute und in den nächsten 7 Tagen fällige Wiedervorlagen und nächste Schritte, für eine Person oder alle.',
    input_schema: { type: 'object', properties: { person: { type: 'string', description: 'Vorname; leer für alle' } }, additionalProperties: false },
  },
  {
    name: 'kennzahlen',
    description: 'Kennzahlen der Pipeline: offener und gewichteter Wert, Anzahl offener Deals, überfällige Schritte, gewonnene Deals der letzten 30 Tage.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'todos',
    description: 'Offene To-do-Karten (Boards „Velonify intern“ und Kunden), optional für eine Person, mit Fälligkeit und Board.',
    input_schema: { type: 'object', properties: { person: { type: 'string' } }, additionalProperties: false },
  },
];

const Block = z.record(z.string(), z.unknown()).refine((b) => typeof b.type === 'string', 'Block ohne type');
const Nachricht = z.object({ role: z.enum(['user', 'assistant']), content: z.union([z.string().min(1).max(2000), z.array(Block).min(1).max(40)]) });
export const FrageSchema = z.object({
  ich: z.string().max(40).default(''),
  verlauf: z.array(Nachricht).min(1).max(MAX_RUNDEN * 2 + 1),
});
export type FrageAnfrage = z.infer<typeof FrageSchema>;

/** Rejects conversations that are too long or do not start with a plain question. */
export function pruefeVerlauf(anfrage: FrageAnfrage): string | null {
  if (JSON.stringify(anfrage.verlauf).length > MAX_ZEICHEN) return 'Die Frage ist zu lang.';
  const erste = anfrage.verlauf[0];
  if (erste.role !== 'user' || typeof erste.content !== 'string') return 'Die erste Nachricht muss die Frage sein.';
  if (anfrage.verlauf.at(-1)!.role !== 'user') return 'Die letzte Nachricht muss vom Nutzer kommen.';
  return null;
}

export function frageParameter(anfrage: FrageAnfrage, heute: string): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: FRAGE_MODELL,
    max_tokens: 2000,
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: FRAGE_SYSTEM.replace('{HEUTE}', heute).replace('{ICH}', anfrage.ich || 'unbekannt') }],
    tools: FRAGE_WERKZEUGE,
    messages: anfrage.verlauf as Anthropic.MessageParam[],
  };
}
