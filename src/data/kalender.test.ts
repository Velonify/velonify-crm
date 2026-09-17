import { describe, expect, it } from 'vitest';
import { MemoryCalendar } from './demo/memoryGoogle';
import type { CalendarEvent } from './google/calendar';
import { firmaFuerTermin, googleKalenderUrl, istVorbei, terminTage, termineJeTag, wocheText, wochenStart, wochenTage, zeitText } from './kalender';
import { EMPTY_FIRMA_INPUT, EMPTY_KONTAKT_INPUT, type Database, type Firma, type Kontakt } from './types';

/** Local time as ISO timestamp, so the tests do not depend on the machine's time zone. */
const lokal = (tag: string, zeit: string) => new Date(`${tag}T${zeit}:00`).toISOString();
const termin = (extra: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'e1', titel: 'Call', start: lokal('2026-09-17', '10:00'), ende: lokal('2026-09-17', '11:00'), teilnehmer: [], abgesagt: false, ganztaegig: false, ...extra,
});

describe('Kalender', () => {
  it('computes weeks starting on Monday', () => {
    expect(wochenStart('2026-09-17')).toBe('2026-09-14');
    expect(wochenStart('2026-09-14')).toBe('2026-09-14');
    expect(wochenStart('2026-09-20')).toBe('2026-09-14');
    expect(wochenTage('2026-09-28')).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(wocheText('2026-09-14')).toBe('14.–20. September 2026');
    expect(wocheText('2026-09-28')).toBe('28. September – 4. Oktober 2026');
    expect(googleKalenderUrl('2026-09-07')).toBe('https://calendar.google.com/calendar/r/week/2026/9/7');
  });

  it('places events on every day they cover', () => {
    expect(terminTage(termin({}))).toEqual(['2026-09-17']);
    // All-day end dates are exclusive.
    expect(terminTage(termin({ ganztaegig: true, start: '2026-09-18', ende: '2026-09-21' }))).toEqual(['2026-09-18', '2026-09-19', '2026-09-20']);
    // Ending exactly at midnight stays on the first day.
    expect(terminTage(termin({ start: lokal('2026-09-17', '22:00'), ende: lokal('2026-09-18', '00:00') }))).toEqual(['2026-09-17']);
    const nacht = termin({ start: lokal('2026-09-17', '22:00'), ende: lokal('2026-09-18', '02:00') });
    expect(terminTage(nacht)).toEqual(['2026-09-17', '2026-09-18']);
    expect([zeitText(nacht, '2026-09-17'), zeitText(nacht, '2026-09-18')]).toEqual(['ab 22:00', 'bis 02:00']);
    expect(zeitText(termin({}), '2026-09-17')).toBe('10:00–11:00');
  });

  it('groups by day with all-day entries first and knows what is over', () => {
    const spaet = termin({ id: 'spaet', start: lokal('2026-09-17', '15:00'), ende: lokal('2026-09-17', '16:00') });
    const frueh = termin({ id: 'frueh', start: lokal('2026-09-17', '08:00'), ende: lokal('2026-09-17', '09:00') });
    const messe = termin({ id: 'messe', ganztaegig: true, start: '2026-09-16', ende: '2026-09-18' });
    const jeTag = termineJeTag([spaet, frueh, messe], ['2026-09-16', '2026-09-17', '2026-09-18']);
    expect(jeTag.get('2026-09-17')?.map((e) => e.id)).toEqual(['messe', 'frueh', 'spaet']);
    expect(jeTag.get('2026-09-18')).toEqual([]);
    const mittag = new Date(lokal('2026-09-17', '12:00'));
    expect([istVorbei(frueh, mittag), istVorbei(spaet, mittag), istVorbei(messe, mittag)]).toEqual([true, false, false]);
  });

  it('links appointments to CRM firms via contacts or domain, ignoring colleagues', () => {
    const firma = (id: string, domain: string, archiviert = false) => ({ ...EMPTY_FIRMA_INPUT, id, name: id, domain, archiviert }) as Firma;
    const db = {
      firmen: [firma('F-1', 'shop.example'), firma('F-2', 'alt.example', true), firma('F-3', 'mode.example')],
      kontakte: [{ ...EMPTY_KONTAKT_INPUT, id: 'K-1', firma_id: 'F-3', email: 'Mara@privat.example', archiviert: false } as Kontakt],
    } as Database;
    const mit = (...teilnehmer: string[]) => firmaFuerTermin(db, termin({ teilnehmer }), 'lugge@velonify.de')?.id;
    expect(mit('lugge@velonify.de', 'mara@privat.example')).toBe('F-3');
    expect(mit('lugge@velonify.de', 'info@shop.example')).toBe('F-1');
    expect(mit('lugge@velonify.de', 'julian@velonify.de')).toBeUndefined();
    expect(mit('x@alt.example')).toBeUndefined();
  });

  it('lists demo events that overlap the requested range', async () => {
    const calendar = new MemoryCalendar();
    calendar.events.push(termin({ id: 'a' }), termin({ id: 'b', ganztaegig: true, start: '2026-09-18', ende: '2026-09-19' }), termin({ id: 'c', abgesagt: true }));
    const ids = async (von: string, bis: string) => (await calendar.listEvents(lokal(von, '00:00'), lokal(bis, '00:00'))).map((e) => e.id);
    expect(await ids('2026-09-17', '2026-09-18')).toEqual(['a']);
    expect(await ids('2026-09-14', '2026-09-21')).toEqual(['a', 'b']);
  });
});
