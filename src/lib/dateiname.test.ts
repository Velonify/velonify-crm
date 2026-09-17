import { describe, expect, it } from 'vitest';
import { dateiname, dateinameThema } from './dateiname';

describe('dateiname', () => {
  it('follows the Drive naming convention', () => {
    expect(dateiname({ datum: '2026-08-28', kuerzel: 'sb', thema: 'Kalkulation Shopify-Migration', version: 1 })).toBe(
      '2026-08-28_SB_kalkulation-shopify-migration_v01',
    );
  });

  it('folds umlauts and drops special characters and spaces', () => {
    expect(dateinameThema('Größenübersicht & Maße (Brautkleider)')).toBe('groessenuebersicht-masse-brautkleider');
    expect(dateinameThema('  Café  –  Relaunch  ')).toBe('cafe-relaunch');
  });

  it('leaves out a missing Kürzel and pads the version', () => {
    expect(dateiname({ datum: '2026-09-17', kuerzel: '', thema: 'Teammeeting', version: 12 })).toBe('2026-09-17_teammeeting_v12');
    expect(dateiname({ datum: '2026-09-17', kuerzel: 'PW', thema: '', version: 0 })).toBe('2026-09-17_PW_thema_v01');
  });
});
