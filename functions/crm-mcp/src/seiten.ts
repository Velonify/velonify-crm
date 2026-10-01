import type { Client } from './oauth';

const esc = (text: string) =>
  text.replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[z]!);

function seite(titel: string, inhalt: string): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titel)} · Velonify CRM</title>
<style>
  :root { --bordeaux: #45142D; --espresso: #2C0E18; --eisblau: #C5D8E6; --ink: #000; --muted: rgba(0,0,0,.65); --line: rgba(0,0,0,.12); --surface: #fff; --accent: var(--bordeaux); --on-accent: #fff; }
  @media (prefers-color-scheme: dark) { :root { --ink: #fff; --muted: rgba(255,255,255,.72); --line: rgba(255,255,255,.16); --surface: var(--espresso); --accent: var(--eisblau); --on-accent: var(--espresso); } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--surface); color: var(--ink); font: 16px/1.5 system-ui, -apple-system, sans-serif; }
  main { max-width: 440px; width: 100%; border-top: 3px solid var(--accent); padding-top: 20px; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 12px; }
  .muted { color: var(--muted); font-size: 14px; }
  code { font-size: 14px; word-break: break-all; }
  a.knopf { display: inline-block; margin-top: 8px; padding: 12px 20px; background: var(--accent); color: var(--on-accent); text-decoration: none; font-weight: 600; }
  a.knopf:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
</style>
</head>
<body><main>${inhalt}</main></body>
</html>`;
}

/**
 * Shown before the Google sign-in: who is asking and where the browser goes back to (MCP spec:
 * show the redirect host, warn when it is only a local address).
 */
export function freigabeSeite(client: Client, redirectUri: string, weiter: string, domain: string): string {
  const ziel = new URL(redirectUri);
  const lokal = ziel.protocol === 'http:';
  return seite(
    'Zugriff erlauben',
    `<h1>${esc(client.name)} mit dem Velonify-CRM verbinden</h1>
<p>${esc(client.name)} darf danach in deinem Namen im CRM lesen und schreiben: Firmen, Kontakte, Deals, Verlauf und Wiedervorlagen, dazu Kundenordner in Drive anlegen.</p>
<p class="muted">Zurück geht es an <code>${esc(ziel.host)}</code>.${lokal ? ' Das ist ein Programm auf deinem eigenen Rechner (z. B. Claude Code). Nur fortfahren, wenn du die Verbindung gerade selbst gestartet hast.' : ''}</p>
<p class="muted">Anmelden nur mit einem Konto @${esc(domain)}.</p>
<a class="knopf" href="${esc(weiter)}">Mit Google anmelden</a>`,
  );
}

export function fehlerSeite(text: string): string {
  return seite('Fehler', `<h1>Verbindung nicht möglich</h1><p>${esc(text)}</p><p class="muted">Das Fenster kann geschlossen werden.</p>`);
}
