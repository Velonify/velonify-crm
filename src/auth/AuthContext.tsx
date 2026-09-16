import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { config, GOOGLE_SCOPES, isDemo } from '../config';
import { AuthExpiredError } from '../data/errors';
import { fetchGoogleUser, loadGoogleIdentity, requestToken, revokeToken, type GoogleUser, type TokenInfo } from './google';

export type AuthState =
  | { status: 'demo'; user: GoogleUser }
  | { status: 'signedOut'; error?: string }
  | { status: 'signedIn'; user: GoogleUser }
  /** Token ran out while working. The app stays mounted so unsaved input survives the re-login. */
  | { status: 'expired'; user: GoogleUser; error?: string };

interface AuthContextValue {
  state: AuthState;
  googleReady: boolean;
  signIn(): Promise<void>;
  signOut(): void;
  expire(): void;
  getToken(): Promise<string>;
  userEmail(): string;
}

interface StoredSession {
  token: TokenInfo;
  user: GoogleUser;
}

const DEMO_USER: GoogleUser = { email: 'demo@velonify.de', name: 'Demo' };
// sessionStorage: survives a reload, but ends with the browser tab. The token itself expires after an hour anyway.
const SESSION_KEY = 'velonify-crm.session';

function readSession(): StoredSession | null {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as StoredSession | null;
    return session?.token?.accessToken && session.token.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession | null): void {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage blocked (private mode): the user just signs in again after a reload.
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const initial = useRef(isDemo ? null : readSession());
  const tokenRef = useRef<TokenInfo | null>(initial.current?.token ?? null);
  const [state, setState] = useState<AuthState>(() => {
    if (isDemo) return { status: 'demo', user: DEMO_USER };
    return initial.current ? { status: 'signedIn', user: initial.current.user } : { status: 'signedOut' };
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    if (isDemo) return;
    loadGoogleIdentity()
      .then(() => setGoogleReady(true))
      .catch((error: Error) => setState((s) => (s.status === 'signedOut' ? { status: 'signedOut', error: error.message } : s)));
  }, []);

  const expire = useCallback(() => {
    tokenRef.current = null;
    writeSession(null);
    setState((s) =>
      s.status === 'signedIn' || s.status === 'expired'
        ? { status: 'expired', user: s.user }
        : s.status === 'demo'
          ? s
          : { status: 'signedOut', error: new AuthExpiredError().message },
    );
  }, []);

  const getToken = useCallback(async () => {
    const token = tokenRef.current;
    if (token && token.expiresAt > Date.now()) return token.accessToken;
    expire();
    throw new AuthExpiredError();
  }, [expire]);

  const signIn = useCallback(async () => {
    const current = stateRef.current;
    const previousUser = current.status === 'expired' ? current.user : undefined;
    try {
      const token = await requestToken({
        clientId: config.googleClientId,
        scopes: GOOGLE_SCOPES,
        domain: config.allowedDomain,
        loginHint: previousUser?.email,
      });
      const user = await fetchGoogleUser(token.accessToken);
      if (!user.email.toLowerCase().endsWith(`@${config.allowedDomain}`)) {
        revokeToken(token.accessToken);
        throw new Error(`Nur Google-Konten mit @${config.allowedDomain} haben Zugriff. Angemeldet war: ${user.email}`);
      }
      tokenRef.current = token;
      writeSession({ token, user });
      setState({ status: 'signedIn', user });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Anmeldung fehlgeschlagen.';
      setState(previousUser ? { status: 'expired', user: previousUser, error: message } : { status: 'signedOut', error: message });
    }
  }, []);

  const signOut = useCallback(() => {
    if (tokenRef.current) revokeToken(tokenRef.current.accessToken);
    tokenRef.current = null;
    writeSession(null);
    setState(isDemo ? { status: 'demo', user: DEMO_USER } : { status: 'signedOut' });
  }, []);

  const userEmail = useCallback(() => {
    const s = stateRef.current;
    return s.status === 'signedOut' ? '' : s.user.email;
  }, []);

  const value = useMemo(
    () => ({ state, googleReady, signIn, signOut, expire, getToken, userEmail }),
    [state, googleReady, signIn, signOut, expire, getToken, userEmail],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
