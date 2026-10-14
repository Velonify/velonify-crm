import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export interface DragZiel {
  spalteId: string;
  /** Position in the column, counted without the dragged card. */
  index: number;
}

export interface DragZustand {
  id: string;
  x: number;
  y: number;
  /** Where the card was grabbed, relative to its top left corner. */
  griffX: number;
  griffY: number;
  breite: number;
  ziel: DragZiel | null;
}

const MAUS_SCHWELLE = 6;
const TOUCH_HALTEN_MS = 220;
const TOUCH_TOLERANZ = 8;
const RAND = 64;

/**
 * Drag & drop for the board with pointer events, no library. Mouse and pen start dragging after a few pixels;
 * touch needs a short hold first, so swiping still scrolls the board. Escape cancels.
 */
export function useKanbanDrag(onDrop: (id: string, ziel: DragZiel) => void) {
  const [drag, setDrag] = useState<DragZustand | null>(null);
  const spalten = useRef(new Map<string, HTMLElement>());
  const scroller = useRef<HTMLElement | null>(null);
  const klickSperre = useRef(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const dragRef = useRef<DragZustand | null>(null);
  dragRef.current = drag;

  const spalteRef = useCallback(
    (spalteId: string) => (el: HTMLElement | null) => {
      if (el) spalten.current.set(spalteId, el);
      else spalten.current.delete(spalteId);
    },
    [],
  );

  const zielBei = (x: number, y: number, id: string): DragZiel | null => {
    let bester: { spalteId: string; el: HTMLElement; abstand: number } | null = null;
    for (const [spalteId, el] of spalten.current) {
      const r = el.getBoundingClientRect();
      const abstand = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (!bester || abstand < bester.abstand) bester = { spalteId, el, abstand };
    }
    if (!bester || bester.abstand > 120) return null;
    const karten = [...bester.el.querySelectorAll<HTMLElement>('[data-karte-id]')].filter((k) => k.dataset.karteId !== id);
    const index = karten.filter((k) => {
      const r = k.getBoundingClientRect();
      return r.top + r.height / 2 < y;
    }).length;
    return { spalteId: bester.spalteId, index };
  };

  useEffect(() => {
    if (!drag) return;
    const bewegen = (e: PointerEvent) => {
      const aktuell = dragRef.current;
      if (!aktuell) return;
      const s = scroller.current;
      if (s) {
        const r = s.getBoundingClientRect();
        if (e.clientX < r.left + RAND) s.scrollLeft -= 14;
        else if (e.clientX > r.right - RAND) s.scrollLeft += 14;
      }
      setDrag({ ...aktuell, x: e.clientX, y: e.clientY, ziel: zielBei(e.clientX, e.clientY, aktuell.id) });
    };
    const loslassen = () => {
      const aktuell = dragRef.current;
      setDrag(null);
      klickSperre.current = true;
      setTimeout(() => (klickSperre.current = false), 0);
      if (aktuell?.ziel) onDropRef.current(aktuell.id, aktuell.ziel);
    };
    const abbrechen = () => setDrag(null);
    const taste = (e: KeyboardEvent) => e.key === 'Escape' && abbrechen();
    // While a touch drag runs, the page must not scroll under the finger.
    const touch = (e: TouchEvent) => e.preventDefault();
    document.addEventListener('pointermove', bewegen);
    document.addEventListener('pointerup', loslassen);
    document.addEventListener('pointercancel', abbrechen);
    document.addEventListener('keydown', taste);
    document.addEventListener('touchmove', touch, { passive: false });
    document.body.classList.add('is-dragging');
    return () => {
      document.removeEventListener('pointermove', bewegen);
      document.removeEventListener('pointerup', loslassen);
      document.removeEventListener('pointercancel', abbrechen);
      document.removeEventListener('keydown', taste);
      document.removeEventListener('touchmove', touch);
      document.body.classList.remove('is-dragging');
    };
  }, [drag !== null]);

  const griff = useCallback((id: string) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('input, button, a, select, textarea')) return;
    const el = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const touch = e.pointerType === 'touch';
    let timer = 0;
    let letzte = { x: startX, y: startY };

    const starten = () => {
      aufraeumen();
      const r = el.getBoundingClientRect();
      setDrag({ id, x: letzte.x, y: letzte.y, griffX: startX - r.left, griffY: startY - r.top, breite: r.width, ziel: zielBei(letzte.x, letzte.y, id) });
    };
    const bewegen = (ev: PointerEvent) => {
      letzte = { x: ev.clientX, y: ev.clientY };
      const weg = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (touch ? weg > TOUCH_TOLERANZ : weg > MAUS_SCHWELLE) {
        if (touch) aufraeumen();
        else starten();
      }
    };
    const aufraeumen = () => {
      clearTimeout(timer);
      document.removeEventListener('pointermove', bewegen);
      document.removeEventListener('pointerup', aufraeumen);
      document.removeEventListener('pointercancel', aufraeumen);
    };
    document.addEventListener('pointermove', bewegen);
    document.addEventListener('pointerup', aufraeumen);
    document.addEventListener('pointercancel', aufraeumen);
    if (touch) timer = window.setTimeout(starten, TOUCH_HALTEN_MS);
  }, []);

  /** True right after a drop, so the click that ends the drag does not open the card. */
  const istKlickNachDrag = () => klickSperre.current;

  return { drag, griff, spalteRef, scroller, istKlickNachDrag };
}
