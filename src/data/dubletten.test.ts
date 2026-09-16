import { describe, expect, it } from 'vitest';
import { dublettenIndex, findeDubletten } from './dubletten';
import { parseCsv, planeImport } from './importCsv';
import { EMPTY_FIRMA_INPUT, type Database, type Firma } from './types';

const firma = (id: string, felder: Partial<Firma>): Firma =>
  ({ ...EMPTY_FIRMA_INPUT, id, archiviert: false, erstellt_am: '', erstellt_von: '', geaendert_am: '', geaendert_von: '', ...felder }) as Firma;

// Invented example of one company running two shop domains.
const gruenwerkDe = firma('F-1', {
  name: 'Grünwerk Pflanzen GmbH & Co. KG', domain: 'gruenwerk.example', ust_id: 'DE 999 000 111', register: 'HRA 7159 (AG Würzburg)', email_allgemein: 'info@gruenwerk.example',
});

describe('findeDubletten', () => {
  it('finds the same company under another domain by VAT ID, register, name and e-mail domain', () => {
    const eu = { name: 'Grünwerk Pflanzen GmbH & Co. KG', domain: 'gruenwerk.example.eu', ust_id: 'DE999000111', register: 'HRA 7159', email_allgemein: 'info@gruenwerk.example' };
    const [treffer] = findeDubletten(eu, [gruenwerkDe]);
    expect(treffer.firma.id).toBe('F-1');
    expect(treffer.gruende).toEqual(['gleiche USt-ID', 'gleiche Handelsregisternummer', 'gleicher Name', 'gleiche E-Mail-/Web-Domain']);
  });

  it('matches an e-mail address against another firm\'s website domain', () => {
    const treffer = findeDubletten({ name: 'Anders', domain: 'anderer-shop.example', ust_id: '', register: '', email_allgemein: 'shop@gruenwerk.example' }, [gruenwerkDe]);
    expect(treffer[0].gruende).toEqual(['gleiche E-Mail-/Web-Domain']);
  });

  it('does not flag the same register number at another court, freemail addresses or itself', () => {
    const andereStadt = { name: 'Zufall AG', domain: 'zufall.example', ust_id: '', register: 'HRA 7159 (Amtsgericht Kiel)', email_allgemein: 'zufall@gmail.com' };
    const gmail = { name: 'Noch Einer', domain: 'noch.example', ust_id: '', register: '', email_allgemein: 'noch@gmail.com' };
    expect(findeDubletten(andereStadt, [gruenwerkDe, firma('F-2', gmail)])).toEqual([]);
    expect(findeDubletten({ ...gruenwerkDe }, [gruenwerkDe])).toEqual([]);
  });

  it('ignores names that are only the domain (import fallback)', () => {
    const a = firma('F-3', { name: 'pumpen24.example', domain: 'pumpen24.example' });
    expect(findeDubletten({ name: 'pumpen24.example', domain: 'pumpen24-shop.example', ust_id: '', register: '', email_allgemein: '' }, [a])).toEqual([]);
  });

  it('indexes duplicates among active firms only', () => {
    const eu = firma('F-4', { name: 'Grünwerk Pflanzen', domain: 'gruenwerk.example.eu', ust_id: 'DE999000111' });
    const archiviert = firma('F-5', { name: 'Grünwerk Pflanzen', domain: 'gruenwerk-alt.example', archiviert: true });
    const index = dublettenIndex([gruenwerkDe, eu, archiviert, firma('F-6', { name: 'Solo', domain: 'solo.example' })]);
    expect([...index.keys()].sort()).toEqual(['F-1', 'F-4']);
    expect(index.get('F-4')![0].gruende).toEqual(['gleiche USt-ID', 'gleicher Name']);
  });
});

describe('Import mit Dublettenprüfung', () => {
  const db: Database = { firmen: [gruenwerkDe], kontakte: [], deals: [], aktivitaeten: [], wiedervorlagen: [], listen: {}, einstellungen: {} };
  const csv = [
    'tier,score,domain,firma,ust_id,email',
    'A,90,gruenwerk.example.eu,Grünwerk Pflanzen GmbH & Co. KG,DE999000111,info@gruenwerk.example',
    'A,80,blau.example,Blau Handel GmbH,DE111222333,info@blau.example',
    'B,60,blau.example.at,Blau Handel GmbH,DE111222333,office@blau.example.at',
  ].join('\n');
  const optionen = { tiers: ['A', 'B'], zustaendig: '', dealAnlegen: true, dealTitel: '' };

  it('holds back possible duplicates of existing firms and of earlier rows in the same file', () => {
    const plan = planeImport(parseCsv(csv), db, optionen);
    expect(plan.zeilen.map((z) => z.aktion)).toEqual(['dublette', 'neu', 'dublette']);
    expect(plan.zeilen[0].dubletteVon).toEqual({ firmaId: 'F-1', name: 'Grünwerk Pflanzen GmbH & Co. KG' });
    expect(plan.zeilen[0].hinweis).toMatch(/^Mögliche Dublette von Grünwerk .*gleiche USt-ID/);
    expect(plan.zeilen[2].hinweis).toMatch(/weiter oben in der Datei/);
  });

  it('imports them anyway when asked, keeping the warning', () => {
    const plan = planeImport(parseCsv(csv), db, { ...optionen, dublettenImportieren: true });
    expect(plan.zeilen.map((z) => z.aktion)).toEqual(['neu', 'neu', 'neu']);
    expect(plan.zeilen[0].dubletteVon?.firmaId).toBe('F-1');
  });
});
