/**
 * Research documents (Content → Recherche): a document is a list of blocks with formatted text parts. Stored and sent as
 * JSON, never as HTML, so nothing a person types can turn into markup. Shared by crm-api (validation) and the editor.
 */

export const BLOCK_TYPEN = ['p', 'h2', 'h3', 'li', 'ol', 'zitat'] as const;
export type BlockTyp = (typeof BLOCK_TYPEN)[number];

export interface TextTeil {
  text: string;
  fett?: boolean;
  kursiv?: boolean;
  /** Only http(s) addresses. */
  link?: string;
}

export interface Block {
  typ: BlockTyp;
  teile: TextTeil[];
}

export interface RechercheDokument {
  id: string;
  titel: string;
  bloecke: Block[];
  geaendert_am: string;
  geaendert_von: string;
}

const MAX_BLOECKE = 3000;
const MAX_ZEICHEN = 300_000;
export const istLink = (w: unknown): w is string => typeof w === 'string' && w.length <= 2000 && /^https?:\/\/[^\s]+$/i.test(w);

/** The blocks of a request, or an error text; drops empty parts and keeps at least one paragraph. */
export function pruefeBloecke(w: unknown): Block[] | string {
  if (!Array.isArray(w)) return 'Der Inhalt fehlt.';
  if (w.length > MAX_BLOECKE) return 'Das Dokument ist zu lang. Bitte auf mehrere Dokumente aufteilen.';
  let zeichen = 0;
  const bloecke: Block[] = [];
  for (const b of w) {
    if (!b || typeof b !== 'object' || !BLOCK_TYPEN.includes((b as Block).typ) || !Array.isArray((b as Block).teile)) return 'Der Inhalt ist ungültig.';
    const teile: TextTeil[] = [];
    for (const t of (b as Block).teile) {
      if (!t || typeof t !== 'object' || typeof t.text !== 'string') return 'Der Inhalt ist ungültig.';
      if (t.link !== undefined && !istLink(t.link)) return 'Links müssen mit https:// beginnen.';
      zeichen += t.text.length;
      if (!t.text) continue;
      teile.push({ text: t.text, ...(t.fett === true ? { fett: true } : {}), ...(t.kursiv === true ? { kursiv: true } : {}), ...(t.link ? { link: t.link } : {}) });
    }
    bloecke.push({ typ: (b as Block).typ, teile });
  }
  if (zeichen > MAX_ZEICHEN) return 'Das Dokument ist zu lang. Bitte auf mehrere Dokumente aufteilen.';
  return bloecke.length ? bloecke : [{ typ: 'p', teile: [] }];
}
