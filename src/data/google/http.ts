import { AuthExpiredError, GoogleApiError } from '../errors';

export type TokenProvider = () => Promise<string>;

/** Turns an HTTP status and Google's own message into something a colleague can act on. */
export type ErrorDescriber = (status: number, googleMessage: string) => string;

/** Waits between retries: Google answers 429 when several views load at once. */
const WARTEZEITEN = [700, 1800, 3600];
const warte = (ms: number) => new Promise((fertig) => setTimeout(fertig, ms));

export async function googleRequest<T>(getToken: TokenProvider, url: string, init: RequestInit, describe: ErrorDescriber): Promise<T> {
  for (let versuch = 0; ; versuch++) {
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
      // Too many requests or a hiccup on Google's side: wait a moment and try again instead of bothering the user.
      if ((response.status === 429 || response.status >= 500) && versuch < WARTEZEITEN.length) {
        await warte(WARTEZEITEN[versuch] + Math.random() * 300);
        continue;
      }
      const body = await response.text();
      let googleMessage = body.slice(0, 300);
      try {
        googleMessage = JSON.parse(body)?.error?.message ?? googleMessage;
      } catch {
        // not JSON – keep the raw text
      }
      const message =
        response.status === 429
          ? 'Google lässt gerade keine weiteren Anfragen zu. Bitte einen Moment warten und die Seite neu laden.'
          : describe(response.status, googleMessage);
      throw new GoogleApiError(response.status, message, googleMessage);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

export const missingScope = (googleMessage: string) => /insufficient|scope/i.test(googleMessage);
