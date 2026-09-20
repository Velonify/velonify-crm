/**
 * Nimmt die Anfragen vom Formular auf velonify.de entgegen und schreibt sie in den Tab „eingang“
 * der CRM-Datenbank. Netlify ruft diese Web-App nach jeder Einsendung auf (Forms → Notifications →
 * Outgoing webhook). Im CRM landen die Anfragen unter Home → Anfragen.
 *
 * Einrichtung siehe README.md. Das Skript läuft als Eigentümer der Tabelle, darum darf der Tab
 * geschützt bleiben. Es steht bewusst kein Geheimnis im Code: Token und Tabellen-ID liegen in den
 * Skript-Eigenschaften.
 */

var TAB = 'eingang';
var SPALTEN = [
  'id', 'eingegangen_am', 'quelle', 'sprache', 'name', 'email', 'shop', 'themen', 'nachricht',
  'status', 'firma_id', 'kontakt_id', 'erledigt_am', 'erledigt_von',
  'erstellt_am', 'erstellt_von', 'geaendert_am', 'geaendert_von',
];
// 32 Zeichen ohne Verwechslungsgefahr – dieselbe Schreibweise wie die IDs der App (src/data/ids.ts).
var ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
var MAX_LAENGE = 4000;

function doPost(e) {
  try {
    var erwartet = PropertiesService.getScriptProperties().getProperty('WEBHOOK_TOKEN');
    if (!erwartet) return antwort(500, 'WEBHOOK_TOKEN ist nicht gesetzt.');
    if (!e || !e.parameter || e.parameter.token !== erwartet) return antwort(403, 'Falsches Token.');

    var koerper = JSON.parse((e.postData && e.postData.contents) || '{}');
    // Netlify verpackt die Einsendung je nach Benachrichtigungsart in „payload“.
    var einsendung = koerper.payload || koerper;
    var felder = einsendung.data || {};
    // Der Honeypot ist nur für Bots sichtbar: ist er gefüllt, war es keine echte Anfrage.
    if (feld(felder, 'bot-field')) return antwort(200, 'Ignoriert.');

    var email = feld(felder, 'email');
    if (!email) return antwort(400, 'Ohne E-Mail-Adresse fangen wir nichts an.');

    schreibe({
      id: neueId('EA'),
      eingegangen_am: einsendung.created_at || new Date().toISOString(),
      quelle: herkunft(einsendung),
      sprache: feld(felder, 'sprache') || 'de',
      name: feld(felder, 'name'),
      email: email,
      shop: feld(felder, 'shop'),
      themen: feld(felder, 'themen'),
      nachricht: feld(felder, 'nachricht'),
      status: 'neu',
    });
    return antwort(200, 'Gespeichert.');
  } catch (fehler) {
    // Netlify wiederholt den Aufruf nicht, deshalb bleibt die Spur wenigstens im Ausführungsprotokoll.
    console.error(fehler);
    return antwort(500, String(fehler));
  }
}

/** Kurzer Lebenszeichen-Test im Browser; schreiben kann nur doPost. */
function doGet() {
  return antwort(200, 'Eingang bereit.');
}

function schreibe(anfrage) {
  var jetzt = new Date().toISOString();
  anfrage.firma_id = '';
  anfrage.kontakt_id = '';
  anfrage.erledigt_am = '';
  anfrage.erledigt_von = '';
  anfrage.erstellt_am = jetzt;
  anfrage.erstellt_von = 'Website';
  anfrage.geaendert_am = jetzt;
  anfrage.geaendert_von = 'Website';

  var sperre = LockService.getScriptLock();
  // Zwei Anfragen in derselben Sekunde dürfen nicht dieselbe Zeile beschreiben.
  sperre.waitLock(30000);
  try {
    var blatt = tabelle().getSheetByName(TAB);
    if (!blatt) throw new Error('Der Tab „' + TAB + '“ fehlt. Im CRM einmal unter Einrichtung auf „Einrichten“ klicken.');
    var kopf = blatt.getRange(1, 1, 1, blatt.getLastColumn()).getValues()[0].map(function (zelle) {
      return String(zelle || '').trim();
    });
    fehlendeSpalten(kopf);
    var zeile = kopf.map(function (spalte) {
      return anfrage[spalte] === undefined ? '' : kuerze(anfrage[spalte]);
    });
    blatt.appendRow(zeile);
  } finally {
    sperre.releaseLock();
  }
}

function fehlendeSpalten(kopf) {
  var fehlen = SPALTEN.filter(function (spalte) {
    return kopf.indexOf(spalte) === -1;
  });
  if (fehlen.length > 0) throw new Error('Im Tab „' + TAB + '“ fehlen Spalten: ' + fehlen.join(', '));
}

function tabelle() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
}

/** „velonify.de“ statt der nackten Netlify-Adresse, damit im CRM steht, woher die Anfrage kam. */
function herkunft(einsendung) {
  var url = einsendung.site_url || '';
  var treffer = url.match(/^https?:\/\/([^/]+)/);
  return treffer ? treffer[1].replace(/^www\./, '') : 'Website';
}

function feld(felder, name) {
  var wert = felder[name];
  return wert === undefined || wert === null ? '' : String(wert).trim();
}

function kuerze(wert) {
  var text = String(wert);
  return text.length > MAX_LAENGE ? text.slice(0, MAX_LAENGE) + ' […]' : text;
}

function neueId(praefix) {
  var zeichen = '';
  for (var i = 0; i < 8; i++) zeichen += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  return praefix + '-' + zeichen;
}

function antwort(status, text) {
  return ContentService.createTextOutput(JSON.stringify({ status: status, text: text })).setMimeType(ContentService.MimeType.JSON);
}
