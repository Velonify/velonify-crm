const UMLAUTE: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/** "Kalkulation Shopify-Migration (B2B)" → "kalkulation-shopify-migration-b2b" */
export function dateinameThema(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTE[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface DateinameTeile {
  /** YYYY-MM-DD */
  datum: string;
  kuerzel: string;
  thema: string;
  version: number;
}

/**
 * File name after the Drive convention `YYYY-MM-DD_KÜRZEL_thema_v01`: no umlauts, spaces or special characters.
 * Without a Kürzel (company-wide files) that part is left out.
 */
export function dateiname({ datum, kuerzel, thema, version }: DateinameTeile): string {
  const k = kuerzel.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const v = `v${String(Math.max(1, Math.floor(version) || 1)).padStart(2, '0')}`;
  return [datum, k, dateinameThema(thema) || 'thema', v].filter(Boolean).join('_');
}
