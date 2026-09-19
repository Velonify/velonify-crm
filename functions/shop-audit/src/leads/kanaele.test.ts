import { describe, expect, it } from 'vitest';
import { emailTools, hatGtm, technikSql, werbekanaele } from './kanaele.js';

describe('Kanäle', () => {
  it('vereint Live-Erkennung und HTTP Archive unter einem Namen', () => {
    expect(werbekanaele(['meta', 'Google Ads'], ['Facebook Pixel', 'Microsoft Advertising', 'Google Analytics'])).toEqual(['Google Ads', 'Meta', 'Microsoft Ads']);
    expect(emailTools(['brevo'], ['Sendinblue', 'Klaviyo Forms', 'Sendgrid'])).toEqual(['Brevo', 'Klaviyo']);
    expect(werbekanaele([], null)).toEqual([]);
  });

  it('erkennt den Tag Manager aus allen Quellen', () => {
    expect(hatGtm(false, [], ['Google Tag Manager for WordPress'])).toBe(true);
    expect(hatGtm(true, [], null)).toBe(true);
    expect(hatGtm(false, ['Google Analytics'], null)).toBe(false);
  });

  it('baut SQL-Bedingungen nur aus Wappalyzer-Namen', () => {
    expect(technikSql('klaviyo')).toContain(`'klaviyo forms'`);
    expect(technikSql('anderes_email')).not.toContain(`'klaviyo'`);
    expect(technikSql('werbung')).toContain(`'facebook pixel'`);
    expect(technikSql('werbung')).not.toContain(`'meta'`);
  });
});
