import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudShopAudit } from './shopAudit';

const ERGEBNIS = { domain: 'muster-shop.example', befunde: [] };
const json = (daten: unknown, status = 200) => new Response(JSON.stringify(daten), { status });
const abgebrochen = () => new Response('   {"domain":', { status: 200 });

function api(antworten: (() => Response | Promise<Response>)[]) {
  const aufrufe: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    aufrufe.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    const naechste = antworten.shift();
    if (!naechste) throw new Error('unerwarteter Aufruf');
    return naechste();
  });
  const audit = new CloudShopAudit('https://audit.example/shop-audit', async () => 'token', async () => {});
  return { audit, aufrufe };
}

afterEach(() => vi.unstubAllGlobals());

describe('CloudShopAudit.pruefe', () => {
  it('returns the result and sends an order id', async () => {
    const { audit, aufrufe } = api([() => json(ERGEBNIS)]);
    await expect(audit.pruefe({ domain: 'muster-shop.example', leistungen: [] })).resolves.toEqual(ERGEBNIS);
    expect(aufrufe[0].body.auftrag).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('fetches the stored result when the answer breaks off', async () => {
    const { audit, aufrufe } = api([abgebrochen, () => json({ laeuft: true }), () => json(ERGEBNIS)]);
    await expect(audit.pruefe({ domain: 'muster-shop.example', leistungen: [] })).resolves.toEqual(ERGEBNIS);
    expect(aufrufe.slice(1).map((a) => a.url)).toEqual(['https://audit.example/shop-audit/ergebnis', 'https://audit.example/shop-audit/ergebnis']);
    expect(aufrufe[1].body).toEqual({ auftrag: aufrufe[0].body.auftrag });
  });

  it('also asks after a network error and keeps asking through one', async () => {
    const netz = () => Promise.reject(new TypeError('Failed to fetch'));
    const { audit } = api([netz, netz, () => json(ERGEBNIS)]);
    await expect(audit.pruefe({ domain: 'muster-shop.example', leistungen: [] })).resolves.toEqual(ERGEBNIS);
  });

  it('reports a stored error', async () => {
    const { audit } = api([abgebrochen, () => json({ fehler: 'Die Prüfung ist unerwartet fehlgeschlagen.' })]);
    await expect(audit.pruefe({ domain: 'muster-shop.example', leistungen: [] })).rejects.toThrow('unerwartet fehlgeschlagen');
  });

  it('does not ask again after a real error answer', async () => {
    const { audit, aufrufe } = api([() => json({ fehler: 'Zu viele Prüfungen in kurzer Zeit.' }, 429)]);
    await expect(audit.pruefe({ domain: 'muster-shop.example', leistungen: [] })).rejects.toThrow('Zu viele Prüfungen');
    expect(aufrufe).toHaveLength(1);
  });
});
