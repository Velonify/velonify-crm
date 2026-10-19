import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Kind = 'success' | 'error';

/** Optional button next to the message, e.g. "Rückgängig". */
export interface ToastAktion {
  label: string;
  run(): void | Promise<void>;
}

export interface Toast {
  id: number;
  message: string;
  kind: Kind;
  aktion?: ToastAktion;
}

interface ToastContextValue {
  show(message: string, kind?: Kind, aktion?: ToastAktion): void;
  /** Shortcut for the most common action: undo the change that was just made. */
  rueckgaengig(message: string, run: () => void | Promise<void>): void;
}

interface InselContextValue {
  toasts: Toast[];
  dismiss(id: number): void;
  /** The hub island (Layout) shows the messages; without it (login page) the plain list below takes over. */
  anmelden(): () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const InselContext = createContext<InselContextValue | null>(null);
let nextId = 1;

/** How long a message stays: errors and messages with an action need reading or a click. */
const dauer = (t: Pick<Toast, 'kind' | 'aktion'>) => (t.kind === 'error' ? 9000 : t.aktion ? 7000 : 3500);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [inseln, setInseln] = useState(0);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (message: string, kind: Kind = 'success', aktion?: ToastAktion) => {
      const id = nextId++;
      setToasts((all) => [...all.slice(-3), { id, message, kind, aktion }]);
      window.setTimeout(() => dismiss(id), dauer({ kind, aktion }));
    },
    [dismiss],
  );
  const rueckgaengig = useCallback(
    (message: string, run: () => void | Promise<void>) => show(message, 'success', { label: 'Rückgängig', run }),
    [show],
  );

  const anmelden = useCallback(() => {
    setInseln((n) => n + 1);
    return () => setInseln((n) => n - 1);
  }, []);

  const value = useMemo(() => ({ show, rueckgaengig }), [show, rueckgaengig]);
  const insel = useMemo(() => ({ toasts, dismiss, anmelden }), [toasts, dismiss, anmelden]);
  return (
    <ToastContext.Provider value={value}>
      <InselContext.Provider value={insel}>
        {children}
        {inseln === 0 && (
          <div className="toasts" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
                <span>{t.message}</span>
                {t.aktion && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      dismiss(t.id);
                      void t.aktion!.run();
                    }}
                  >
                    {t.aktion.label}
                  </button>
                )}
                <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Schließen">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </InselContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

/** For the hub island: the current messages; while it is mounted the plain list stays hidden. */
export function useInselToasts(): Pick<InselContextValue, 'toasts' | 'dismiss'> {
  const context = useContext(InselContext);
  if (!context) throw new Error('useInselToasts must be used inside ToastProvider');
  const { anmelden, toasts, dismiss } = context;
  useEffect(() => anmelden(), [anmelden]);
  return { toasts, dismiss };
}
