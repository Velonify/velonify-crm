import { describe, expect, it } from 'vitest';
import { verschiebe, VORLAGEN } from './vorlagen';

type Skelett = { id?: string; type: string; x?: number; y?: number; width?: number; children?: string[]; start?: { id: string }; end?: { id: string }; points?: number[][] };

describe('Whiteboard-Vorlagen', () => {
  it('has the four templates Lukas asked for, plus the retro', () => {
    expect(VORLAGEN.map((v) => v.name)).toEqual(['Mindmap', 'Flowchart', 'User Flow', 'Sitemap', 'Workshop / Retro']);
  });

  for (const vorlage of VORLAGEN) {
    it(`${vorlage.name}: arrows join existing boxes, frames hold everything, ids are unique`, () => {
      const elemente = vorlage.elemente() as Skelett[];
      const ids = elemente.flatMap((e) => (e.id ? [e.id] : []));
      expect(new Set(ids).size).toBe(ids.length);
      for (const pfeil of elemente.filter((e) => e.type === 'arrow')) {
        expect(ids).toContain(pfeil.start?.id);
        expect(ids).toContain(pfeil.end?.id);
        // Placed from edge to edge, not left at 0/0 with Excalidraw's default length.
        const [, [dx, dy]] = pfeil.points!;
        expect(Math.hypot(dx, dy)).toBeGreaterThan(5);
      }
      const frames = elemente.filter((e) => e.type === 'frame');
      expect(frames.length).toBeGreaterThan(0);
      const imFrame = new Set(frames.flatMap((f) => f.children ?? []));
      expect(elemente.filter((e) => e.type !== 'frame').every((e) => e.id && imFrame.has(e.id))).toBe(true);
    });
  }

  it('centres a template on the given point', () => {
    const elemente = verschiebe(VORLAGEN[0].elemente(), 1000, 500) as Skelett[];
    const frame = elemente.find((e) => e.type === 'frame')!;
    expect(frame.x! + frame.width! / 2).toBeCloseTo(1000);
  });
});
