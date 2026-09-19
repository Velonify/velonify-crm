import { describe, expect, it } from 'vitest';
import { historieSql, importSql, mergeSql, prioViewSql } from './pool-sql.js';
import { OHNE_SUPPORT_MUSTER, SYSTEME, VORAB_ANLAESSE } from './systeme.js';

// BigQuery uses RE2; these patterns only use syntax RE2 and JavaScript read the same way.
const ohneSupport = (systemVersion: string) => new RegExp(OHNE_SUPPORT_MUSTER.join('|')).test(systemVersion);

describe('Systeme ohne Support', () => {
  it.each(['magento 1', 'magento 1.9.4', 'shopware 5', 'shopware 5.7.18', 'shopware 4', 'oxid 4', 'oxid 4.10', 'xtcommerce ', 'oscommerce 2.3'])(
    'erkennt %s',
    (s) => expect(ohneSupport(s)).toBe(true),
  );

  it.each(['magento 2', 'magento 2.4', 'magento ', 'shopware 6', 'shopware 6.5.8', 'oxid 6', 'oxid 7.1', 'woocommerce 5.0', 'jtl ', 'gambio '])(
    'lässt %s durch',
    (s) => expect(ohneSupport(s)).toBe(false),
  );
});

describe('Systemliste', () => {
  it('ordnet jeden Wappalyzer-Namen genau einem System zu', () => {
    const namen = SYSTEME.flatMap((s) => s.technik);
    expect(new Set(namen).size).toBe(namen.length);
  });

  it('hat eindeutige Schlüssel', () => {
    expect(new Set(SYSTEME.map((s) => s.id)).size).toBe(SYSTEME.length);
  });
});

describe('SQL', () => {
  it('filtert auf .de nur, wenn gewünscht', () => {
    expect(importSql({ nurDe: true })).toContain(`ENDS_WITH(NET.HOST(origin), '.de')`);
    expect(importSql({ nurDe: false })).not.toContain(`'.de'`);
  });

  it('schreibt in das angegebene Dataset', () => {
    expect(mergeSql('velonify-crm.leads', { nurDe: true })).toContain('MERGE `velonify-crm.leads.pool`');
    expect(historieSql('velonify-crm.leads', ['2020-01-01'])).toContain(`DATE '2020-01-01'`);
  });

  it('leitet jeden Vorab-Anlass in der View ab', () => {
    const view = prioViewSql('velonify-crm.leads');
    for (const anlass of Object.keys(VORAB_ANLAESSE)) expect(view).toContain(`'${anlass}'`);
  });
});
