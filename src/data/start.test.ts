import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo/seed';
import { firmenLinks, schnellzugriff, slackChannelUrl } from './start';

describe('start page', () => {
  it('lists only valid company links and falls back to the Slack workspace', () => {
    expect(firmenLinks({})).toEqual([{ label: 'Slack', url: 'https://velonify.slack.com' }]);
    expect(firmenLinks({ link_drive: ' https://drive.google.com/drive/folders/abc ', link_notion: 'notion.so/velonify', link_slack: 'https://team.slack.com' })).toEqual([
      { label: 'Google Drive', url: 'https://drive.google.com/drive/folders/abc' },
      { label: 'Slack', url: 'https://team.slack.com' },
    ]);
  });

  it('builds Slack channel links from the channel name', () => {
    expect(slackChannelUrl({}, '#client-sb-general')).toBe('https://velonify.slack.com/app_redirect?channel=client-sb-general');
    expect(slackChannelUrl({ link_slack: 'https://team.slack.com/' }, 'ops')).toBe('https://team.slack.com/app_redirect?channel=ops');
  });

  it('shows customers first, then leads with an open offer', async () => {
    const { service } = await createDemoBackend(() => 'test@velonify.de');
    const db = await service.load();
    expect(schnellzugriff(db).map((s) => [s.firma.name, s.art])).toEqual([
      ['Alpenglanz Kosmetik AG', 'kunde'],
      ['Nordlicht Outdoor GmbH', 'angebot'],
    ]);
  });
});
