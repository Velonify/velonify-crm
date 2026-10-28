/**
 * CSV of payout reports (AdSense, Twitch, affiliate networks): delimiter guessed from the header line (; , or tab),
 * quoted fields with "" escapes, German and English number formats, the usual date formats.
 */
export function leseCsv(roh: string): { kopf: string[]; zeilen: string[][] } {
  const text = roh.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const ersteZeile = text.split('\n', 1)[0] ?? '';
  const zaehle = (z: string) => ersteZeile.split(z).length - 1;
  const trenner = [';', '\t', ','].reduce((best, t) => (zaehle(t) > zaehle(best) ? t : best), ',');
  const zeilen: string[][] = [];
  let feld = '';
  let zeile: string[] = [];
  let inAnf = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inAnf) {
      if (c === '"' && text[i + 1] === '"') {
        feld += '"';
        i++;
      } else if (c === '"') inAnf = false;
      else feld += c;
    } else if (c === '"' && feld === '') inAnf = true;
    else if (c === trenner) {
      zeile.push(feld);
      feld = '';
    } else if (c === '\n') {
      zeile.push(feld);
      zeilen.push(zeile);
      zeile = [];
      feld = '';
    } else feld += c;
  }
  if (feld !== '' || zeile.length > 0) {
    zeile.push(feld);
    zeilen.push(zeile);
  }
  const voll = zeilen.map((z) => z.map((f) => f.trim())).filter((z) => z.some((f) => f !== ''));
  return { kopf: voll[0] ?? [], zeilen: voll.slice(1) };
}

/** "1.234,56", "1,234.56", "1234.5", "€ 12,00", "-3,10" → number; null when not a number. */
export function leseBetrag(roh: string): number | null {
  let s = roh.replace(/[^\d,.\-−]/g, '').replace('−', '-');
  if (!/\d/.test(s)) return null;
  const komma = s.lastIndexOf(',');
  const punkt = s.lastIndexOf('.');
  if (komma > punkt) s = s.replace(/\./g, '').replace(',', '.');
  else if (punkt > komma && komma >= 0) s = s.replace(/,/g, '');
  else if (komma < 0 && (s.match(/\./g)?.length ?? 0) > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const MONATE: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, mär: 3, apr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dez: 12,
};

const iso = (j: number, m: number, t: number): string | null => {
  if (m < 1 || m > 12 || t < 1 || t > 31) return null;
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCMonth() === m - 1 ? `${j}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}` : null;
};

/** "2026-10-03", "03.10.2026", "2026/10/03", "2026-10" (month), "Oct 2026", "10/2026" → "YYYY-MM-DD" (month → its first day). */
export function leseDatum(roh: string): string | null {
  const s = roh.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = /^(\d{4})[-/](\d{1,2})$/.exec(s);
  if (m) return iso(+m[1], +m[2], 1);
  m = /^(\d{1,2})[/.](\d{4})$/.exec(s);
  if (m) return iso(+m[2], +m[1], 1);
  m = /^([A-Za-zäÄ]{3})[a-zäÄ]*\.?\s+(\d{4})$/.exec(s);
  if (m && MONATE[m[1].toLowerCase()]) return iso(+m[2], MONATE[m[1].toLowerCase()], 1);
  return null;
}
