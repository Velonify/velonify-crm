import { describe, expect, it } from 'vitest';
import { createDemoBackend } from '../../../src/data/demo/seed';
import { SheetStore } from '../../../src/data/sheets/sheetStore';
import type { KundenNews } from '../../../src/data/types';
import { versende } from './versand';

async function aufbau() {
  const { sheets } = await createDemoBackend(() => 'lukas@velonify.de');
  const store = new SheetStore(sheets);
  const mails: { an: string; betreff: string }[] = [];
  const slack: { channel: string; text: string }[] = [];
  const lauf = (zeit: string) =>
    versende({
      store,
      dateien: async () => [],
      sendeMail: async (an, betreff) => void mails.push({ an, betreff }),
      slack: async (channel, text) => void slack.push({ channel, text }),
      portalUrl: 'https://kunden.velonify.de',
      teamDomain: 'velonify.de',
      jetzt: new Date(zeit),
    });
  const zugang = async () => (await store.loadPortalDaten()).zugaenge.find((z) => z.aktiv)!;
  const neuigkeit = async (titel: string, erstellt_am: string) => {
    const { news } = await store.loadKundenDaten();
    const z = await zugang();
    await store.insert('kunden_news', [{ ...news[0], id: `N-${titel}`, firma_id: z.firma_id, titel, art: 'update', sichtbar_kunde: true, archiviert: false, erstellt_am } as KundenNews]);
  };
  return { store, mails, slack, lauf, zugang, neuigkeit };
}

describe('versende', () => {
  it('starts the clock on the first run, then notifies once per event and sends the weekly update on Monday', async () => {
    const { mails, lauf, zugang, neuigkeit } = await aufbau();
    // Monday 08:30 in Berlin: the weekly update is due, notifications only start.
    const erster = await lauf('2026-10-19T06:30:00Z');
    expect(erster.hinweise).toBe(0);
    expect(mails.map((m) => m.betreff)).toEqual([expect.stringMatching(/^Dein Wochen-Update · /)]);
    expect(await zugang()).toMatchObject({ hinweise_bis: '2026-10-19T06:30:00.000Z', update_am: '2026-10-19T06:30:00.000Z' });

    await neuigkeit('Shop ist schneller', '2026-10-19T06:40:00.000Z');
    const zweiter = await lauf('2026-10-19T06:45:00Z');
    expect(zweiter).toEqual({ hinweise: 1, updates: 0, fehler: 0 });
    expect(mails[1].betreff).toBe('Neuigkeit: Shop ist schneller');

    // Nothing new: nothing sent.
    await lauf('2026-10-19T07:00:00Z');
    expect(mails).toHaveLength(2);
  });

  it('posts into the client’s Slack channel instead of mailing when the contact chose Slack', async () => {
    const { store, mails, slack, lauf, zugang, neuigkeit } = await aufbau();
    await lauf('2026-10-20T06:30:00Z');
    await store.update('portal_zugaenge', [{ id: (await zugang()).id, changes: { kanal_hinweise: 'slack', updates: 'aus' } }]);
    await neuigkeit('Neue Kategorie live', '2026-10-20T06:40:00.000Z');
    await lauf('2026-10-20T06:45:00Z');
    expect(mails).toHaveLength(0);
    expect(slack).toHaveLength(1);
    expect(slack[0].channel).toBe('client-agk-general');
    expect(slack[0].text).toContain('Neue Kategorie live');
  });
});
