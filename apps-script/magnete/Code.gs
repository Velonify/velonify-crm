/**
 * Lead-Magnete: nimmt die Einträge vom Formular auf velonify.de/ressourcen/<slug>/ entgegen, schreibt sie in
 * den Tab „magnet_leads“ der CRM-Datenbank und verschickt die Mail mit dem Download (und, falls angehakt, dem
 * Bestätigungslink für den Newsletter). Außerdem vermerkt es die Klicks auf diese Links.
 *
 * Aufgerufen wird es nur von den Netlify-Funktionen der Website (netlify/functions/submission-created.mjs und
 * magnet-link.mjs), nie direkt vom Browser. Einrichtung siehe README.md. Das Skript läuft als die Person, die
 * es bereitstellt – von deren Google-Konto gehen die Mails raus (vorgesehen: lukas@velonify.de).
 *
 * Die Spalten sind der Vertrag mit dem Hub (src/data/schema.ts, Tabs `magnete` und `magnet_leads`): ändert
 * sich dort eine Spalte, hier mitändern.
 */

var TAB_MAGNETE = 'magnete';
var TAB_LEADS = 'magnet_leads';
var LEAD_SPALTEN = [
  'id', 'magnet', 'eingegangen_am', 'vorname', 'email', 'shop', 'shopsystem', 'utm_source', 'utm_medium',
  'utm_campaign', 'utm_content', 'token', 'mail_gesendet_am', 'download_am', 'downloads',
  'newsletter_einwilligung', 'newsletter_text', 'newsletter_bestaetigt_am', 'newsletter_abgemeldet_am',
  'status', 'firma_id', 'kontakt_id', 'erledigt_am', 'erledigt_von',
  'erstellt_am', 'erstellt_von', 'geaendert_am', 'geaendert_von',
];
// Dieselbe Schreibweise wie die IDs der App (src/data/ids.ts).
var ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
var MAX_LAENGE = 500;
// Wer dieselbe Adresse mehrfach einträgt, bekommt die Mail höchstens alle 10 Minuten noch einmal …
var ERNEUT_NACH_MS = 10 * 60 * 1000;
// … und eine Adresse insgesamt höchstens 5 Mails am Tag, egal für welchen Magneten.
var MAILS_PRO_TAG = 5;
// Notbremse, falls doch Spam durchkommt: höchstens so viele Download-Mails am Tag insgesamt.
var MAILS_GESAMT_PRO_TAG = 300;
var STANDARD = {
  BASIS_URL: 'https://velonify.de',
  ABSENDER_NAME: 'Lukas von Velonify',
  SIGNATUR_NAME: 'Lukas Hanke',
};

function doPost(e) {
  try {
    var erwartet = eigenschaft('WEBHOOK_TOKEN');
    if (!erwartet) return antwort(500, 'WEBHOOK_TOKEN ist nicht gesetzt.');
    if (!e || !e.parameter || e.parameter.token !== erwartet) return antwort(403, 'Falsches Token.');

    var koerper = JSON.parse((e.postData && e.postData.contents) || '{}');
    switch (koerper.aktion) {
      case 'eintrag':
        return eintrag(koerper.payload || {});
      case 'download':
        return download(koerper.token);
      case 'newsletter':
        return newsletter(koerper.token);
      case 'abmelden':
        return abmelden(koerper.token);
      default:
        return antwort(400, 'Unbekannte Aktion.');
    }
  } catch (fehler) {
    console.error(fehler);
    return antwort(500, String(fehler));
  }
}

/** Kurzer Lebenszeichen-Test im Browser. */
function doGet() {
  return antwort(200, 'Magnete bereit.');
}

// ─── Aktionen ──────────────────────────────────────────────────────────────

