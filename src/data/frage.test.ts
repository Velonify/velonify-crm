import { describe, expect, it } from 'vitest';
import { frageHub, fuehreAus, istFrage, type FrageApi, type FrageKontext, type Nachricht, type Runde } from './frage';
import type { Database, Deal, Firma } from './types';

const meta = { erstellt_am: '', erstellt_von: '', geaendert_am: '2026-10-18T10:00:00Z', geaendert_von: '' };
const firma = { ...meta, id: 'F-1', name: 'Hafenrad', domain: 'hafenrad.de', archiviert: false, status: 'lead', zustaendig: 'Lugge' } as unknown as Firma;
const deal = { ...meta, id: 'D-1', firma_id: 'F-1', kontakt_id: '', titel: 'Migration', phase: 'gespraech', wert_eur: 7800, wahrscheinlichkeit: null, zustaendig: 'Lugge', naechster_schritt: 'Audit durchgehen', naechster_schritt_am: '2026-10-19', verlustgrund: '', abgeschlossen_am: '', archiviert: false } as Deal;
const db: Database = { firmen: [firma], kontakte: [], deals: [deal], aktivitaeten: [], wiedervorlagen: [], listen: { team: ['Lugge'] }, einstellungen: {} };
const kontext: FrageKontext = { db, heute: '2026-10-19', ich: 'Lugge', todo: async () => ({ boards: [], aufgaben: [], kommentare: [] }) };

describe('Frag den Hub', () => {
  it('runs tools on the hub data and returns compact JSON plus the firms it saw', async () => {
    const { text, firmen } = await fuehreAus('pipeline', { phase: 'gespraech' }, kontext);
    expect(JSON.parse(text)).toMatchObject([{ firma: 'Hafenrad', wert: '7.800 €', naechster_schritt: 'Audit durchgehen' }]);
    expect([...firmen]).toEqual([['F-1', 'Hafenrad']]);
    expect(JSON.parse((await fuehreAus('firma', { id: 'F-9' }, kontext)).text)).toHaveProperty('fehler');
    expect(JSON.parse((await fuehreAus('kennzahlen', {}, kontext)).text)).toMatchObject({ offene_deals: 1, pipeline_wert: '7.800 €' });
  });

  it('loops until Claude answers in text and links the firms named in the answer', async () => {
    const gesendet: Nachricht[][] = [];
    const api: FrageApi = {
      async runde(verlauf): Promise<Runde> {
        gesendet.push(structuredClone(verlauf));
        if (verlauf.length === 1) return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'faellig', input: { person: 'Lugge' } }] };
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Heute ist Hafenrad dran.' }] };
      },
    };
    const ergebnis = await frageHub(api, 'Was ist heute dran?', kontext);
    expect(ergebnis).toEqual({ text: 'Heute ist Hafenrad dran.', firmen: [{ id: 'F-1', name: 'Hafenrad' }], runden: 2 });
    const zweite = gesendet[1];
    expect(zweite.map((n) => n.role)).toEqual(['user', 'assistant', 'user']);
    expect((zweite[2].content as { type: string; tool_use_id: string }[])[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
  });

  it('recognises questions', () => {
    expect(istFrage('Wer braucht heute eine Aktion?')).toBe(true);
    expect(istFrage('welche deals ruhen')).toBe(true);
    expect(istFrage('Hafenrad')).toBe(false);
  });
});
