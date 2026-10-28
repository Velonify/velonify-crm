import { describe, expect, it } from 'vitest';
import { BAUSTEINE, darfEinrichten, instanzBausteine, instanzWerkzeuge, istInstanzEinstellung, istProfil, partnerWerkzeuge, PROFIL_WERKZEUGE, teamName } from './instanz';
import { WERKZEUGE } from '../werkzeuge';

describe('eigene Instanzen', () => {
  it('only knows profiles and tools that exist in the hub', () => {
    expect(istProfil('creator')).toBe(true);
    expect(istProfil('velonify')).toBe(false);
    expect(istProfil(undefined)).toBe(false);
    for (const w of PROFIL_WERKZEUGE.creator) expect(WERKZEUGE.some((x) => x.id === w)).toBe(true);
  });

  it('starts with the start scope of the concept and switches building blocks, keeping Home and surviving broken JSON', () => {
    expect(instanzBausteine({})).toEqual(BAUSTEINE.filter((b) => b.start).map((b) => b.id));
    expect(instanzWerkzeuge('creator', {})).toEqual(['home', 'todo', 'kalender', 'content', 'analytics', 'kooperationen', 'ablage']);
    expect(instanzWerkzeuge('creator', { instanz_funktionen: '{"einnahmen":true,"ablage":false}' })).toEqual(['home', 'todo', 'kalender', 'content', 'analytics', 'kooperationen', 'einnahmen']);
    // A tool stays while one of its blocks is on.
    expect(instanzWerkzeuge('creator', { instanz_funktionen: '{"contentplan":false,"skripte":true}' })).toContain('content');
    expect(instanzWerkzeuge('creator', { instanz_funktionen: 'kaputt' })).toEqual(instanzWerkzeuge('creator', {}));
    expect(partnerWerkzeuge(['home', 'todo', 'content'], { werkzeuge: ['content', 'einnahmen'] })).toEqual(['home', 'content']);
  });

  it('names team members by first name and knows who may run the Einrichtung', () => {
    expect(teamName({ name: 'mara Beispiel', email: 'x@example.com' })).toBe('Mara');
    expect(teamName({ name: '', email: 'cut.team@example.com' })).toBe('Cut.team');
    expect(darfEinrichten('admin')).toBe(true);
    expect(darfEinrichten('velonify')).toBe(true);
    expect(darfEinrichten('team')).toBe(false);
    expect(darfEinrichten('schnitt')).toBe(false);
    expect(istInstanzEinstellung('instanz_name')).toBe(true);
    expect(istInstanzEinstellung('rolle_mitarbeiter')).toBe(false);
  });
});
