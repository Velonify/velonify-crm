import { describe, expect, it } from 'vitest';
import { istZustaendig, mitPerson, normalisiereZustaendig, ohnePerson, personen } from './zustaendig';

describe('several responsible people', () => {
  it('reads old single names and comma lists alike', () => {
    expect(personen('Lugge')).toEqual(['Lugge']);
    expect(personen(' Lugge ,Julian;; Lugge ')).toEqual(['Lugge', 'Julian']);
    expect(personen('')).toEqual([]);
    expect(normalisiereZustaendig('Julian,Lugge,')).toBe('Julian, Lugge');
  });

  it('matches a person inside a list, never by substring', () => {
    expect(istZustaendig('Lugge, Julian', 'Julian')).toBe(true);
    expect(istZustaendig('Julianne', 'Julian')).toBe(false);
    expect(istZustaendig('Lugge', null)).toBe(false);
  });

  it('adds and removes without touching the others', () => {
    expect(mitPerson('Lugge', 'Julian')).toBe('Lugge, Julian');
    expect(mitPerson('Lugge', 'Lugge')).toBe('Lugge');
    expect(mitPerson('', 'Lugge')).toBe('Lugge');
    expect(ohnePerson('Lugge, Julian', 'Lugge')).toBe('Julian');
  });
});
