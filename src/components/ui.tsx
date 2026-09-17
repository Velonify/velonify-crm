import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { phaseLabel, statusLabel } from '../data/constants';
import { SchemaError } from '../data/errors';
import { errorMessage } from '../lib/errors';

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge status-${status || 'none'}`}>{statusLabel(status)}</span>;
}

export function TierBadge({ tier }: { tier: string }) {
  if (!tier) return <span className="muted">–</span>;
  return <span className={`badge tier tier-${tier.toLowerCase()}`}>{tier}</span>;
}

export function PhaseBadge({ phase }: { phase: string }) {
  if (!phase) return <span className="muted">–</span>;
  return <span className={`badge phase phase-${phase}`}>{phaseLabel(phase)}</span>;
}

export function Loading({ label = 'Lädt …' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="alert error" role="alert">
      <span>
        {errorMessage(error)}
        {error instanceof SchemaError && (
          <>
            {' '}
            <Link to="/einrichtung">Zur Einrichtung</Link>
          </>
        )}
      </span>
      {onRetry && (
        <button type="button" className="button small" onClick={onRetry}>
          Erneut versuchen
        </button>
      )}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-title">
        {eyebrow && <div className="eyebrow-mark">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Card({ title, actions, children, className = '' }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <header className="card-header">
        <h2>{title}</h2>
        {actions && <div className="card-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Field({ label, hint, invalid, wide, children }: { label: string; hint?: string; invalid?: boolean; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`field${wide ? ' wide' : ''}${invalid ? ' invalid' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

export function FormError({ error }: { error: unknown }) {
  if (error === undefined || error === null) return null;
  return (
    <p className="alert error" role="alert">
      {errorMessage(error)}
    </p>
  );
}

/** Wraps the page body: shows the first-load spinner or error, then the content. */
export function PageState({ loading, error, onRetry, children }: { loading: boolean; error: Error | null; onRetry(): void; children: ReactNode }) {
  if (error && !loading) {
    return (
      <div className="page">
        <ErrorBox error={error} onRetry={onRetry} />
      </div>
    );
  }
  return <>{children}</>;
}
