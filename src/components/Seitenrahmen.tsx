import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { errorMessage } from '../lib/errors';
import { Loading } from './ui';

/** After a deploy the old chunk names are gone; such an error is fixed by reloading, not by retrying. */
export function istLadefehler(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError/i.test(text);
}

interface GrenzeProps {
  /** A new value (the path) clears the error, so the next page renders normally again. */
  schluessel: string;
  children: ReactNode;
}

interface GrenzeState {
  error: unknown;
  schluessel: string;
}

/** Catches render errors of one page, so the sidebar and the other tools keep working. */
export class FehlerGrenze extends Component<GrenzeProps, GrenzeState> {
  state: GrenzeState = { error: null, schluessel: this.props.schluessel };

  static getDerivedStateFromError(error: unknown): Partial<GrenzeState> {
    return { error: error ?? new Error('Unbekannter Fehler') };
  }

  static getDerivedStateFromProps(props: GrenzeProps, state: GrenzeState): Partial<GrenzeState> | null {
    return props.schluessel === state.schluessel ? null : { error: null, schluessel: props.schluessel };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Seite abgestürzt', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const neuLaden = istLadefehler(error);
    return (
      <div className="alert error" role="alert">
        <span>
          {neuLaden
            ? 'Der Hub wurde inzwischen aktualisiert. Bitte lade die Seite neu.'
            : `Diese Seite konnte nicht angezeigt werden: ${errorMessage(error)}`}
        </span>
        <button
          type="button"
          className="button small"
          onClick={() => (neuLaden ? window.location.reload() : this.setState({ error: null }))}
        >
          {neuLaden ? 'Neu laden' : 'Erneut versuchen'}
        </button>
      </div>
    );
  }
}

/** Error boundary plus loading state for a lazily loaded page. */
export function Seitenrahmen({ schluessel, children }: GrenzeProps) {
  return (
    <FehlerGrenze schluessel={schluessel}>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </FehlerGrenze>
  );
}
