// Google Identity Services (token model): the browser gets a short-lived access token, no backend involved.

interface TokenResponse {
  access_token: string;
  expires_in: number | string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void;
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    hd?: string;
    login_hint?: string;
    include_granted_scopes?: boolean;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type: string; message?: string }) => void;
  }): TokenClient;
  hasGrantedAllScopes(response: TokenResponse, ...scopes: string[]): boolean;
  revoke(token: string, done?: () => void): void;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

export interface TokenInfo {
  accessToken: string;
  expiresAt: number;
}

export interface GoogleUser {
  email: string;
  name: string;
  picture?: string;
}

let scriptPromise: Promise<void> | null = null;

export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Google-Anmeldung konnte nicht geladen werden. Blockiert ein Werbe- oder Trackingblocker accounts.google.com?'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Opens the Google popup. Must be called synchronously from a click handler (after loadGoogleIdentity resolved),
 * otherwise browsers block the popup.
 */
export function requestToken(options: { clientId: string; scopes: string[]; domain: string; loginHint?: string }): Promise<TokenInfo> {
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) return Promise.reject(new Error('Google-Anmeldung ist noch nicht geladen. Bitte kurz warten.'));

  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: options.clientId,
      scope: options.scopes.join(' '),
      hd: options.domain,
      login_hint: options.loginHint,
      include_granted_scopes: true,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || `Anmeldung fehlgeschlagen (${response.error}).`));
          return;
        }
        const apiScopes = options.scopes.filter((scope) => scope.startsWith('https://'));
        if (!oauth2.hasGrantedAllScopes(response, ...apiScopes)) {
          oauth2.revoke(response.access_token);
          reject(new Error('Bitte bei der Anmeldung alle Berechtigungen erlauben – ohne Zugriff auf Google Sheets kann das CRM keine Daten laden.'));
          return;
        }
        resolve({
          accessToken: response.access_token,
          // Renew a minute early so a request never goes out with a token that expires mid-flight.
          expiresAt: Date.now() + (Number(response.expires_in) - 60) * 1000,
        });
      },
      error_callback: (error) => {
        reject(new Error(error.type === 'popup_closed' ? 'Anmeldung abgebrochen.' : error.message || 'Anmeldung fehlgeschlagen.'));
      },
    });
    client.requestAccessToken({ prompt: options.loginHint ? '' : 'select_account' });
  });
}

export async function fetchGoogleUser(accessToken: string): Promise<GoogleUser> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('Google-Profil konnte nicht geladen werden.');
  const data = (await response.json()) as { email?: string; name?: string; picture?: string };
  return { email: data.email ?? '', name: data.name ?? data.email ?? '', picture: data.picture };
}

export function revokeToken(accessToken: string): void {
  window.google?.accounts?.oauth2?.revoke(accessToken);
}
