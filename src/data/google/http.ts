import { AuthExpiredError, GoogleApiError } from '../errors';

export type TokenProvider = () => Promise<string>;

/** Turns an HTTP status and Google's own message into something a colleague can act on. */
export type ErrorDescriber = (status: number, googleMessage: string) => string;

export async function googleRequest<T>(getToken: TokenProvider, url: string, init: RequestInit, describe: ErrorDescriber): Promise<T> {
  const token = await getToken();
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new GoogleApiError(0, 'Google ist nicht erreichbar. Besteht eine Internetverbindung?');
  }
  if (response.status === 401) throw new AuthExpiredError();
  if (!response.ok) {
    const body = await response.text();
    let googleMessage = body.slice(0, 300);
    try {
      googleMessage = JSON.parse(body)?.error?.message ?? googleMessage;
    } catch {
      // not JSON – keep the raw text
    }
    const message =
      response.status === 429
        ? 'Zu viele Anfragen an Google in kurzer Zeit. Bitte einen Moment warten und erneut versuchen.'
        : describe(response.status, googleMessage);
    throw new GoogleApiError(response.status, message, googleMessage);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const missingScope = (googleMessage: string) => /insufficient|scope/i.test(googleMessage);
