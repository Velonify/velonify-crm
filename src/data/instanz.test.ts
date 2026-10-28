import { describe, expect, it } from 'vitest';
import { darfEinrichten, instanzWerkzeuge, istInstanzEinstellung, istProfil, PROFIL_WERKZEUGE, teamName } from './instanz';
import { WERKZEUGE } from '../werkzeuge';

describe('eigene Instanzen', () => {
  it('only knows profiles and tools that exist in the hub', () => {
    expect(istProfil('creator')).toBe(true);
    expect(istProfil('velonify')).toBe(false);
    expect(istProfil(undefined)).toBe(false);
    for (const w of PROFIL_WERKZEUGE.creator) expect(WERKZEUGE.some((x) => x.id === w)).toBe(true);
  });

  it('switches tools off by setting, keeps Home and survives broken JSON', () => {
    expect(instanzWerkzeuge('creator', {})).toEqual(['home', 'todo', 'whiteboard']);
    expect(instanzWerkzeuge('creator', { instanz_funktionen: '{"whiteboard":false,"home":false}' })).toEqual(['home', 'todo']);
    expect(instanzWerkzeuge('creator', { instanz_funktionen: 'kaputt' })).toEqual(['home', 'todo', 'whiteboard']);
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
