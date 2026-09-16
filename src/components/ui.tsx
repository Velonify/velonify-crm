import type { ReactNode } from 'react';
import { statusLabel } from '../lib/format';

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge status-${status || 'none'}`}>{statusLabel(status)}</span>;
}

export function TierBadge({ tier }: { tier: string }) {
  if (!tier) return <span className="muted">–</span>;
  return <span className={`badge tier tier-${tier.toLowerCase()}`}>{tier}</span>;
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
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="alert error" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="button small" onClick={onRetry}>
          Erneut versuchen
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-title">
        <h1>{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
