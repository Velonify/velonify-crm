import { describe, expect, it } from 'vitest';
import { slackBenachrichtiger, slackNutzerFuer, slackText } from './slack';
import type { Erwaehnung } from './types';

const NUTZER = [
  { id: 'U1', profile: { email: 'lukas@velonify.de', real_name: 'Lukas Hanke', first_name: 'Lukas' } },
  { id: 'U2', profile: { email: 'julian@velonify.de', real_name: 'Julian Beispiel', first_name: 'Julian' } },
  { id: 'U3', deleted: true, profile: { email: 'johannes@velonify.de', real_name: 'Johannes' } },
  { id: 'B1', is_bot: true, profile: { real_name: 'Julian Bot' } },
];
const ZUORDNUNG = new Map([['lukas@velonify.de', 'Lugge']]);

const erwaehnung = (extra: Partial<Erwaehnung> = {}): Erwaehnung => ({
  id: 'ER-1', person: 'Julian', von: 'lukas@velonify.de', datum: '2026-10-16T10:00:00Z', art: 'kommentar', quelle_id: 'TK-1', aufgabe_id: 'T-1', firma_id: '',
  titel: 'Banner <neu>', auszug: '@Julian bitte & danke', link: '/todo/B-1?karte=T-1', gelesen_am: '', ...extra,
});

describe('Slack notifications', () => {
  it('finds the Slack member of a team name by the fixed mapping or by name and address', () => {
    expect(slackNutzerFuer('Lugge', NUTZER, ZUORDNUNG)?.id).toBe('U1');
    expect(slackNutzerFuer('Julian', NUTZER, ZUORDNUNG)?.id).toBe('U2');
    expect(slackNutzerFuer('Johannes', NUTZER, ZUORDNUNG)).toBeUndefined();
    expect(slackNutzerFuer('Lugge', NUTZER)).toBeUndefined();
  });

  it('escapes text and links to the hub', () => {
    expect(slackText(erwaehnung(), 'Lukas', 'https://crm.velonify.de/')).toBe(
      '*Lukas* hat dich erwähnt · Kommentar: *Banner &lt;neu&gt;*\n> @Julian bitte &amp; danke\n<https://crm.velonify.de/#/todo/B-1?karte=T-1|Im Velonify Hub öffnen>',
    );
  });

  it('sends one direct message per mention with the Slack name of the writer, and skips unknown people', async () => {
    const aufrufe: { url: string; body?: Record<string, unknown> }[] = [];
    const fetchStub = (async (url: string, init?: RequestInit) => {
      aufrufe.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const daten = url.includes('users.list') ? { ok: true, members: NUTZER } : { ok: true };
      return new Response(JSON.stringify(daten));
    }) as typeof fetch;
    const senden = slackBenachrichtiger({ token: 'xoxb-test', hub: 'https://crm.velonify.de', teamZuordnung: ZUORDNUNG, fetch: fetchStub });
    await senden([erwaehnung(), erwaehnung({ id: 'ER-2', person: 'Johannes' }), erwaehnung({ id: 'ER-3', link: 'https://boese.example' })]);
    await senden([erwaehnung({ id: 'ER-4', person: 'Lugge', von: 'julian@velonify.de' })]);
    expect(aufrufe.filter((a) => a.url.includes('users.list'))).toHaveLength(1);
    const nachrichten = aufrufe.filter((a) => a.url.endsWith('chat.postMessage')).map((a) => [a.body?.channel, String(a.body?.text).split(' hat')[0]]);
    expect(nachrichten).toEqual([['U2', '*Lukas*'], ['U1', '*Julian*']]);
  });

  it('reports Slack errors', async () => {
    const fetchStub = (async () => new Response(JSON.stringify({ ok: false, error: 'invalid_auth' }))) as unknown as typeof fetch;
    await expect(slackBenachrichtiger({ token: 'x', hub: 'h', fetch: fetchStub })([erwaehnung()])).rejects.toThrow(/invalid_auth/);
  });
});
