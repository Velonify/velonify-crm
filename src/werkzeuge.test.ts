import { describe, expect, it } from 'vitest';
import { LEISTE, WERKZEUGE, bereichFuerPfad, leistenEintragFuerPfad, seitentitel, werkzeugFuerPfad } from './werkzeuge';

describe('werkzeugFuerPfad', () => {
  it('maps paths to their tool', () => {
    expect(werkzeugFuerPfad('/')?.id).toBe('home');
    expect(werkzeugFuerPfad('/crm')?.id).toBe('crm');
    expect(werkzeugFuerPfad('/crm/firmen/F-123')?.id).toBe('crm');
    expect(werkzeugFuerPfad('/contact/gesendet')?.id).toBe('contact');
    expect(werkzeugFuerPfad('/kalender')?.id).toBe('home');
    expect(werkzeugFuerPfad('/anfragen')?.id).toBe('home');
    expect(werkzeugFuerPfad('/crm/anfragen')?.id).toBe('crm');
    expect(werkzeugFuerPfad('/audit/SA-123')?.id).toBe('audit');
    expect(werkzeugFuerPfad('/kunden/F-123/dateien')?.id).toBe('kunden');
    expect(werkzeugFuerPfad('/todo/B-123')?.id).toBe('todo');
  });

  it('leaves shared pages without a tool', () => {
    expect(werkzeugFuerPfad('/einrichtung')).toBeNull();
    expect(werkzeugFuerPfad('/crmx')).toBeNull();
  });
});

describe('seitentitel', () => {
  it('names the open tool in the browser tab', () => {
    expect(seitentitel(werkzeugFuerPfad('/crm/pipeline')!)).toBe('Velonify CRM');
    expect(seitentitel(werkzeugFuerPfad('/')!)).toBe('Velonify');
  });
});

describe('bereichFuerPfad', () => {
  it('nennt Werkzeug und Seite', () => {
    expect(bereichFuerPfad('/crm/pipeline')).toBe('CRM · Pipeline');
    expect(bereichFuerPfad('/crm/firmen/F-1')).toBe('CRM · Firmen');
    expect(bereichFuerPfad('/einrichtung')).toBe('Einrichtung');
  });
});

describe('leistenEintragFuerPfad', () => {
  it('gibt dem Eingang eine eigene Zeile und ordnet sonst nach Werkzeug', () => {
    expect(leistenEintragFuerPfad('/eingang')?.label).toBe('Eingang');
    expect(leistenEintragFuerPfad('/')?.label).toBe('Home');
    expect(leistenEintragFuerPfad('/kalender')?.label).toBe('Home');
    expect(leistenEintragFuerPfad('/crm/pipeline')?.label).toBe('CRM');
    expect(leistenEintragFuerPfad('/einrichtung')).toBeNull();
  });

  it('führt jedes Werkzeug genau einmal in der Leiste, außer Home mit dem Eingang', () => {
    const werkzeuge = LEISTE.flatMap((g) => g.eintraege.map((e) => e.werkzeug));
    expect(new Set(werkzeuge)).toEqual(new Set(WERKZEUGE.filter((w) => w.pfad).map((w) => w.id)));
  });
});
