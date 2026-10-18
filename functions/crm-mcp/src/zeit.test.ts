import { describe, expect, it } from 'vitest';
import { zeitBerlin } from './hilfen';

describe('zeitBerlin', () => {
  it('shows UTC instants in Berlin time', () => {
    expect(zeitBerlin('2026-10-18T15:43:21.939Z')).toBe('2026-10-18 17:43');
    expect(zeitBerlin('2026-01-10T08:00:00.000Z')).toBe('2026-01-10 09:00');
  });

  it('keeps local timestamps and plain dates as they are', () => {
    expect(zeitBerlin('2026-09-30 11:34')).toBe('2026-09-30 11:34');
    expect(zeitBerlin('2026-09-30T11:34:00')).toBe('2026-09-30 11:34');
    expect(zeitBerlin('2026-09-30')).toBe('2026-09-30');
    expect(zeitBerlin('')).toBe('');
  });
});
