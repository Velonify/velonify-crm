import { describe, expect, it } from 'vitest';
import { ValidationError } from './errors';
import { gesehenAenderungen, MAX_NEUERUNGEN, rundgangVon } from './portalRundgang';

const jetzt = new Date('2026-10-18T10:00:00.000Z');
const leer = { rundgang_am: '', neuerungen_gesehen: '' };

describe('portalRundgang', () => {
  it('reads the stored state, empty values included', () => {
    expect(rundgangVon(leer)).toEqual({ gesehen_am: '', neuerungen: [] });
    expect(rundgangVon({ rundgang_am: '2026-10-18T09:00:00.000Z', neuerungen_gesehen: 'a, b,,c' })).toEqual({ gesehen_am: '2026-10-18T09:00:00.000Z', neuerungen: ['a', 'b', 'c'] });
  });

  it('marks the tour and new features as seen and only ever adds', () => {
    expect(gesehenAenderungen({ rundgang: true }, leer, jetzt)).toEqual({ rundgang_am: jetzt.toISOString() });
    expect(gesehenAenderungen({ neuerungen: ['2026-11-zahlen', 'alt'] }, { ...leer, neuerungen_gesehen: 'alt' }, jetzt)).toEqual({ neuerungen_gesehen: 'alt,2026-11-zahlen' });
  });

  it('keeps only the newest ids', () => {
    const viele = Array.from({ length: MAX_NEUERUNGEN }, (_, i) => `n-${i}`).join(',');
    const neu = gesehenAenderungen({ neuerungen: ['neu'] }, { ...leer, neuerungen_gesehen: viele }, jetzt).neuerungen_gesehen!.split(',');
    expect(neu).toHaveLength(MAX_NEUERUNGEN);
    expect(neu.at(-1)).toBe('neu');
    expect(neu[0]).toBe('n-1');
  });

  it('rejects anything else', () => {
    for (const eingabe of [{}, { rundgang: false }, { rundgang: 'ja' }, { neuerungen: 'a' }, { neuerungen: ['A B'] }, { neuerungen: [] }, { neuerungen: ['x,y'] }]) {
      expect(() => gesehenAenderungen(eingabe, leer, jetzt)).toThrow(ValidationError);
    }
  });
});
