import { describe, expect, it } from 'vitest';
import { zaehlerSummen } from './LeadTeile';

describe('zaehlerSummen', () => {
  it('sums today by decision, yesterday and the last seven days', () => {
    const s = zaehlerSummen(
      [
        { tag: '2026-09-15', entscheidung: 'pipeline', n: 9 },
        { tag: '2026-09-17', entscheidung: 'abgelehnt', n: 2 },
        { tag: '2026-09-22', entscheidung: 'pipeline', n: 4 },
        { tag: '2026-09-23', entscheidung: 'abgelehnt', n: 3 },
        { tag: '2026-09-23', entscheidung: 'pipeline', n: 5 },
      ],
      '2026-09-23',
      '2026-09-22',
      '2026-09-17',
    );
    expect(s).toMatchObject({ heute: 8, gestern: 4, woche: 14 });
    expect(s.heuteJe.map((t) => t.entscheidung)).toEqual(['pipeline', 'abgelehnt']);
  });
});
