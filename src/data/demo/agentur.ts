/**
 * The invented agency of the public demo (demo.velonify.de): who works there and how the hub's own sample data,
 * written for Velonify (catalogue, social plan, outreach list), is retold as theirs. Invented names on the
 * reserved .example TLD only – this repo is public.
 */
export const AGENTUR = {
  name: 'Kranich Commerce',
  domain: 'kranich-commerce.example',
  ort: 'Hamburg',
};

export interface DemoPerson {
  /** Name as in the team list */
  name: string;
  nachname: string;
  rolle: string;
  email: string;
}

const person = (name: string, nachname: string, rolle: string): DemoPerson => ({ name, nachname, rolle, email: `${name.toLowerCase()}@${AGENTUR.domain}` });

export const DEMO_TEAM: DemoPerson[] = [
  person('Lena', 'Hoffmann', 'Geschäftsführung'),
  person('Tim', 'Albers', 'Projektleitung'),
  person('Aylin', 'Demir', 'Vertrieb'),
  person('Marek', 'Nowak', 'Entwicklung'),
  person('Pia', 'Kröger', 'Performance Marketing'),
];

/** The person visitors start as: the managing director sees the whole agency. */
export const DEMO_START = DEMO_TEAM[0];

export const teamEmail = (name: string) => DEMO_TEAM.find((p) => p.name === name)?.email ?? DEMO_START.email;

// Velonify's three founders become the first three people of the agency; the others only exist in the demo.
const NAMEN: [RegExp, string][] = [
  [/\b(?:lugge|lukas|demo|test)@velonify\.de\b/gi, DEMO_TEAM[0].email],
  [/\bjohannes@velonify\.de\b/gi, DEMO_TEAM[1].email],
  [/\bjulian@velonify\.de\b/gi, DEMO_TEAM[2].email],
  [/velonify\.de/gi, AGENTUR.domain],
  [/\bLugge\b|\bLukas\b/g, DEMO_TEAM[0].name],
  [/\bJohannes\b/g, DEMO_TEAM[1].name],
  [/\bJulian\b/g, DEMO_TEAM[2].name],
  [/Velonify/g, AGENTUR.name],
  [/VELONIFY/g, AGENTUR.name.toUpperCase()],
];

/** Retells a text of the Velonify sample data as one of the demo agency. */
export function alsAgentur(text: string): string {
  return NAMEN.reduce((t, [muster, ersatz]) => t.replace(muster, ersatz), text);
}
