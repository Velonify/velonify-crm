import { describe, expect, it } from 'vitest';
import { sammleEingang } from './eingangListe';
import { ruhtSeit } from './selectors';
import type { Aktivitaet, Anfrage, Database, Deal, Erwaehnung, Firma, MagnetLead, Wiedervorlage } from './types';

const heute = '2026-10-19';
const meta = { erstellt_am: '', erstellt_von: '', geaendert_am: '', geaendert_von: '' };
const firma = (id: string, name: string) => ({ ...meta, id, name, archiviert: false }) as unknown as Firma;
const deal = (o: Partial<Deal>) =>
  ({ ...meta, id: 'D-1', firma_id: 'F-1', kontakt_id: '', titel: 'Migration', phase: 'gespraech', wert_eur: 1000, wahrscheinlichkeit: null, zustaendig: 'Lugge', naechster_schritt: '', naechster_schritt_am: '', verlustgrund: '', abgeschlossen_am: '', archiviert: false, ...o }) as Deal;
const wv = (o: Partial<Wiedervorlage>) =>
  ({ id: 'W-1', firma_id: 'F-1', deal_id: '', titel: 'Anrufen', faellig_am: heute, zustaendig: 'Lugge', erledigt_am: '', erledigt_von: '', erstellt_von: '', erstellt_am: '', ...o }) as Wiedervorlage;
const db = (o: Partial<Database>): Database => ({ firmen: [firma('F-1', 'Hafenrad'), firma('F-2', 'Salzhaus')], kontakte: [], deals: [], aktivitaeten: [], wiedervorlagen: [], listen: { team: ['Lugge', 'Julian'] }, einstellungen: {}, ...o });

describe('sammleEingang', () => {
  it('puts overdue items first, then today, then new things; only mine', () => {
    const daten = db({
      wiedervorlagen: [wv({ id: 'W-1', titel: 'Heute anrufen' }), wv({ id: 'W-2', titel: 'Alt', faellig_am: '2026-10-16' }), wv({ id: 'W-3', titel: 'Julians', zustaendig: 'Julian' })],
      deals: [deal({ naechster_schritt: 'Audit durchgehen', naechster_schritt_am: heute })],
    });
    const anfragen = [{ ...meta, id: 'A-1', eingegangen_am: '2026-10-19T08:00:00Z', name: 'Mara', email: 'm@x.de', shop: 'x.de', themen: 'Migration', nachricht: '', status: 'neu' } as unknown as Anfrage];
    const liste = sammleEingang({ db: daten, anfragen }, 'Lugge', heute);
    expect(liste.map((e) => [e.art, e.titel, e.dringlichkeit])).toEqual([
      ['wiedervorlage', 'Alt', 'ueberfaellig'],
      ['schritt', 'Audit durchgehen', 'heute'],
      ['wiedervorlage', 'Heute anrufen', 'heute'],
      ['anfrage', 'Anfrage von Mara', 'neu'],
    ]);
    expect(liste[0].wann).toBe('seit 3 Tagen');
  });

  it('flags connection requests without an answer after a week', () => {
    const aktivitaeten = [{ id: 'X', firma_id: 'F-2', kontakt_id: '', deal_id: 'D-2', typ: 'notiz', datum: '2026-10-10T09:00:00Z', text: 'Vernetzungsanfrage auf LinkedIn an Lea', von: '', kalender_termin_id: '' } as Aktivitaet];
    const liste = sammleEingang({ db: db({ deals: [deal({ id: 'D-2', firma_id: 'F-2', phase: 'vernetzung' })], aktivitaeten }) }, 'Lugge', heute);
    expect(liste).toMatchObject([{ art: 'vernetzung', titel: 'Salzhaus: 9 Tage ohne Antwort', dealId: 'D-2' }]);
  });

  it('shows unread mentions of me and new magnet leads, newest first, and leaves out what was put off', () => {
    const erwaehnungen = [
      { id: 'E-1', person: 'Lugge', von: 'julian@velonify.de', datum: '2026-10-18T10:00:00Z', titel: 'Angebot', auszug: '@Lugge Preise?', link: '/angebote', gelesen_am: '', firma_id: '' },
      { id: 'E-2', person: 'Julian', von: '', datum: '2026-10-19T10:00:00Z', titel: 'Nicht meins', auszug: '', link: '/', gelesen_am: '', firma_id: '' },
      { id: 'E-3', person: 'Lugge', von: '', datum: '2026-10-19T09:00:00Z', titel: 'Gelesen', auszug: '', link: '/', gelesen_am: '2026-10-19T09:30:00Z', firma_id: '' },
    ] as unknown as Erwaehnung[];
    const magnetLeads = [{ ...meta, id: 'M-1', magnet: 'black-week-kit', eingegangen_am: '2026-10-19T07:00:00Z', vorname: 'Tom', email: 't@x.de', shop: 'x.de', shopsystem: 'Shopware', status: 'neu', firma_id: '' } as unknown as MagnetLead];
    const liste = sammleEingang({ db: db({}), erwaehnungen, magnetLeads }, 'Lugge', heute);
    expect(liste.map((e) => e.key)).toEqual(['magnet:M-1', 'erwaehnung:E-1']);
    expect(sammleEingang({ db: db({}), erwaehnungen, magnetLeads }, 'Lugge', heute, new Set(['magnet:M-1'])).map((e) => e.key)).toEqual(['erwaehnung:E-1']);
  });
});

describe('ruhtSeit', () => {
  it('counts days since the newest activity or change, not for closed deals', () => {
    const d = deal({ geaendert_am: '2026-10-01T10:00:00Z' });
    expect(ruhtSeit(d, [], heute)).toBe(18);
    const a = { id: 'A', firma_id: 'F-1', kontakt_id: '', deal_id: '', typ: 'notiz', datum: '2026-10-15T10:00:00Z', text: '', von: '', kalender_termin_id: '' } as Aktivitaet;
    expect(ruhtSeit(d, [a], heute)).toBe(4);
    expect(ruhtSeit(deal({ phase: 'gewonnen', geaendert_am: '2026-01-01' }), [], heute)).toBeNull();
  });
});
