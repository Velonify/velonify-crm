import { useEffect, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { istMac } from './Suche';

/** Two-key jumps: G, then the letter. */
export const SPRUENGE: { taste: string; ziel: string; label: string }[] = [
  { taste: 'h', ziel: '/', label: 'Home' },
  { taste: 'e', ziel: '/eingang', label: 'Eingang' },
  { taste: 'c', ziel: '/crm', label: 'CRM · Mein Tag' },
  { taste: 'p', ziel: '/crm/pipeline', label: 'Pipeline' },
  { taste: 'f', ziel: '/crm/firmen', label: 'Firmen' },
  { taste: 'k', ziel: '/kunden', label: 'Kunden' },
  { taste: 't', ziel: '/todo', label: 'To-dos' },
  { taste: 'a', ziel: '/angebote', label: 'Angebote' },
  { taste: 'g', ziel: '/contact', label: 'Contact Generator' },
  { taste: 'u', ziel: '/audit', label: 'Shop-Audit' },
  { taste: 's', ziel: '/social', label: 'Social Media' },
  { taste: 'l', ziel: '/leads', label: 'Lead-Finder' },
  { taste: 'm', ziel: '/magnete', label: 'Lead-Magnete' },
];

let hilfeOffen = false;
const hoerer = new Set<() => void>();
const setzeHilfe = (offen: boolean) => {
  hilfeOffen = offen;
  hoerer.forEach((h) => h());
};

/** Whether the shortcut overlay is open; shared between the "?" key and the help button in the capsule. */
export function useHilfe(): [boolean, (offen: boolean) => void] {
  const offen = useSyncExternalStore(
    (h) => {
      hoerer.add(h);
      return () => hoerer.delete(h);
    },
    () => hilfeOffen,
  );
  return [offen, setzeHilfe];
}

const tippt = (ziel: EventTarget | null) =>
  ziel instanceof HTMLElement && (ziel.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ziel.tagName));
const dialogOffen = () => !!document.querySelector('.overlay, .search-overlay, .blatt.is-offen');

/** Global keys: ? help, / search, C new lead, G + letter to jump. Nothing fires while typing or in a dialog. */
export function Tastatur() {
  const navigate = useNavigate();
  const [offen, setOffen] = useHilfe();

  useEffect(() => {
    let gSeit = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || tippt(e.target)) return;
      if (e.key === 'Escape' && hilfeOffen) {
        setOffen(false);
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setOffen(!hilfeOffen);
        return;
      }
      if (hilfeOffen || dialogOffen()) return;
      const taste = e.key.toLowerCase();
      if (gSeit && Date.now() - gSeit < 1200) {
        gSeit = 0;
        const sprung = SPRUENGE.find((s) => s.taste === taste);
        if (sprung) {
          e.preventDefault();
          navigate(sprung.ziel);
        }
        return;
      }
      if (taste === 'g') {
        gSeit = Date.now();
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        document.querySelector<HTMLButtonElement>('.search-trigger')?.click();
        return;
      }
      if (taste === 'c' && !e.shiftKey) {
        e.preventDefault();
        navigate('/crm/firmen/neu');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, setOffen]);

  if (!offen) return null;
  const mod = istMac ? '⌘' : 'Strg';
  return (
    <div className="overlay hilfe-overlay" onMouseDown={(e) => e.target === e.currentTarget && setOffen(false)}>
      <div className="dialog hilfe" role="dialog" aria-modal="true" aria-labelledby="hilfe-titel">
        <div className="dialog-header">
          <h2 id="hilfe-titel">Tastenkürzel</h2>
          <button type="button" className="icon-button" onClick={() => setOffen(false)} aria-label="Schließen">
            ×
          </button>
        </div>
        <div className="dialog-body hilfe-raster">
          <h3>Überall</h3>
          <div><span>Suchen oder den Hub fragen</span><span><kbd>{mod}</kbd> <kbd>K</kbd> · <kbd>/</kbd></span></div>
          <div><span>Neuer Lead</span><kbd>C</kbd></div>
          <div><span>Letzte Änderung rückgängig</span><kbd>Z</kbd></div>
          <div><span>Diese Hilfe</span><kbd>?</kbd></div>
          <h3>Springen: G, dann …</h3>
          {SPRUENGE.map((s) => (
            <div key={s.taste}>
              <span>{s.label}</span>
              <span><kbd>G</kbd> <kbd>{s.taste.toUpperCase()}</kbd></span>
            </div>
          ))}
          <h3>Im Eingang</h3>
          <div><span>Nächster / vorheriger Eintrag</span><span><kbd>J</kbd> <kbd>K</kbd></span></div>
          <div><span>Hauptaktion</span><kbd>E</kbd></div>
          <div><span>Öffnen</span><kbd>↵</kbd></div>
        </div>
      </div>
    </div>
  );
}
