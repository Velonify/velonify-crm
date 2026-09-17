import { describe, expect, it } from 'vitest';
import { werkzeugFuerPfad } from './werkzeuge';

describe('werkzeugFuerPfad', () => {
  it('maps paths to their tool', () => {
    expect(werkzeugFuerPfad('/')?.id).toBe('home');
    expect(werkzeugFuerPfad('/crm')?.id).toBe('crm');
    expect(werkzeugFuerPfad('/crm/firmen/F-123')?.id).toBe('crm');
    expect(werkzeugFuerPfad('/contact/gesendet')?.id).toBe('contact');
    expect(werkzeugFuerPfad('/kalender')?.id).toBe('home');
  });

  it('leaves shared pages without a tool', () => {
    expect(werkzeugFuerPfad('/einrichtung')).toBeNull();
    expect(werkzeugFuerPfad('/crmx')).toBeNull();
  });
});
