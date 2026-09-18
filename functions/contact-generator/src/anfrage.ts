import { z } from 'zod';

export const KANAELE = ['instagram', 'linkedin_notiz', 'linkedin_nachricht', 'email'] as const;
export type Kanal = (typeof KANAELE)[number];

/** How much thinking Claude puts in: "komplex" for important customers, "easy" for quick, cheaper texts. */
export const MODI = ['komplex', 'easy'] as const;

/** Optional text field: trimmed, capped, empty when missing. */
const feld = (max: number) => z.string().trim().max(max).default('');
const pflicht = (max: number) => z.string().trim().min(1).max(max);

/**
 * What the app sends. Deliberately only the fields the text needs: no e-mail addresses, phone numbers,
 * register data or deal values leave the CRM.
 */
export const AnfrageSchema = z.object({
  kanal: z.enum(KANAELE),
  sprache: z.enum(['de', 'en']),
  anrede: z.enum(['sie', 'du']),
  absender: z.object({ vorname: pflicht(40) }),
  firma: z.object({
    name: pflicht(200),
    domain: feld(200),
    ort: feld(100),
    plattform: feld(50),
    version: feld(50),
    eol: feld(20),
    tech_info: feld(1000),
    notiz: feld(2000),
  }),
  kontakt: z
    .object({ vorname: feld(60), nachname: feld(60), rolle: feld(120) })
    .nullable()
    .default(null),
  leistung: z.object({
    titel: pflicht(200),
    unterpunkte: z.array(z.string().trim().max(200)).max(30).default([]),
    anlass: feld(1000),
    nutzen: feld(1000),
    beleg: feld(1000),
    /** Free text of a manually entered service. */
    beschreibung: feld(2000),
  }),
  aufhaenger: feld(1000),
  /** Extra instruction when regenerating, e.g. "kürzer". */
  hinweis: feld(500),
  modus: z.enum(MODI).default('komplex'),
});

export type Anfrage = z.infer<typeof AnfrageSchema>;

/** Readable German summary of what is wrong with a request, for the 400 response. */
export function fehlerText(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'Anfrage'}: ${issue.message}`).join('; ');
}
