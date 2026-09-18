import { beforeEach, describe, expect, it } from 'vitest';
import { auditVerlaufText, baueAuditAnfrage, befundeVon, firmaAbgleich, istVeraltet, neuesteAudits, zaehleBefunde, type AuditErgebnis } from './audit';
import type { CrmService } from './crm';
import { createDemoBackend } from './demo/seed';
import { DemoShopAudit } from './shopAudit';
import { EMPTY_FIRMA_INPUT, type Audit, type Firma } from './types';

const demo = new DemoShopAudit(0);
const ergebnis = (domain: string, leistungen: AuditErgebnis['aufhaenger'] = []) =>
  demo.pruefe({ domain, leistungen: leistungen.map((a) => ({ id: a.leistung_id, titel: a.text, beschreibung: '', anlass: '' })) });
const firma = (teil: Partial<Firma>): Firma => ({ ...EMPTY_FIRMA_INPUT, id: 'F-1', archiviert: false, erstellt_am: '', erstellt_von: '', geaendert_am: '', geaendert_von: '', ...teil });

describe('firmaAbgleich', () => {
  it('updates version and support status when the audit is sure', async () => {
    const e = await ergebnis('muster-shop.example');
    const abgleich = firmaAbgleich(firma({ plattform: e.plattform.name, version: '', eol: 'unknown' }), e);
    expect(abgleich?.changes).toEqual(e.plattform.name === 'magento2' ? { version: '2.4.6', eol: 'eol' } : { eol: 'eol' });
    expect(abgleich?.text).toMatch(/^Shop-Audit: /);
  });

  it('clears old version and support status when the shop has moved to another platform', async () => {
    const e = await ergebnis('muster-shop.example');
    const umgezogen: AuditErgebnis = { ...e, plattform: { name: 'shopify', version: '', edition: '', sicherheit: 95, eol: 'unknown', eol_datum: '' } };
    expect(firmaAbgleich(firma({ plattform: 'magento2', version: '2.4.6', eol: 'eol' }), umgezogen)).toEqual({
      changes: { plattform: 'shopify', version: '', eol: '' },
      text: 'Shop-Audit: Plattform magento2 → shopify, Version 2.4.6 → –, Support eol → –',
    });
  });

  it('never overwrites with an unknown platform or an unreachable shop', async () => {
    const e = await ergebnis('muster-shop.example');
    expect(firmaAbgleich(firma({ plattform: 'magento2' }), { ...e, plattform: { ...e.plattform, name: 'unbekannt' } })).toBeNull();
    expect(firmaAbgleich(firma({ plattform: 'magento2' }), { ...e, merkmale: null })).toBeNull();
    expect(firmaAbgleich(firma({ plattform: e.plattform.name, version: e.plattform.version === '1' ? '' : e.plattform.version, eol: 'eol' }), e)).toBeNull();
  });
});

describe('Hilfen', () => {
  it('sends only active services, capped in length', () => {
    const leistung = (id: string, archiviert = false) => ({ id, titel: `L ${id}`, beschreibung: 'x'.repeat(2000), anlass: '', nutzen: 'geheim', beleg: '', sortierung: 1, archiviert, erstellt_am: '', erstellt_von: '', geaendert_am: '', geaendert_von: '' });
    const anfrage = baueAuditAnfrage(' muster-shop.example ', [leistung('OL-1'), leistung('OL-2', true)]);
    expect(anfrage.domain).toBe('muster-shop.example');
    expect(anfrage.leistungen).toHaveLength(1);
    expect(anfrage.leistungen[0].beschreibung).toHaveLength(1000);
    expect(anfrage.leistungen[0]).not.toHaveProperty('nutzen');
  });

  it('writes a short history text', async () => {
    const e = await ergebnis('muster-shop.example');
    expect(auditVerlaufText(e)).toMatch(/^Shop-Audit \(Vollständig\) – .+ \d+ Befunde, davon \d+ hoch\.$/);
  });
});

