import { LISTEN_DEFAULTS, SCHEMA, type TabSchema } from '../schema';
import { columnLetter } from './rows';
import { quoteTab, type SheetsApi, type SpreadsheetInfo } from './sheetsClient';

export interface TabStatus {
  name: string;
  exists: boolean;
  missingColumns: string[];
  isProtected: boolean;
}

export interface SetupStatus {
  spreadsheetTitle: string;
  tabs: TabStatus[];
  listenRows: number;
  ready: boolean;
}

const TABS: TabSchema[] = Object.values(SCHEMA);
const PROTECTION_NOTE = 'Bitte nur über das CRM bearbeiten – sonst können Daten kaputtgehen.';

/** Header cells up to the last non-empty one. */
function headerAus(werte: unknown[][]): string[] {
  const [row = []] = werte;
  const header = row.map((cell) => String(cell ?? '').trim());
  while (header.length > 0 && header[header.length - 1] === '') header.pop();
  return header;
}

/**
 * First row of every named tab in a single request. Asking tab by tab used to run into Google's rate limit
 * on sheets with many tabs.
 */
async function readHeaders(api: SheetsApi, tabs: string[]): Promise<Map<string, string[]>> {
  if (tabs.length === 0) return new Map();
  const werte = await api.batchGetValues(tabs.map((tab) => `${quoteTab(tab)}!1:1`));
  return new Map(tabs.map((tab, i) => [tab, headerAus(werte[i] ?? [])]));
}

function findSheet(info: SpreadsheetInfo, title: string) {
  return info.sheets?.find((sheet) => sheet.properties.title === title);
}

export async function checkSetup(api: SheetsApi): Promise<SetupStatus> {
  const info = await api.getSpreadsheet();
  const vorhanden = TABS.filter((tab) => findSheet(info, tab.name));
  const header = await readHeaders(api, vorhanden.map((tab) => tab.name));

  const tabs: TabStatus[] = TABS.map((tab) => {
    const sheet = findSheet(info, tab.name);
    if (!sheet) return { name: tab.name, exists: false, missingColumns: [...tab.columns], isProtected: false };
    const spalten = header.get(tab.name) ?? [];
    return {
      name: tab.name,
      exists: true,
      missingColumns: tab.columns.filter((column) => !spalten.includes(column)),
      isProtected: (sheet.protectedRanges?.length ?? 0) > 0,
    };
  });

  const listenTab = findSheet(info, SCHEMA.listen.name);
  const listenRows = listenTab ? Math.max(0, (await api.getValues(`${quoteTab(SCHEMA.listen.name)}!A2:A`)).length) : 0;

  return {
    spreadsheetTitle: info.properties?.title ?? '',
    tabs,
    listenRows,
    ready: tabs.every((t) => t.exists && t.missingColumns.length === 0),
  };
}

/**
 * Creates missing tabs, appends missing header columns (never reorders or removes existing ones),
 * fills the "listen" tab with defaults if it is empty and adds a warning-only protection per tab.
 * Safe to run repeatedly.
 */
export async function runSetup(api: SheetsApi): Promise<void> {
  const before = await api.getSpreadsheet();
  await api.batchUpdate(
    TABS.filter((tab) => !findSheet(before, tab.name)).map((tab) => ({
      addSheet: {
        properties: {
          title: tab.name,
          gridProperties: { rowCount: 1000, columnCount: Math.max(26, tab.columns.length), frozenRowCount: 1 },
        },
      },
    })),
  );

  const info = await api.getSpreadsheet();
  const structureRequests: unknown[] = [];
  const headerWrites: { range: string; values: string[][] }[] = [];
  const headers = await readHeaders(api, TABS.map((tab) => tab.name));

  for (const tab of TABS) {
    const sheet = findSheet(info, tab.name);
    if (!sheet) throw new Error(`Tabellenblatt „${tab.name}“ konnte nicht angelegt werden.`);
    const { sheetId, gridProperties } = sheet.properties;

    const header = headers.get(tab.name) ?? [];
    const missing = tab.columns.filter((column) => !header.includes(column));
    if (missing.length > 0) {
      const needed = header.length + missing.length;
      const available = gridProperties?.columnCount ?? 26;
      if (needed > available) {
        structureRequests.push({ appendDimension: { sheetId, dimension: 'COLUMNS', length: needed - available } });
      }
      const start = columnLetter(header.length + 1);
      const end = columnLetter(needed);
      headerWrites.push({ range: `${quoteTab(tab.name)}!${start}1:${end}1`, values: [missing] });
    }

    structureRequests.push(
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: 'userEnteredFormat.textFormat.bold',
        },
      },
      { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
    );
    if ((sheet.protectedRanges?.length ?? 0) === 0) {
      structureRequests.push({
        addProtectedRange: { protectedRange: { range: { sheetId }, warningOnly: true, description: PROTECTION_NOTE } },
      });
    }
  }

  await api.batchUpdate(structureRequests);
  // All header rows in one write: one request per tab ran into Google's rate limit.
  await api.batchUpdateValues(headerWrites);

  const listenTab = quoteTab(SCHEMA.listen.name);
  const listenRows = await api.getValues(`${listenTab}!A2:A`);
  if (listenRows.length === 0) {
    const header = headerAus(await api.getValues(`${listenTab}!1:1`));
    const rows = Object.entries(LISTEN_DEFAULTS).flatMap(([liste, werte]) =>
      werte.map((wert) => header.map((column) => (column === 'liste' ? liste : column === 'wert' ? wert : ''))),
    );
    await api.appendValues(`${listenTab}!A1`, rows);
  }
}
