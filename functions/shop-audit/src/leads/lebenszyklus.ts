import { magentoEol, type EolStatus } from '../regeln.js';
import { SYSTEME } from './systeme.js';

/*
 * Support status per shop system and version. Sources (checked 2026-09-19):
 * - Magento: Adobe lifecycle policy, table MAGENTO_EOL in regeln.ts
 * - Shopware: 5 without support since July 2024; 6.4 since 2025; 6.5 until 2027-02-28 (endoflife.date/shopware)
 * - OXID: 6.4 and older end of life; 6.5 only gets selected fixes as a legacy version (docs.oxid-esales.com)
 * - xt:Commerce (3/4/Veyton), osCommerce: long unmaintained
 */

export interface Support {
  status: EolStatus;
  /** Human-readable, e.g. "Shopware 5, seit Juli 2024 ohne Support". */
  text: string;
  /** ISO date of the end of support, '' if unknown. */
  datum: string;
}

const MONAT_MS = 30 * 24 * 3600 * 1000;
const monatJahr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'UTC', month: 'long', year: 'numeric' });

function nachDatum(label: string, datum: string, heute: Date): Support {
  const ende = new Date(`${datum}T00:00:00Z`);
  if (ende <= heute) return { status: 'eol', text: `${label}, seit ${monatJahr(datum)} ohne Support`, datum };
  if (ende.getTime() - heute.getTime() <= 12 * MONAT_MS) return { status: 'eol_soon', text: `${label}, Support endet ${monatJahr(datum)}`, datum };
  return { status: 'supported', text: label, datum };
}

const unbekannt = (text: string): Support => ({ status: 'unknown', text, datum: '' });

export function supportStatus(system: string, version: string, heute: Date): Support {
  const v = version.trim();
  const [major, minor] = v.split('.').map((t) => Number.parseInt(t, 10));
  switch (system) {
    case 'magento': {
      if (major === 1) return { status: 'eol', text: 'Magento 1, seit Juni 2020 ohne Sicherheitsupdates', datum: '2020-06-30' };
      if (!v || v === '2') return unbekannt('Magento 2, Version nicht öffentlich');
      const eol = magentoEol(v, heute);
      if (eol.status === 'unknown') return unbekannt(`Magento ${v}`);
      if (eol.datum) return nachDatum(`Magento ${v}`, eol.datum, heute);
      return { status: eol.status, text: `Magento ${v}, ohne Support`, datum: '' };
    }
    case 'shopware':
      if (major === 5) return { status: 'eol', text: 'Shopware 5, seit Juli 2024 ohne Support', datum: '2024-07-31' };
      if (major && major < 5) return { status: 'eol', text: `Shopware ${major}, seit Jahren ohne Support`, datum: '' };
      if (major === 6 && Number.isFinite(minor)) {
        if (minor <= 4) return { status: 'eol', text: `Shopware 6.${minor}, ohne Sicherheitsupdates`, datum: '' };
        if (minor === 5) return nachDatum('Shopware 6.5', '2027-02-28', heute);
        return { status: 'supported', text: `Shopware ${v}`, datum: '' };
      }
      return unbekannt(v ? `Shopware ${v}` : 'Shopware');
    case 'oxid':
      if (major && major <= 5) return { status: 'eol', text: `OXID eShop ${major}, seit Jahren ohne Support`, datum: '' };
      if (major === 6 && Number.isFinite(minor)) {
        if (minor <= 4) return { status: 'eol', text: `OXID eShop 6.${minor}, ohne Support`, datum: '' };
        return { status: 'eol_soon', text: 'OXID eShop 6.5, nur noch ausgewählte Fixes', datum: '' };
      }
      return unbekannt(v ? `OXID eShop ${v}` : 'OXID eShop');
    case 'xtcommerce':
      return { status: 'eol', text: 'xt:Commerce, nicht mehr gepflegt', datum: '' };
    case 'oscommerce':
      return { status: 'eol', text: 'osCommerce, nicht mehr gepflegt', datum: '' };
    default:
      return unbekannt(label(system) + (v ? ` ${v}` : ''));
  }
}

/** Platform keys of our own detection (merkmale.ts) → system id of the pool. */
const EIGENE: Record<string, string> = {
  magento1: 'magento', magento2: 'magento', shopware5: 'shopware', shopware6: 'shopware', salesforce_cc: 'sfcc',
  sap_commerce: 'sap', xt_commerce: 'xtcommerce',
};

/**
 * Maps a detected platform to our system id and a version. Our own keys carry the major version in the name
 * (magento1, shopware5); webappanalyzer names are looked up in SYSTEME.
 */
export function systemVon(name: string, version: string): { id: string; version: string } {
  if (name === 'unbekannt' || !name) return { id: '', version: '' };
  if (name === 'shopify') return { id: 'shopify', version: '' };
  const eigen = EIGENE[name];
  if (eigen) {
    const major = /\d$/.exec(name)?.[0] ?? '';
    return { id: eigen, version: version && (!major || version.startsWith(major)) ? version : major };
  }
  const aus = SYSTEME.find((s) => s.id === name || s.technik.includes(name));
  return { id: aus?.id ?? name.toLowerCase().replace(/[^a-z0-9]+/g, ''), version };
}

export const label = (id: string) => SYSTEME.find((s) => s.id === id)?.label ?? id;