describe('CrmService und Shop-Audit', () => {
  let service: CrmService;

  beforeEach(async () => {
    ({ service } = await createDemoBackend(() => 'test@velonify.de'));
  });

  it('stores an audit, logs it and updates the company', async () => {
    const db = await service.load();
    const bergwerk = db.firmen.find((f) => f.name.startsWith('Bergwerk'))!;
    const e = await ergebnis(bergwerk.domain);
    const audit = await service.speichereAudit(e, bergwerk.id);

    const audits = await service.loadAudits();
    expect(audits.find((a) => a.id === audit.id)).toMatchObject({ firma_id: bergwerk.id, domain: bergwerk.domain, von: 'test@velonify.de', score_mobil: e.mobil!.score });
    expect(befundeVon(audits.find((a) => a.id === audit.id)!)).toEqual(e.befunde);

    const nachher = await service.load();
    expect(nachher.aktivitaeten.some((a) => a.firma_id === bergwerk.id && a.text.startsWith('Shop-Audit ('))).toBe(true);
    const firmaNeu = nachher.firmen.find((f) => f.id === bergwerk.id)!;
    expect(firmaNeu.plattform).toBe(e.plattform.name);
  });

  it('stores audits of unknown domains and links them later', async () => {
    const audit = await service.speichereAudit(await ergebnis('neuer-shop.example'));
    expect(audit.firma_id).toBe('');
    const neu = await service.createFirma({ ...EMPTY_FIRMA_INPUT, name: 'Neuer Shop', domain: 'neuer-shop.example' });
    const verknuepft = await service.ordneAuditZu(audit.id, neu.id, audit.geaendert_am);
    expect(verknuepft.firma_id).toBe(neu.id);
  });

  it('refuses unknown companies before writing', async () => {
    await expect(service.speichereAudit(await ergebnis('x.example'), 'F-GIBTSNICHT')).rejects.toThrow();
    expect(await service.loadAudits()).toHaveLength(0);
  });
});

describe('neuesteAudits', () => {
  const audit = (teil: Partial<Audit>): Audit => ({
    id: 'SA-1', firma_id: '', domain: '', geprueft_am: '', von: '', status: 'ok', plattform: '', version: '', eol: '', score_mobil: null, score_desktop: null,
    lcp_mobil_ms: null, cls: null, inp_ms: null, messquelle: '', merkmale: '', befunde: '[{"schwere":"hoch"},{"schwere":"hinweis"}]', nicht_geprueft: '', zusammenfassung: '',
    aufhaenger: '', archiviert: false, erstellt_am: '', erstellt_von: '', geaendert_am: '', geaendert_von: '', ...teil,
  });

  it('keeps the newest per company and per domain, ignoring archived ones', () => {
    const neueste = neuesteAudits([
      audit({ id: 'a', firma_id: 'F-1', geprueft_am: '2026-09-01T10:00:00Z' }),
      audit({ id: 'b', firma_id: 'F-1', geprueft_am: '2026-09-10T10:00:00Z' }),
      audit({ id: 'c', firma_id: 'F-1', geprueft_am: '2026-09-15T10:00:00Z', archiviert: true }),
      audit({ id: 'd', domain: 'https://www.frei.example/', geprueft_am: '2026-09-02T10:00:00Z' }),
    ]);
    expect(neueste.get('F-1')?.id).toBe('b');
    expect(neueste.get('domain:frei.example')?.id).toBe('d');
  });

  it('counts findings by severity and knows when an audit is old', () => {
    expect(zaehleBefunde(audit({}))).toEqual({ hoch: 1, mittel: 0, hinweis: 1 });
    expect(zaehleBefunde(audit({ befunde: 'kaputt' }))).toEqual({ hoch: 0, mittel: 0, hinweis: 0 });
    const jetzt = new Date('2026-09-18T12:00:00Z');
    expect(istVeraltet(audit({ geprueft_am: '2026-08-01T12:00:00Z' }), jetzt)).toBe(true);
    expect(istVeraltet(audit({ geprueft_am: '2026-09-01T12:00:00Z' }), jetzt)).toBe(false);
  });
});
