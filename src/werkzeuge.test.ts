import { describe, expect, it } from 'vitest';
import { seitentitel, werkzeugFuerPfad } from './werkzeuge';

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