/** Neue Einsendung von Netlify: Zeile anlegen (oder wiederfinden) und Mail schicken. */
function eintrag(einsendung) {
  var felder = einsendung.data || {};
  if (feld(felder, 'bot-field')) return antwort(200, 'Ignoriert.');

  var email = feld(felder, 'email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return antwort(400, 'Keine gültige E-Mail-Adresse.');
  var slug = feld(felder, 'magnet').toLowerCase();
  if (!slug) return antwort(400, 'Ohne Magnet weiß ich nicht, was ich schicken soll.');
  var einwilligung = Boolean(feld(felder, 'newsletter'));

  return gesperrt(function () {
    var magnet = finde(lies(TAB_MAGNETE), function (m) {
      return m.slug === slug && !wahr(m.archiviert);
    });
    var leads = lies(TAB_LEADS);
    pruefeSpalten(leads.kopf);
    var jetzt = new Date();

    var vorhanden = finde(leads, function (l) {
      return l.magnet === slug && String(l.email).toLowerCase() === email;
    });
    var lead = vorhanden;
    var neuEingewilligt = false;
    if (!lead) {
      lead = {
        id: neueId('ML'),
        magnet: slug,
        eingegangen_am: einsendung.created_at || jetzt.toISOString(),
        vorname: feld(felder, 'vorname'),
        email: email,
        shop: feld(felder, 'shop'),
        shopsystem: feld(felder, 'shopsystem'),
        utm_source: feld(felder, 'utm_source'),
        utm_medium: feld(felder, 'utm_medium'),
        utm_campaign: feld(felder, 'utm_campaign'),
        utm_content: feld(felder, 'utm_content'),
        token: neuesToken(),
        mail_gesendet_am: '',
        download_am: '',
        downloads: 0,
        newsletter_einwilligung: einwilligung,
        newsletter_text: einwilligung ? feld(felder, 'newsletter_text') : '',
        newsletter_bestaetigt_am: '',
        newsletter_abgemeldet_am: '',
        status: 'neu',
        firma_id: '',
        kontakt_id: '',
        erledigt_am: '',
        erledigt_von: '',
        erstellt_am: jetzt.toISOString(),
        erstellt_von: 'Website',
        geaendert_am: jetzt.toISOString(),
        geaendert_von: 'Website',
      };
      haengeAn(leads, lead);
    } else if (einwilligung && !wahr(lead.newsletter_einwilligung)) {
      // Beim zweiten Mal die Newsletter-Box angehakt: die Einwilligung gilt ab jetzt, bestätigt wird per Mail.
      aendere(leads, lead, { newsletter_einwilligung: true, newsletter_text: feld(felder, 'newsletter_text'), newsletter_abgemeldet_am: '' });
      neuEingewilligt = true;
    }

    if (!magnet || !wahr(magnet.aktiv) || !magnet.datei_url) return antwort(200, 'Gespeichert, Magnet ist nicht aktiv – keine Mail.');
    // Wer gerade erst den Newsletter dazu angehakt hat, braucht die Mail mit dem Bestätigungslink sofort.
    if (vorhanden && !neuEingewilligt && vorhanden.mail_gesendet_am && jetzt - new Date(vorhanden.mail_gesendet_am) < ERNEUT_NACH_MS) {
      return antwort(200, 'Mail ging gerade erst raus – nicht noch einmal.');
    }
    if (mailsHeute(leads, email, jetzt) >= MAILS_PRO_TAG) return antwort(429, 'Zu viele Mails an diese Adresse heute.');
    if (mailsHeute(leads, null, jetzt) >= MAILS_GESAMT_PRO_TAG) return antwort(429, 'Tageslimit für Download-Mails erreicht.');

    sendeMail(magnet, lead);
    aendere(leads, lead, { mail_gesendet_am: new Date().toISOString() });
    return antwort(200, vorhanden ? 'Mail erneut gesendet.' : 'Gespeichert, Mail gesendet.');
  });
}

/** Klick auf den Download-Knopf: Klick zählen, Datei-Link zurückgeben. */
function download(token) {
  return mitLead(token, function (leads, lead) {
    var magnet = finde(lies(TAB_MAGNETE), function (m) {
      return m.slug === lead.magnet;
    });
    if (!magnet || !magnet.datei_url) return antwort(404, 'Zu diesem Link gibt es keine Datei mehr.');
    aendere(leads, lead, {
      download_am: lead.download_am || new Date().toISOString(),
      downloads: (Number(lead.downloads) || 0) + 1,
    });
    return antwort(200, 'Download.', { ziel: magnet.datei_url });
  });
}

/** Bestätigung des Newsletters (Double-Opt-in). Nur, wer die Box angehakt hat, kann bestätigen. */
function newsletter(token) {
  return mitLead(token, function (leads, lead) {
    if (!wahr(lead.newsletter_einwilligung)) return antwort(409, 'Für diese Adresse wurde kein Newsletter angefragt.');
    aendere(leads, lead, {
      newsletter_bestaetigt_am: lead.newsletter_abgemeldet_am ? new Date().toISOString() : lead.newsletter_bestaetigt_am || new Date().toISOString(),
      newsletter_abgemeldet_am: '',
    });
    return antwort(200, 'Newsletter bestätigt.');
  });
}

/** Abmeldung vom Newsletter – gilt für die Adresse, nicht nur für diesen einen Eintrag. */
function abmelden(token) {
  return mitLead(token, function (leads, lead) {
    var email = String(lead.email).toLowerCase();
    var jetzt = new Date().toISOString();
    leads.zeilen.forEach(function (l) {
      if (String(l.email).toLowerCase() === email && wahr(l.newsletter_einwilligung) && !l.newsletter_abgemeldet_am) {
        aendere(leads, l, { newsletter_abgemeldet_am: jetzt });
      }
    });
    return antwort(200, 'Abgemeldet.');
  });
}

function mitLead(token, aktion) {
  token = String(token || '');
  if (!/^[a-f0-9]{32}$/.test(token)) return antwort(400, 'Ungültiger Link.');
  return gesperrt(function () {
    var leads = lies(TAB_LEADS);
    var lead = finde(leads, function (l) {
      return l.token === token;
    });
    if (!lead) return antwort(404, 'Diesen Link kennen wir nicht.');
    return aktion(leads, lead);
  });
}

function mailsHeute(leads, email, jetzt) {
  return leads.zeilen.filter(function (l) {
    return (email === null || String(l.email).toLowerCase() === email) && l.mail_gesendet_am && jetzt - new Date(l.mail_gesendet_am) < 24 * 3600 * 1000;
  }).length;
}

// ─── Mail ──────────────────────────────────────────────────────────────────

function sendeMail(magnet, lead) {
  var basis = eigenschaft('BASIS_URL') || STANDARD.BASIS_URL;
  var downloadUrl = basis + '/m/d/' + lead.token;
  var newsletterUrl = basis + '/ressourcen/newsletter/?t=' + lead.token;
  var zeigeNewsletter = wahr(lead.newsletter_einwilligung) && !lead.newsletter_bestaetigt_am;
  var vorname = String(lead.vorname || '').trim();
  var anrede = vorname ? 'Hi ' + vorname + ',' : 'Hi,';
  var absaetze = String(magnet.mail_text || '').trim()
    ? String(magnet.mail_text).trim().split(/\n\s*\n/)
    : ['danke für dein Interesse! Hier ist wie versprochen „' + magnet.titel + '“.'];
  var betreff = String(magnet.mail_betreff || '').trim() || 'Dein Download: ' + magnet.titel;
  var signatur = eigenschaft('SIGNATUR_NAME') || STANDARD.SIGNATUR_NAME;

  var text = [anrede, ''].concat(absaetze.map(function (a) { return a + '\n'; }));
  text.push('Zum Download: ' + downloadUrl, '');
  if (zeigeNewsletter) {
    text.push('Du wolltest außerdem unseren Newsletter. Bitte bestätige das noch mit einem Klick, erst dann tragen wir dich ein:', newsletterUrl, '');
  }
  text.push('Wenn Fragen auftauchen: Antworte einfach auf diese Mail, sie landet direkt bei mir.', '', 'Viele Grüße', signatur, 'Velonify · ' + basis.replace(/^https?:\/\//, ''), '');
  text.push('Du bekommst diese Mail, weil diese Adresse auf velonify.de für „' + magnet.titel + '“ eingetragen wurde. Warst du das nicht, ignoriere sie einfach.');

  var html = mailHtml({
    anrede: anrede,
    absaetze: absaetze,
    titel: magnet.titel,
    downloadUrl: downloadUrl,
    newsletterUrl: zeigeNewsletter ? newsletterUrl : '',
    signatur: signatur,
    basis: basis,
  });

  // MailApp statt GmailApp: braucht nur das Recht, Mails zu senden – nicht den Zugriff aufs ganze Postfach.
  MailApp.sendEmail(lead.email, betreff, text.join('\n'), {
    htmlBody: html,
    name: eigenschaft('ABSENDER_NAME') || STANDARD.ABSENDER_NAME,
  });
}

function mailHtml(m) {
  var bordeaux = '#45142D';
  var schrift = "font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;";
  var p = function (inhalt, extra) {
    return '<p style="margin: 0 0 16px; font-size: 16px; line-height: 1.55; color: #1E1A1C; ' + (extra || '') + '">' + inhalt + '</p>';
  };
  var knopf = function (url, beschriftung, voll) {
    var stil = voll
      ? 'background: ' + bordeaux + '; color: #FFFFFF; border: 2px solid ' + bordeaux + ';'
      : 'background: #FFFFFF; color: ' + bordeaux + '; border: 2px solid ' + bordeaux + ';';
    return '<p style="margin: 8px 0 24px;"><a href="' + esc(url) + '" style="display: inline-block; padding: 14px 22px; font-size: 15px; font-weight: 700; text-decoration: none; ' + stil + '">' + esc(beschriftung) + '</a></p>';
  };

  var inhalt = [p(esc(m.anrede))];
  m.absaetze.forEach(function (a) {
    inhalt.push(p(esc(a.trim()).replace(/\n/g, '<br>')));
  });
  inhalt.push(knopf(m.downloadUrl, 'Jetzt herunterladen', true));
  if (m.newsletterUrl) {
    inhalt.push('<hr style="border: 0; border-top: 1px solid #E4DDE0; margin: 8px 0 24px;">');
    inhalt.push(p('Du wolltest außerdem unseren Newsletter. Bitte bestätige das noch mit einem Klick – erst dann tragen wir dich ein:'));
    inhalt.push(knopf(m.newsletterUrl, 'Newsletter bestätigen', false));
    inhalt.push(p('Kein Interesse mehr? Dann ignoriere diesen Teil einfach, du bekommst nur den Download.', 'font-size: 14px; color: #6B6266;'));
  }
  inhalt.push(p('Wenn Fragen auftauchen: Antworte einfach auf diese Mail, sie landet direkt bei mir.'));
  inhalt.push(p('Viele Grüße<br><strong>' + esc(m.signatur) + '</strong><br>Velonify'));

  var fuss =
    'Du bekommst diese Mail, weil diese Adresse auf velonify.de für „' + esc(m.titel) + '“ eingetragen wurde. ' +
    'Warst du das nicht, ignoriere sie einfach – wir schreiben dir nichts weiter.<br>' +
    '<a href="' + m.basis + '/impressum/" style="color: #6B6266;">Impressum</a> · ' +
    '<a href="' + m.basis + '/datenschutz/" style="color: #6B6266;">Datenschutz</a>';

  return (
    '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin: 0; padding: 0; background: #F4F1F2;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #F4F1F2;"><tr><td align="center" style="padding: 32px 16px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background: #FFFFFF; ' + schrift + '">' +
    '<tr><td style="padding: 28px 32px 8px;"><img src="' + m.basis + '/assets/img/velonify-wordmark-bordeaux.png" alt="Velonify" height="22" style="height: 22px; width: auto; display: block;"></td></tr>' +
    '<tr><td style="padding: 20px 32px 12px;">' + inhalt.join('') + '</td></tr>' +
    '</table>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; ' + schrift + '"><tr><td style="padding: 16px 32px; font-size: 12px; line-height: 1.5; color: #6B6266;">' + fuss + '</td></tr></table>' +
    '</td></tr></table></body></html>'
  );
}

// ─── Tabelle ───────────────────────────────────────────────────────────────

/** Ein Tab als Liste von Objekten; `zeile` merkt sich die Zeilennummer im Blatt. */
function lies(name) {
  var blatt = tabelle().getSheetByName(name);
  if (!blatt) throw new Error('Der Tab „' + name + '“ fehlt. Im Hub einmal unter Einrichtung auf „Einrichten“ klicken.');
  var werte = blatt.getDataRange().getValues();
  var kopf = (werte[0] || []).map(function (zelle) {
    return String(zelle || '').trim();
  });
  var zeilen = [];
  for (var i = 1; i < werte.length; i++) {
    var objekt = { _zeile: i + 1 };
    kopf.forEach(function (spalte, j) {
      objekt[spalte] = werte[i][j] instanceof Date ? werte[i][j].toISOString() : werte[i][j];
    });
    if (String(objekt.id || '').trim()) zeilen.push(objekt);
  }
  return { blatt: blatt, kopf: kopf, zeilen: zeilen };
}

function finde(tab, passt) {
  for (var i = 0; i < tab.zeilen.length; i++) if (passt(tab.zeilen[i])) return tab.zeilen[i];
  return null;
}

function haengeAn(tab, objekt) {
  tab.blatt.appendRow(
    tab.kopf.map(function (spalte) {
      return objekt[spalte] === undefined ? '' : zelle(objekt[spalte]);
    })
  );
  objekt._zeile = tab.blatt.getLastRow();
  tab.zeilen.push(objekt);
}

function aendere(tab, objekt, aenderungen) {
  aenderungen.geaendert_am = new Date().toISOString();
  aenderungen.geaendert_von = 'Website';
  Object.keys(aenderungen).forEach(function (spalte) {
    var j = tab.kopf.indexOf(spalte);
    if (j === -1) return;
    tab.blatt.getRange(objekt._zeile, j + 1).setValue(zelle(aenderungen[spalte]));
    objekt[spalte] = aenderungen[spalte];
  });
}

function pruefeSpalten(kopf) {
  var fehlen = LEAD_SPALTEN.filter(function (spalte) {
    return kopf.indexOf(spalte) === -1;
  });
  if (fehlen.length > 0) throw new Error('Im Tab „' + TAB_LEADS + '“ fehlen Spalten: ' + fehlen.join(', '));
}

/** Zwei Einsendungen in derselben Sekunde dürfen nicht dieselbe Zeile beschreiben. */
function gesperrt(arbeit) {
  var sperre = LockService.getScriptLock();
  sperre.waitLock(30000);
  try {
    return arbeit();
  } finally {
    sperre.releaseLock();
  }
}

function tabelle() {
  var id = eigenschaft('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID ist nicht gesetzt.');
  return SpreadsheetApp.openById(id);
}

// ─── Kleinkram ─────────────────────────────────────────────────────────────

function eigenschaft(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

function feld(felder, name) {
  var wert = felder[name];
  if (wert === undefined || wert === null) return '';
  return String(wert).trim().slice(0, MAX_LAENGE);
}

/** Häkchen kommen als true oder, von Hand getippt, als Text „TRUE“. */
function wahr(wert) {
  return wert === true || String(wert).toUpperCase() === 'TRUE';
}

/**
 * Wert so, wie die App ihn schreibt (RAW): Häkchen und Zahlen echt, alles andere als Text. Ohne Apostroph hielte
 * Google Zeitstempel für Datumswerte, Ziffernfolgen für Zahlen, „true“ für ein Häkchen und = + - @ für eine Formel.
 */
function zelle(wert) {
  if (typeof wert === 'boolean' || typeof wert === 'number') return wert;
  var text = String(wert);
  return /^([=+\-@\d.]|true$|false$)/i.test(text) ? "'" + text : text;
}

function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function neueId(praefix) {
  var zeichen = '';
  for (var i = 0; i < 8; i++) zeichen += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  return praefix + '-' + zeichen;
}

/** 32 Hex-Zeichen aus zwei UUIDs – nicht zu erraten, also gut genug als Schlüssel im Link. */
function neuesToken() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 32).toLowerCase();
}

function antwort(status, text, extra) {
  var koerper = { status: status, text: text };
  if (extra) Object.keys(extra).forEach(function (k) { koerper[k] = extra[k]; });
  return ContentService.createTextOutput(JSON.stringify(koerper)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Einmal im Editor ausführen (oben „testMail“ wählen → Ausführen): schickt die Mail des ersten aktiven Magneten
 * an die eigene Adresse, ohne etwas ins Sheet zu schreiben. Dabei fragt Google auch nach den Berechtigungen.
 */
function testMail() {
  var magnet = finde(lies(TAB_MAGNETE), function (m) {
    return wahr(m.aktiv) && m.datei_url;
  });
  if (!magnet) throw new Error('Kein aktiver Magnet mit Datei-Link im Tab „magnete“.');
  sendeMail(magnet, {
    email: Session.getActiveUser().getEmail(),
    vorname: 'Test',
    token: '0123456789abcdef0123456789abcdef',
    newsletter_einwilligung: true,
    newsletter_bestaetigt_am: '',
  });
}
