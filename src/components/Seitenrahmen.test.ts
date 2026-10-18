import { describe, expect, it } from 'vitest';
import { FehlerGrenze, istLadefehler } from './Seitenrahmen';

describe('FehlerGrenze', () => {
  it('recognises chunks that are gone after a deploy', () => {
    expect(istLadefehler(new TypeError('Failed to fetch dynamically imported module: https://crm.velonify.de/assets/KundePage-abc.js'))).toBe(true);
    expect(istLadefehler(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(istLadefehler(new Error("Cannot read properties of undefined (reading 'name')"))).toBe(false);
  });

  it('keeps the error until the path changes', () => {
    const fehler = new Error('kaputt');
    const state = { error: null, schluessel: '/kunden', ...FehlerGrenze.getDerivedStateFromError(fehler) };
    expect(state.error).toBe(fehler);
    expect(FehlerGrenze.getDerivedStateFromProps({ schluessel: '/kunden', children: null }, state)).toBeNull();
    expect(FehlerGrenze.getDerivedStateFromProps({ schluessel: '/todo', children: null }, state)).toEqual({ error: null, schluessel: '/todo' });
  });
});
