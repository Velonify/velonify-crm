import { AuthExpiredError, SheetsApiError } from '../errors';

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

/** Minimal surface the tables and setup need – lets tests swap in a fake. */
export interface SheetsApi {
  getValues(range: string): Promise<unknown[][]>;
  updateValues(range: string, values: unknown[][]): Promise<void>;
  appendValues(range: string, values: unknown[][]): Promise<void>;
  getSpreadsheet(): Promise<SpreadsheetInfo>;
  batchUpdate(requests: unknown[]): Promise<void>;
}

export const quoteTab = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

function describeHttpError(status: number, body: string): string {
  let googleMessage = '';
  try {
    googleMessage = JSON.parse(body)?.error?.message ?? '';
  } catch {
    googleMessage = body.slice(0, 200);
  }
  if (status === 403) return `Kein Zugriff auf das CRM-Sheet. Ist es für dein Konto freigegeben? (${googleMessage})`;
  if (status === 404) return 'CRM-Sheet nicht gefunden. Stimmt die SPREADSHEET_ID?';
  if (status === 429) return 'Zu viele Anfragen an Google in kurzer Zeit. Bitte einen Moment warten und erneut versuchen.';
  return `Google Sheets meldet einen Fehler (${status}): ${googleMessage}`;
}

export class SheetsClient implements SheetsApi {
  private readonly spreadsheetId: string;
  private readonly getToken: () => Promise<string>;

  constructor(spreadsheetId: string, getToken: () => Promise<string>) {
    this.spreadsheetId = spreadsheetId;
    this.getToken = getToken;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getToken();
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/${encodeURIComponent(this.spreadsheetId)}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
      });
    } catch {
      throw new SheetsApiError(0, 'Google Sheets ist nicht erreichbar. Besteht eine Internetverbindung?');
    }
    if (response.status === 401) throw new AuthExpiredError();
    if (!response.ok) throw new SheetsApiError(response.status, describeHttpError(response.status, await response.text()));
    return (await response.json()) as T;
  }

  async getValues(range: string): Promise<unknown[][]> {
    const data = await this.request<{ values?: unknown[][] }>(
      `/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`,
    );
    return data.values ?? [];
  }

  // RAW everywhere: input like "=HYPERLINK(...)" from a CSV is stored as text, never evaluated as a formula.
  async updateValues(range: string, values: unknown[][]): Promise<void> {
    await this.request(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ range, values }),
    });
  }

  async appendValues(range: string, values: unknown[][]): Promise<void> {
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
