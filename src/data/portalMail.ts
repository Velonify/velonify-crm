/**
 * HTML of the portal's login mail. Mail clients only understand tables and inline styles, no web fonts, no SVG:
 * the brand comes from colours, the square button and the eisblau mark as PNG (served by the hub's GitHub Pages).
 */

const LOGO = 'https://crm.velonify.de/zeichen-eisblau.png';
const FARBE = { espresso: '#2C0E18', bordeaux: '#45142D', eis: '#C5D8E6', eisHell: '#EDF3F8', grund: '#F5F6F8', ink: '#16090E', ink2: '#625459', linie: '#E6E3E5' };
const SCHRIFT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function loginMailHtml(args: { vorname: string; link: string; uhr: string }): string {
  const { vorname, link, uhr } = args;
  const href = esc(link);
  const absatz = (inhalt: string, extra = '') =>
    `<p style="margin:0 0 16px;font-family:${SCHRIFT};font-size:16px;line-height:1.6;color:${FARBE.ink};${extra}">${inhalt}</p>`;

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Dein Anmeldelink</title>
</head>
<body style="margin:0;padding:0;background:${FARBE.grund};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${FARBE.grund};">Ein Klick und du bist im Velonify-Kundenportal. Der Link gilt 15 Minuten.&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${FARBE.grund};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td style="background:${FARBE.espresso};padding:22px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:12px;vertical-align:middle;"><img src="${LOGO}" width="30" height="19" alt="" style="display:block;border:0;width:30px;height:19px;"></td>
                <td style="vertical-align:middle;font-family:${SCHRIFT};font-size:15px;font-weight:700;letter-spacing:4px;color:#FFFFFF;">VELONIFY</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#FFFFFF;padding:40px 32px 32px;border-left:1px solid ${FARBE.linie};border-right:1px solid ${FARBE.linie};">
            <h1 style="margin:0 0 20px;font-family:${SCHRIFT};font-size:24px;line-height:1.3;font-weight:800;color:${FARBE.ink};">Hallo${vorname ? ` ${esc(vorname)}` : ''},</h1>
            ${absatz('hier ist dein Link für das Velonify-Kundenportal. Dort siehst du, woran wir gerade arbeiten, gibst Entwürfe frei und schickst uns Dateien und Wünsche.')}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
              <tr>
                <td style="background:${FARBE.bordeaux};">
                  <a href="${href}" target="_blank" style="display:inline-block;padding:15px 28px;font-family:${SCHRIFT};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;">Im Kundenportal anmelden&nbsp;&rarr;</a>
                </td>
              </tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:${FARBE.eisHell};border-left:3px solid ${FARBE.eis};padding:14px 16px;font-family:${SCHRIFT};font-size:14px;line-height:1.55;color:${FARBE.ink2};">
                  Angefordert um <strong style="color:${FARBE.ink};">${esc(uhr)} Uhr</strong>. Der Link gilt 15&nbsp;Minuten und funktioniert nur einmal. Danach bleibst du angemeldet, solange du das Portal mindestens alle 30&nbsp;Tage öffnest.
                </td>
              </tr>
            </table>
            <p style="margin:28px 0 6px;font-family:${SCHRIFT};font-size:13px;line-height:1.5;color:${FARBE.ink2};">Der Knopf funktioniert nicht? Kopier diesen Link in deinen Browser:</p>
            <p style="margin:0;font-family:${SCHRIFT};font-size:13px;line-height:1.5;word-break:break-all;"><a href="${href}" target="_blank" style="color:${FARBE.bordeaux};">${href}</a></p>
          </td>
        </tr>
        <tr>
          <td style="background:#FFFFFF;padding:20px 32px 28px;border:1px solid ${FARBE.linie};border-top:1px solid ${FARBE.linie};font-family:${SCHRIFT};font-size:13px;line-height:1.55;color:${FARBE.ink2};">
            Du hast keinen Link angefordert? Dann kannst du diese Mail einfach ignorieren, ohne den Link kommt niemand in dein Konto.
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;font-family:${SCHRIFT};font-size:12px;line-height:1.6;color:#857A7F;text-align:center;">
            Velonify &middot; <a href="mailto:hallo@velonify.de" style="color:#857A7F;">hallo@velonify.de</a> &middot; <a href="https://velonify.de/impressum/" style="color:#857A7F;">Impressum</a> &middot; <a href="https://velonify.de/datenschutz/" style="color:#857A7F;">Datenschutz</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
