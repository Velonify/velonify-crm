import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';

interface Props {
  title: ReactNode;
  children: ReactNode;
  onClose(): void;
  /** When set, the dialog is a form and Enter submits. */
  onSubmit?: () => void | Promise<void>;
  submitLabel?: string;
  busy?: boolean;
  wide?: boolean;
  /** Extra buttons on the left of the footer, e.g. "Archivieren". */
  extraActions?: ReactNode;
}

export function Dialog({ title, children, onClose, onSubmit, submitLabel = 'Speichern', busy = false, wide = false, extraActions }: Props) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ busy, onClose });
  latest.current = { busy, onClose };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea, button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !latest.current.busy) latest.current.onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy) void onSubmit?.();
  };

  const body = (
    <>
      <header className="dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Schließen" disabled={busy}>
          ×
        </button>
      </header>
      <div className="dialog-body">{children}</div>
      <footer className="dialog-actions">
        <div className="dialog-extra">{extraActions}</div>
        <button type="button" className="button" onClick={onClose} disabled={busy}>
          {onSubmit ? 'Abbrechen' : 'Schließen'}
        </button>
        {onSubmit && (
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Speichert …' : submitLabel}
          </button>
        )}
      </footer>
    </>
  );

  return (
    <div className="overlay" role="presentation">
      <div ref={ref} className={`dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        {onSubmit ? (
          <form onSubmit={handleSubmit} noValidate>
            {body}
          </form>
        ) : (
          body
        )}
      </div>
    </div>
  );
}
