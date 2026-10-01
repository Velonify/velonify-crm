import type { MouseEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { gmailLink } from '../lib/gmail';

/** Hook for Gmail links in the signed-in account (no account in demo mode). */
export function useGmail() {
  const { state } = useAuth();
  const konto = state.status === 'signedIn' || state.status === 'expired' ? state.user.email : '';
  return (entwurf: { an?: string; betreff?: string; text?: string }) => gmailLink({ ...entwurf, konto });
}

/** E-mail address that opens a new Gmail draft to it in a new tab. */
export function MailLink({ email, onClick }: { email: string; onClick?(e: MouseEvent): void }) {
  const gmail = useGmail();
  return (
    <a href={gmail({ an: email })} target="_blank" rel="noreferrer noopener" title="In Gmail schreiben" onClick={onClick}>
      {email}
    </a>
  );
}
