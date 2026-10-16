import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DemoGenerator } from '../../../src/data/contactGenerator';
import type { CrmService } from '../../../src/data/crm';
import { createDemoBackend } from '../../../src/data/demo/seed';
import { DemoLeadFinder } from '../../../src/data/demo/leadFinderDemo';
import { isoDate } from '../../../src/data/ids';
import { DemoLinkedin } from '../../../src/data/linkedin';
import { DemoShopAudit } from '../../../src/data/shopAudit';
import type { Dienste } from './hilfen';
import { ANLEITUNG, registriereWerkzeuge } from './werkzeuge';

/** Demo versions of the Cloud Functions, without waiting. */
export const demoDienste = (): Dienste => ({
  generator: new DemoGenerator(),
  shopAudit: new DemoShopAudit(0),
  leadFinder: new DemoLeadFinder(0),
  linkedin: new DemoLinkedin(0),
});

export interface Verbunden {
  service: CrmService;
  client: Client;
  /** Calls a tool; `daten` is the parsed JSON answer, null on errors (then `text` holds the message). */
  rufe: (name: string, args?: Record<string, unknown>) => Promise<{ fehler: boolean; text: string; daten: any }>;
}

/** A server on the demo backend with a connected client, signed in as the given person. */
export async function verbinde(
  email = 'lugge@velonify.de',
  name = 'Lugge Muster',
  optionen: { teamName?: string; dienste?: Dienste; setzeListe?: (liste: string, werte: string[]) => Promise<void> } = {},
): Promise<Verbunden> {
  const { service } = await createDemoBackend(() => email);
  const server = new McpServer({ name: 'velonify-crm', version: 'test' }, { instructions: ANLEITUNG });
  registriereWerkzeuge(server, {
    service,
    person: { email, name },
    teamName: optionen.teamName,
    heute: () => isoDate(new Date()),
    dienste: optionen.dienste ?? demoDienste(),
    setzeListe: optionen.setzeListe,
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const rufe = async (werkzeug: string, args: Record<string, unknown> = {}) => {
    const ergebnis = await client.callTool({ name: werkzeug, arguments: args });
    const text = (ergebnis.content as { type: string; text: string }[])[0].text;
    return { fehler: Boolean(ergebnis.isError), text, daten: ergebnis.isError ? null : JSON.parse(text) };
  };
  return { service, client, rufe };
}
