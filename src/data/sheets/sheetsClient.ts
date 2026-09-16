import { GoogleApiError, SchemaError } from '../errors';
import { googleRequest, type TokenProvider } from '../google/http';

const BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface SheetProperties {
  sheetId: number;
  title: string;
  gridProperties?: { rowCount?: number; columnCount?: number; frozenRowCount?: number };
}

export interface SpreadsheetInfo {
  properties?: { title?: string };
  sheets?: { properties: SheetProperties; protectedRanges?: { protectedRangeId: number }[] }[];
}

export interface ValueWrite {
  range: string;
  values: unknown[][];
}

/** The subset of the Sheets API the app uses. Implemented by Google and by the in-memory demo sheet. */
export interface SheetsApi {
  getValues(range: string): Promise<unknown[][]>;
  batchGetValues(ranges: string[]): Promise<unknown[][][]>;
  updateValues(range: string, values: unknown[][]): Promise<void>;
  batchUpdateValues(data: ValueWrite[]): Promise<void>;
  appendValues(range: string, values: unknown[][]): Promise<void>;
  getSpreadsheet(): Promise<SpreadsheetInfo>;
  batchUpdate(requests: unknown[]): Promise<void>;
}

export const quoteTab = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

function describe(status: number, googleMessage: string): string {
  if (status === 403) return `Kein Zugriff auf das CRM-Sheet. Ist es für dein Konto freigegeben? (${googleMessage})`;
  if (status === 404) return 'CRM-Sheet nicht gefunden. Stimmt die SPREADSHEET_ID?';
  return `Google Sheets meldet einen Fehler (${status}): ${googleMessage}`;
}

export class SheetsClient implements SheetsApi {
  private readonly spreadsheetId: string;
  private readonly getToken: TokenProvider;

  constructor(spreadsheetId: string, getToken: TokenProvider) {
    this.spreadsheetId = spreadsheetId;
    this.getToken = getToken;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    try {
      return await googleRequest<T>(this.getToken, `${BASE_URL}/${encodeURIComponent(this.spreadsheetId)}${path}`, init, describe);
    } catch (error) {
      // Reading a tab that does not exist yet.
      if (error instanceof GoogleApiError && error.status === 400 && /Unable to parse range/i.test(error.googleMessage)) {
        throw new SchemaError();
      }
      throw error;
    }
  }

  async getValues(range: string): Promise<unknown[][]> {
    const data = await this.request<{ values?: unknown[][] }>(`/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`);
    return data.values ?? [];
  }

  async batchGetValues(ranges: string[]): Promise<unknown[][][]> {
    const query = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
    const data = await this.request<{ valueRanges?: { values?: unknown[][] }[] }>(
      `/values:batchGet?${query}&valueRenderOption=UNFORMATTED_VALUE`,
    );
    return ranges.map((_, i) => data.valueRanges?.[i]?.values ?? []);
  }

  // RAW everywhere: input like "=HYPERLINK(...)" from a CSV is stored as text, never evaluated as a formula.
  async updateValues(range: string, values: unknown[][]): Promise<void> {
    await this.request(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ range, values }),
    });
  }

  async batchUpdateValues(data: ValueWrite[]): Promise<void> {
    if (data.length === 0) return;
    await this.request('/values:batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data }),
    });
  }

  async appendValues(range: string, values: unknown[][]): Promise<void> {
    if (values.length === 0) return;
    await this.request(`/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({ values }),
    });
  }

  getSpreadsheet(): Promise<SpreadsheetInfo> {
    const fields = 'properties(title),sheets(properties(sheetId,title,gridProperties),protectedRanges(protectedRangeId))';
    return this.request<SpreadsheetInfo>(`?fields=${encodeURIComponent(fields)}`);
  }

  async batchUpdate(requests: unknown[]): Promise<void> {
    if (requests.length === 0) return;
    await this.request(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) });
  }
}
