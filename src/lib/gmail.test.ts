import { describe, expect, it } from 'vitest';
import { gmailLink } from './gmail';

describe('gmailLink', () => {
  it('fills recipient, subject and text in the Velonify account', () => {
    expect(gmailLink({ an: ' mara@shop.example ', betreff: 'Frage & Idee', text: 'Zeile 1\nZeile 2 + mehr', konto: 'lukas@velonify.de' })).toBe(
      'https://mail.google.com/mail/?authuser=lukas%40velonify.de&view=cm&fs=1&to=mara%40shop.example&su=Frage%20%26%20Idee&body=Zeile%201%0AZeile%202%20%2B%20mehr',
    );
  });

  it('opens an empty draft when nothing is known', () => {
    expect(gmailLink({ an: '', betreff: ' ', text: '' })).toBe('https://mail.google.com/mail/?view=cm&fs=1');
  });
});
