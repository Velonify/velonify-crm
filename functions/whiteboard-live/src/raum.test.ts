import { describe, expect, it } from 'vitest';
import { MAX_IM_RAUM, pruefeNachricht, Raeume, type Teilnehmer } from './raum';

function person(id: string, seit: number) {
  const post: unknown[] = [];
  const t: Teilnehmer = { id, email: `${id}@velonify.de`, name: id, farbe: '#000', seit, sende: (n) => post.push(n) };
  return { t, post };
}

describe('whiteboard-live Räume', () => {
  it('welcomes, announces and asks the longest present for the state', () => {
    const raeume = new Raeume();
    const raum = raeume.raum('WB-1');
    const a = person('a', 1);
    const b = person('b', 2);
    const c = person('c', 3);
    raum.betrete(a.t);
    expect(a.post[0]).toMatchObject({ t: 'willkommen', andere: [], standKommt: false });
    raum.betrete(b.t);
    raum.betrete(c.t);
    expect(c.post[0]).toMatchObject({ t: 'willkommen', andere: [{ id: 'a' }, { id: 'b' }], standKommt: true });
    expect(a.post).toContainEqual({ t: 'stand-anfrage', fuer: 'c' });
    expect(b.post).not.toContainEqual({ t: 'stand-anfrage', fuer: 'c' });
    expect(b.post).toContainEqual({ t: 'betreten', person: { id: 'c', email: 'c@velonify.de', name: 'c', farbe: '#000' } });
  });

  it('passes changes to everyone else and the state only to whom asked', () => {
    const raum = new Raeume().raum('WB-1');
    const a = person('a', 1);
    const b = person('b', 2);
    const c = person('c', 3);
    [a, b, c].forEach((p) => raum.betrete(p.t));
    [a, b, c].forEach((p) => (p.post.length = 0));
    raum.leite('a', { t: 'szene', elemente: [{ id: 'x' }] });
    expect(a.post).toEqual([]);
    expect(b.post).toEqual([{ t: 'szene', elemente: [{ id: 'x' }], von: 'a' }]);
    raum.leite('a', { t: 'stand', fuer: 'c', elemente: [] });
    expect(b.post).toHaveLength(1);
    expect(c.post.at(-1)).toEqual({ t: 'stand', elemente: [] });
  });

  it('removes people and empty rooms, and keeps rooms from overflowing', () => {
    const raeume = new Raeume();
    const a = person('a', 1);
    const b = person('b', 2);
    raeume.raum('WB-1').betrete(a.t);
    raeume.raum('WB-1').betrete(b.t);
    raeume.verlasse('WB-1', 'b');
    expect(a.post.at(-1)).toEqual({ t: 'verlassen', id: 'b' });
    raeume.verlasse('WB-1', 'a');
    expect(raeume.anzahl).toBe(0);
    const voll = raeume.raum('WB-2');
    for (let i = 0; i < MAX_IM_RAUM; i++) voll.betrete(person(`p${i}`, i).t);
    expect(voll.betrete(person('zuviel', 99).t)).toBe(false);
  });

  it('drops messages it does not know', () => {
    expect(pruefeNachricht({ t: 'zeiger', x: 1, y: 2, knopf: 'down' })).toMatchObject({ t: 'zeiger', knopf: 'down' });
    expect(pruefeNachricht({ t: 'zeiger', x: Infinity, y: 2 })).toBeNull();
    expect(pruefeNachricht({ t: 'hinweis', art: 'loeschen' })).toBeNull();
    expect(pruefeNachricht({ t: 'boese' })).toBeNull();
    expect(pruefeNachricht('szene')).toBeNull();
  });
});
