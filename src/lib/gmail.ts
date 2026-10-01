export interface GmailEntwurf {
  an?: string;
  betreff?: string;
  text?: string;
  /** Signed-in address, so Gmail opens the Velonify account even when several Google accounts are logged in. */
  konto?: string;
}

/** Address of Gmail's compose window, filled with recipient, subject and text. Empty fields stay out. */
export function gmailLink({ an, betreff, text, konto }: GmailEntwurf): string {
  const params = new URLSearchParams();
  if (konto?.trim()) params.set('authuser', konto.trim());
  params.set('view', 'cm');
  params.set('fs', '1');
  if (an?.trim()) params.set('to', an.trim());
  if (betreff?.trim()) params.set('su', betreff.trim());
  if (text?.trim()) params.set('body', text);
  // URLSearchParams writes spaces as "+"; Gmail reads both, %20 stays readable in other mail handlers too.
  return `https://mail.google.com/mail/?${params.toString().replace(/\+/g, '%20')}`;
}
