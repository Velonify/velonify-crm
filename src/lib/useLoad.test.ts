import { describe, expect, it } from 'vitest';
import { LadeCache } from './useLoad';

describe('LadeCache', () => {
  it('keeps the last result per key', () => {
    const cache = new LadeCache();
    expect(cache.has('kunden')).toBe(false);
    cache.set('kunden', [1]);
    cache.set('kunden', [1, 2]);
    expect(cache.get('kunden')).toEqual([1, 2]);
    cache.clear();
    expect(cache.has('kunden')).toBe(false);
  });

  it('drops the least recently written key when full', () => {
    const cache = new LadeCache(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 3);
    cache.set('c', 4);
    expect([cache.has('a'), cache.has('b'), cache.has('c')]).toEqual([true, false, true]);
  });
});
