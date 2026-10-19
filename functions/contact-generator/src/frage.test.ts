import { describe, expect, it } from 'vitest';
import { FRAGE_MODELL, FrageSchema, frageParameter, pruefeVerlauf } from './frage';

describe('frage', () => {
  it('always uses the cheapest model, low effort and the fixed tools', () => {
    const anfrage = FrageSchema.parse({ ich: 'Lugge', verlauf: [{ role: 'user', content: 'Was ist heute dran?' }] });
    const p = frageParameter(anfrage, 'Montag, 19. Oktober 2026');
    expect(p.model).toBe(FRAGE_MODELL);
    expect(FRAGE_MODELL).toBe('claude-haiku-5-5');
    expect(p.output_config).toEqual({ effort: 'low' });
    expect(p.tools?.map((t) => ('name' in t ? t.name : ''))).toEqual(['suche', 'firma', 'pipeline', 'faellig', 'kennzahlen', 'todos']);
    expect(JSON.stringify(p.system)).toContain('Lugge');
  });

  it('rejects conversations that do not start with a question or end with the assistant', () => {
    expect(pruefeVerlauf(FrageSchema.parse({ verlauf: [{ role: 'assistant', content: 'Hi' }, { role: 'user', content: 'x' }] }))).toMatch(/erste Nachricht/);
    expect(pruefeVerlauf(FrageSchema.parse({ verlauf: [{ role: 'user', content: 'Frage' }, { role: 'assistant', content: [{ type: 'text', text: 'a' }] }] }))).toMatch(/letzte Nachricht/);
    expect(pruefeVerlauf(FrageSchema.parse({ verlauf: [{ role: 'user', content: 'Frage' }] }))).toBeNull();
  });
});
