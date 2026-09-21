import type { SocialAufgabeInput, SocialHookInput, SocialInhaltInput, SocialPlanInput, SocialTextInput } from './types';

/*
 * The 90-day plan from 22.09.2026, as the hub starts with it. Taken over once per sheet and edited in the
 * hub from then on – the document in the vault is the state of 21.09.2026, this is the living version.
 *
 * This repo is public: client names only appear where the plan means to publish them anyway. Everything
 * internal – which customers may not be named, what a lost deal was about – stays out and is filled in
 * the hub. Those places carry a "[IM HUB ERGÄNZEN: …]" marker.
 */

/** A plan entry of the start list; `kennung` points at the content that is created with it. */
export type SocialStartPlan = Omit<SocialPlanInput, 'inhalt_id'> & { kennung?: string };

const IG = { kanal: 'instagram', uhrzeit: '07:30' };
const STORY = { kanal: 'ig_story', uhrzeit: '' };
const LINKEDIN = { kanal: 'linkedin', uhrzeit: '' };

// ─── Inhalte: die zwölf Posts und zehn Stories ───────────────────────────────

export const SOCIAL_START_INHALTE: SocialInhaltInput[] = [
  {
    kennung: 'K1',
    art: 'karussell',
    serie: 'UMZUGSPLAN #1',
    saeule: 1,
    titel: '7 Dinge, die vor dem ersten Export feststehen müssen',
    ziel: 'Umzügler erreichen, Speicherungen, DM mit Stichwort „UMZUG“.',
    hook: 'EUER SHOP ZIEHT UM. ZIEHEN EURE RANKINGS MIT?',
    slides: [
      {
        label: '1 (Hook)',
        text: 'EUER SHOP ZIEHT UM. ZIEHEN EURE RANKINGS MIT?\n\n7 Dinge, die vor dem ersten Export feststehen müssen.',
        gestaltung: 'Vorlage B. Überschrift 88 pt, linksbündig, oberes Drittel. Unterzeile Albert Sans 600 in Eisblau. Label „UMZUGSPLAN #1“ oben links.',
        sprecher: '',
      },
      {
        label: '2',
        text: '1 · URL-LISTE\n\nExportiert jede URL, die heute Besucher oder Backlinks bringt. Produkte, Kategorien, CMS-Seiten, Filterseiten. Das ist die Grundlage für jede Weiterleitung.',
        gestaltung: 'Vorlage W, Nummern-Block oben links, Text darunter.',
        sprecher: '',
      },
      {
        label: '3',
        text: '2 · REDIRECT-MAPPING\n\nJede alte URL bekommt ein Ziel. Eine Zeile pro URL: alt → neu. Wer das nach dem Livegang macht, macht es zu spät.',
        gestaltung: 'Vorlage W. Unten eine eckige Tabelle mit 3 Beispielzeilen: /damen/jeans-blau.html → /products/jeans-blau (Albert Sans 500, Espresso auf Eisblau).',
        sprecher: '',
      },
      {
        label: '4',
        text: '3 · DATENMODELL\n\nWas in Magento ein Attribut ist, wird in Shopify eine Option, ein Metafeld oder ein Tag. Das entscheidet ihr vorher, nicht beim Import.',
        gestaltung: 'Vorlage W. Drei eckige Kästen nebeneinander: OPTION · METAFELD · TAG.',
        sprecher: '',
      },
      {
        label: '5',
        text: '4 · KUNDENKONTEN\n\nPasswörter lassen sich nicht übertragen. Plant die Einladung zur Kontoaktivierung als eigene E-Mail-Strecke.',
        gestaltung: 'Vorlage W.',
        sprecher: '',
      },
      {
        label: '6',
        text: '5 · BESTELLHISTORIE\n\nWelche Bestellungen braucht ihr im neuen Shop, welche nur im Archiv? Das bestimmt Aufwand und Kundenservice.',
        gestaltung: 'Vorlage W.',
        sprecher: '',
      },
      {
        label: '7',
        text: '6 · TRACKING\n\nEvents, Pixel, Consent: neu aufsetzen, nicht kopieren. Am Tag des Umzugs muss jede Conversion ankommen.',
        gestaltung: 'Vorlage W.',
        sprecher: '',
      },
      {
        label: '8',
        text: '7 · LIVEGANG-FENSTER\n\nTag, Uhrzeit, wer prüft was. Mit Checkliste für die ersten 48 Stunden danach.',
        gestaltung: 'Vorlage W.',
        sprecher: '',
      },
      {
        label: '9 (CTA)',
        text: 'WIR PRÜFEN EUREN UMZUGSPLAN.\n\n30 Minuten, kostenlos, mit der Person, die ihn umsetzen würde. Oder schreibt UMZUG per DM, dann schicken wir euch die Checkliste.',
        gestaltung: 'Vorlage E, Standard-CTA.',
        sprecher: '',
      },
    ],
    caption:
      'Ein Shop-Umzug scheitert selten an der Technik. Er scheitert an Entscheidungen, die zu spät fallen.\n\n' +
      'Bevor bei einer Migration von Magento auf Shopify der erste Datensatz exportiert wird, klären wir sieben Punkte: URL-Liste, Redirect-Mapping, Datenmodell, Kundenkonten, Bestellhistorie, Tracking und das Livegang-Fenster.\n\n' +
      'Der wichtigste davon ist das Redirect-Mapping. Jede alte URL, die heute Besucher bringt, braucht ein Ziel im neuen Shop. Fehlt es, landen Besucher und Suchmaschinen auf einer Fehlerseite.\n\n' +
      'Speichert euch die Liste für euer Projekt. Wenn ihr die Checkliste als PDF wollt: Schreibt uns UMZUG per DM. Die Antwort kommt von Lukas, Johannes oder Julian, nicht von einem Ticketsystem.',
    cta: 'DM „UMZUG“ → Checkliste als PDF',
    hashtags: '#shopify #shopifyplus #magento #magento2 #shopmigration #shopifyagentur #onlineshop #ecommerce #onlinehandel #seo #ecommercedeutschland',
    alt_text:
      'Karussell in Bordeaux und Weiß. Titel: Euer Shop zieht um. Ziehen eure Rankings mit? Die folgenden Seiten nennen sieben Punkte für eine Migration von Magento auf Shopify: URL-Liste, Redirect-Mapping, Datenmodell, Kundenkonten, Bestellhistorie, Tracking und Livegang-Fenster.',
    ton: '',
    material: '',
    hinweis: 'Die Checkliste als PDF muss vor dem 24.09. stehen, sonst läuft das DM-Stichwort UMZUG ins Leere.',
    status: 'text',
  },
  {
    kennung: 'K2',
    art: 'karussell',
    serie: 'DATENLECK #1',
    saeule: 2,
    titel: 'GA4 vs. Shopify: fünf Gründe für die Lücke',
    ziel: 'Shopify-Bestand erreichen, Kommentare („Bei uns auch“), Speicherungen.',
    hook: 'GA4 SAGT DAS EINE. SHOPIFY DAS ANDERE. WER HAT RECHT?',
    slides: [
      {
        label: '1 (Hook)',
        text: 'GA4 SAGT DAS EINE. SHOPIFY DAS ANDERE. WER HAT RECHT?',
        gestaltung: 'Vorlage B. Zwei eckige weiße Kästen nebeneinander, links „GA4: [ZAHL]“, rechts „SHOPIFY: [ZAHL]“ als Grafik mit Fragezeichen statt Werten, bewusst ohne echte Zahlen.',
        sprecher: '',
      },
      {
        label: '2',
        text: 'KURZE ANTWORT: SHOPIFY.\n\nShopify zählt Bestellungen. GA4 zählt, was der Browser meldet. Die Frage ist, warum die Lücke so groß ist.',
        gestaltung: 'Vorlage W.',
        sprecher: '',
      },
      {
        label: '3',
        text: '1 · CONSENT\n\nWer Cookies ablehnt, taucht in GA4 eingeschränkt oder gar nicht auf. Ohne Consent Mode fehlen diese Käufe komplett.',
        gestaltung: 'Vorlage W, Nummern-Block.',
        sprecher: '',
      },
      {
        label: '4',
        text: '2 · BLOCKER\n\nWerbeblocker und Browser-Schutz verhindern, dass Tracking-Skripte laden.',
        gestaltung: 'Vorlage W.',
        sprecher: '',
      },
      {
        label: '5',
        text: '3 · DIE DANKESEITE\n\nZahlungsanbieter mit Weiterleitung oder Zwischenschritte: Das Purchase-Event feuert nicht bei jedem Kauf.',
        gestaltung: 'Vorlage W.',
        sprecher: '',
      },
      {
        label: '6',
        text: '4 · EINSTELLUNGEN\n\nAndere Zeitzone, andere Währung, anderer Tagesschnitt. Klingt banal, verschiebt jeden Bericht.',
        gestaltung: 'Vorlage W.',
        sprecher: '',
      },
      {
        label: '7',
        text: '5 · DEFINITION\n\nSteuern, Versand, Stornos, Retouren: Beide Systeme rechnen „Umsatz“ unterschiedlich.',
        gestaltung: 'Vorlage W.',
        sprecher: '',
      },
      {
        label: '8',
        text: 'EINE ABWEICHUNG IST NORMAL. EINE UNERKLÄRTE NICHT.\n\nWer Budget auf Daten verteilt, die niemand erklären kann, verteilt es nach Gefühl.',
        gestaltung: 'Vorlage B, Text zentriert.',
        sprecher: '',
      },
      {
        label: '9 (CTA)',
        text: 'WIR ERKLÄREN EURE LÜCKE.\n\n30 Minuten. Mit der Person, die es umsetzt. Erstgespräch über den Link im Profil. Oder schreibt uns per DM.',
        gestaltung: 'Vorlage E, Standard-CTA.',
        sprecher: '',
      },
    ],
    caption:
      'Wenn GA4 und Shopify verschiedene Umsätze zeigen, ist das kein Bug. Die Frage ist nur, ob ihr die Lücke erklären könnt.\n\n' +
      'Shopify zählt Bestellungen. GA4 zählt, was der Browser meldet. Dazwischen liegen fünf typische Gründe: fehlender Consent, Werbeblocker, ein Purchase-Event, das nicht bei jedem Kauf feuert, abweichende Einstellungen bei Zeitzone oder Währung und unterschiedliche Definitionen von Umsatz.\n\n' +
      'Eine Abweichung ist normal. Eine, die niemand erklären kann, ist ein Problem. Denn auf diesen Daten verteilt ihr Budget für Meta und Google.\n\n' +
      'Wie groß ist die Lücke bei euch? Schreibt es in die Kommentare oder schickt uns DATEN per DM. Julian schaut sich an, woran es liegen kann.',
    cta: 'DM „DATEN“',
    hashtags: '#ga4 #googleanalytics4 #tracking #shopify #consentmode #ecommerce #onlinemarketing #performancemarketing #googletagmanager #onlineshop',
    alt_text:
      'Karussell. Titel: GA4 sagt das eine, Shopify das andere. Wer hat recht? Die folgenden Seiten nennen fünf Gründe für Abweichungen: Consent, Werbeblocker, fehlendes Purchase-Event, Einstellungen zu Zeitzone und Währung, unterschiedliche Umsatzdefinitionen.',
    ton: '',
    material: '',
    hinweis: 'Annahme: Julian übernimmt Tracking-Anfragen. Zuständigkeit bestätigen.',
    status: 'text',
  },
  {
    kennung: 'K3',
    art: 'karussell',
    serie: 'KEIN UMWEG #1',
    saeule: 4,
    titel: 'Ihr stellt eine Frage. Wer antwortet?',
    ziel: 'Positionierung verankern, Profilbesuche, Erstgespräche.',
    hook: 'IHR STELLT EINE FRAGE. WER ANTWORTET?',
    slides: [
      { label: '1 (Hook)', text: 'IHR STELLT EINE FRAGE. WER ANTWORTET?', gestaltung: 'Vorlage B, Überschrift zentriert, riesig (96 pt).', sprecher: '' },
      {
        label: '2',
        text: 'DER ÜBLICHE WEG\n\nIhr → Account-Management → Ticket → Projektleitung → Entwicklung → und zurück.',
        gestaltung: 'Vorlage W. Sechs eckige Kästen als Kette, verbunden mit 4-px-Linien in Espresso, Kästen in Weiß mit Espresso-Rahmen.',
        sprecher: '',
      },
      { label: '3', text: 'UNSER WEG\n\nIhr → die Person, die euren Shop baut.', gestaltung: 'Vorlage W. Nur zwei Kästen, der zweite in Bordeaux gefüllt. Viel Weißraum.', sprecher: '' },
      {
        label: '4',
        text: 'WAS DAS HEISST\n\nKeine Übergaben. Keine stille Post. Wer eure Frage liest, kennt euren Code, eure Kampagnen und eure Daten.',
        gestaltung: 'Vorlage W.',
        sprecher: '',
      },
      {
        label: '5',
        text: 'WAS WIR SELBST MACHEN\n\nShopify-Migration. Tracking & Attribution. Performance Marketing. E-Mail & Retention. Conversion-Optimierung. Ohne Subunternehmer.',
        gestaltung: 'Vorlage W, fünf Zeilen untereinander mit 4-px-Trennlinien in Eisblau.',
        sprecher: '',
      },
      {
        label: '6',
        text: 'WER WIR SIND\n\nLukas. Johannes. Julian.\n[IM HUB ERGÄNZEN: Rolle/Schwerpunkt je Person in max. 5 Wörtern]',
        gestaltung: 'Vorlage W. Drei gleich große eckige Flächen in Bordeaux mit Namen in Weiß, keine Fotos.',
        sprecher: '',
      },
      {
        label: '7 (CTA)',
        text: 'EUER SHOP. UNSER TEAM. KEIN UMWEG.\n\nErstgespräch mit einem von uns dreien. 30 Minuten, kostenlos. Link im Profil.',
        gestaltung: 'Vorlage E.',
        sprecher: '',
      },
    ],
    caption:
      'Bei vielen Agenturen wandert eure Frage durch vier Hände, bevor jemand antwortet, der euren Shop kennt.\n\n' +
      'Bei uns nicht. Wir sind zu dritt: Lukas, Johannes und Julian. Wer euer Projekt umsetzt, beantwortet auch eure Fragen. Es gibt kein Ticketsystem, keine Freigabeschleifen und keine Subunternehmer, an die wir Teile weitergeben.\n\n' +
      'Das heißt nicht, dass wir alles machen. Wir machen fünf Dinge: Shopify-Migration, Tracking & Attribution, Performance Marketing, E-Mail & Retention und Conversion-Optimierung. Die aber selbst.\n\n' +
      'Der Unterschied ist nicht die Teamgröße. Er ist Tempo und Direktheit.\n\n' +
      'Wenn ihr wissen wollt, wie sich das anfühlt: Bucht ein Erstgespräch über den Link im Profil. 30 Minuten, direkt mit uns.',
    cta: 'Erstgespräch (Link im Profil)',
    hashtags: '#shopifyagentur #ecommerceagentur #shopify #onlineshop #ecommerce #agentur #onlinehandel #d2c #ecommercedeutschland',
    alt_text:
      'Karussell in Bordeaux und Weiß. Titel: Ihr stellt eine Frage. Wer antwortet? Vergleich zwischen einer langen Kette aus Account-Management, Ticket, Projektleitung und Entwicklung und dem direkten Weg zur Person, die den Shop baut. Danach die fünf Leistungen von Velonify und die Namen Lukas, Johannes und Julian.',
    ton: '',
    material: '',
    hinweis: 'Slide 6 braucht die Rolle je Person, bevor gestaltet wird.',
    status: 'text',
  },
  {
    kennung: 'K4',
    art: 'karussell',
    serie: 'FLOW-BAUPLAN #1',
    saeule: 3,
    titel: '5 Klaviyo-Flows, die vor der ersten Kampagne stehen',
    ziel: 'Shopify-Bestand, Speicherungen, DM „FLOWS“.',
    hook: 'IHR VERSCHICKT NEWSLETTER. ABER LAUFEN EURE FLOWS?',
    slides: [
      {
        label: '1 (Hook)',
        text: 'IHR VERSCHICKT NEWSLETTER. ABER LAUFEN EURE FLOWS?\n\n5 Klaviyo-Flows, die vor der ersten Kampagne stehen sollten.',
        gestaltung: 'Vorlage B, Label „FLOW-BAUPLAN #1“.',
        sprecher: '',
      },
      {
        label: '2',
        text: '1 · WILLKOMMEN\nAuslöser: Anmeldung zum Newsletter.\nZiel: Erster Kauf.\nInhalt: Wer ihr seid, was euch unterscheidet, warum man jetzt kaufen sollte.',
        gestaltung: 'Vorlage W. Drei Zeilen mit Labels AUSLÖSER / ZIEL / INHALT in Krona One 22 pt Bordeaux.',
        sprecher: '',
      },
      {
        label: '3',
        text: '2 · WARENKORBABBRUCH\nAuslöser: Checkout begonnen, nicht abgeschlossen.\nZiel: Kauf abschließen.\nInhalt: Erinnerung mit Produkt, danach Einwände klären: Versand, Rückgabe, Zahlung.',
        gestaltung: 'Vorlage W, gleicher Aufbau.',
        sprecher: '',
      },
      {
        label: '4',
        text: '3 · PRODUKT ANGESEHEN\nAuslöser: Produktseite besucht, nichts in den Warenkorb.\nZiel: Zurück zum Produkt.\nInhalt: Das Produkt, ähnliche Produkte, Bewertungen.',
        gestaltung: 'Vorlage W.',
        sprecher: '',
      },
      {
        label: '5',
        text: '4 · NACH DEM KAUF\nAuslöser: Bestellung ausgeliefert.\nZiel: Zufriedenheit, Bewertung, zweiter Kauf.\nInhalt: Pflegehinweise, Anwendung, dann passende Ergänzung.',
        gestaltung: 'Vorlage W.',
        sprecher: '',
      },
      {
        label: '6',
        text: '5 · RÜCKGEWINNUNG\nAuslöser: Lange kein Kauf mehr.\nZiel: Wiederkauf.\nInhalt: Was neu ist. Erst danach ein Anreiz.',
        gestaltung: 'Vorlage W.',
        sprecher: '',
      },
      {
        label: '7',
        text: 'ERST FLOWS. DANN KAMPAGNEN.\n\nFlows laufen jeden Tag, ohne dass jemand auf Senden drückt. Kampagnen kommen obendrauf.',
        gestaltung: 'Vorlage B.',
        sprecher: '',
      },
      {
        label: '8 (CTA)',
        text: 'WIR SCHAUEN IN EUREN KLAVIYO-ACCOUNT.\n\nSchreibt FLOWS per DM oder bucht ein Erstgespräch.',
        gestaltung: 'Vorlage E.',
        sprecher: '',
      },
    ],
    caption:
      'Viele Shops verschicken jede Woche einen Newsletter und haben keinen einzigen Flow, der sauber läuft.\n\n' +
      'Dabei arbeiten Flows jeden Tag, ohne dass jemand auf Senden drückt. Diese fünf bauen wir in Klaviyo zuerst: Willkommen, Warenkorbabbruch, Produkt angesehen, nach dem Kauf und Rückgewinnung.\n\n' +
      'Für jeden steht auf den Slides, was ihn auslöst, was er erreichen soll und was hineingehört. Keine Vorlage zum Kopieren, sondern ein Bauplan, den ihr mit eurem Shop abgleichen könnt.\n\n' +
      'Kampagnen kommen danach. Sie sind der sichtbare Teil. Die Flows sind der Teil, der aus Erstkäufern Stammkunden macht.\n\n' +
      'Welcher der fünf fehlt bei euch? Schreibt FLOWS per DM, dann schauen wir gemeinsam drauf.',
    cta: 'DM „FLOWS“',
    hashtags: '#klaviyo #emailmarketing #shopify #ecommerce #retention #newsletter #onlineshop #marketingautomation #ecommercedeutschland #stammkunden',
    alt_text:
      'Karussell. Titel: Ihr verschickt Newsletter. Aber laufen eure Flows? Fünf Klaviyo-Flows mit Auslöser, Ziel und Inhalt: Willkommen, Warenkorbabbruch, Produkt angesehen, nach dem Kauf, Rückgewinnung.',
    ton: '',
    material: '',
    hinweis: '',
    status: 'text',
  },
  {
    kennung: 'K5',
    art: 'karussell',
    serie: 'Referenz',
    saeule: 1,
    titel: 'Referenz: von Magento zu Shopify. Und danach?',
    ziel: 'Beweis. Das stärkste Stück für Profilbesucher aus dem Outreach. Anheften auf Platz 2.',
    hook: '[IM HUB ERGÄNZEN: Referenzkunde]: VON MAGENTO ZU SHOPIFY. UND DANACH?',
    slides: [
      {
        label: '1 (Hook)',
        text: '[IM HUB ERGÄNZEN: Referenzkunde]: VON MAGENTO ZU SHOPIFY. UND DANACH?',
        gestaltung: 'Vorlage B. Kundenlogo in Weiß oben rechts, 160 px breit.',
        sprecher: '',
      },
      { label: '2', text: 'DIE AUSGANGSLAGE\n\n[IM HUB ERGÄNZEN: 2 Sätze — welche Magento-Version, was war das Problem]', gestaltung: 'Vorlage W.', sprecher: '' },
      {
        label: '3',
        text: 'DER UMZUG\n\n[IM HUB ERGÄNZEN: was umgezogen wurde — z. B. Produkte, Kunden, Bestellungen, Redirects, Märkte]\n\nGeplant, umgesetzt und begleitet von uns selbst.',
        gestaltung: 'Vorlage W, Liste mit Eisblau-Markern.',
        sprecher: '',
      },
      { label: '4', text: 'UND DANACH\n\nHeute betreuen wir das komplette Online-Marketing.', gestaltung: 'Vorlage B.', sprecher: '' },
      {
        label: '5',
        text: 'WAS SICH VERÄNDERT HAT\n\n[IM HUB ERGÄNZEN: freigegebene Kennzahl 1, mit Zeitraum und Vergleich]\n[IM HUB ERGÄNZEN: freigegebene Kennzahl 2]',
        gestaltung: 'Vorlage W. Kennzahlen in Krona One 120 pt Bordeaux, Erklärung darunter Albert Sans 500.',
        sprecher: '',
      },
      { label: '6', text: '„[IM HUB ERGÄNZEN: freigegebenes Kundenzitat]“\n\nName, Funktion', gestaltung: 'Vorlage E, Zitat in Weiß, 48 pt.', sprecher: '' },
      { label: '7 (CTA)', text: 'EUER UMZUG. UNSER PLAN.\n\nErstgespräch über den Link im Profil.', gestaltung: 'Vorlage E.', sprecher: '' },
    ],
    caption:
      'Der Shop lief auf Magento. Heute läuft er auf Shopify, und wir betreuen das komplette Online-Marketing.\n\n' +
      'Die Migration haben wir selbst geplant und umgesetzt. [IM HUB ERGÄNZEN: 1–2 Sätze, was dabei schwierig war und wie ihr es gelöst habt.] Danach sind wir geblieben: [IM HUB ERGÄNZEN: welche Leistungen ihr heute macht, z. B. Tracking, Ads, E-Mail].\n\n' +
      'Wir zeigen diesen Case, weil er zeigt, wie wir arbeiten: Wer den Umzug gebaut hat, kennt den Shop auch danach. Keine Übergabe an ein anderes Team, kein neues Onboarding.\n\n' +
      '[IM HUB ERGÄNZEN: eine freigegebene Kennzahl mit Zeitraum, sonst Satz streichen]\n\n' +
      'Ihr sitzt auf Magento oder Shopware und wollt wissen, wie euer Umzug aussehen würde? Bucht ein Erstgespräch über den Link im Profil.',
    cta: 'Erstgespräch',
    hashtags: '#shopifymigration #magento #shopify #shopifyplus #casestudy #ecommerce #onlineshop #shopifyagentur #onlinehandel #d2c',
    alt_text:
      'Karussell zur Referenz. Titel: Von Magento zu Shopify. Und danach? Die Seiten beschreiben Ausgangslage, Umzug und die heutige Betreuung des gesamten Online-Marketings durch Velonify.',
    ton: '',
    material: 'Kundenlogo in Weiß.',
    hinweis:
      'Voraussetzung: Freigabe von Zahlen und Zitat. Kommen sie bis 13.10. nicht, erscheint die Version ohne Slide 5 und 6 (Prozess statt Ergebnis). Kundenname, Zahlen und Zitat hier eintragen, sobald sie freigegeben sind.',
    status: 'wartet',
  },
  {
    kennung: 'R1',
    art: 'reel',
    serie: 'UMZUGSPLAN',
    saeule: 1,
    titel: 'Redirects in 20 Sekunden',
    ziel: 'Reichweite bei Umzüglern, Profilbesuche. Länge 20 Sekunden.',
    hook: 'EUER SHOP IST UMGEZOGEN. GOOGLE WEISS DAVON NICHTS.',
    slides: [
      {
        label: '0–2',
        text: 'EUER SHOP IST UMGEZOGEN. GOOGLE WEISS DAVON NICHTS.',
        gestaltung: 'Bordeaux-Fläche, Text knallt zeilenweise rein.',
        sprecher: 'Euer Shop ist umgezogen. Google weiß davon nichts.',
      },
      {
        label: '2–6',
        text: 'DIE ALTE ADRESSE STEHT NOCH IN GOOGLE.',
        gestaltung: 'Weiße Fläche, stilisierte Browserzeile (eckig, Espresso-Rahmen), eine alte URL tippt sich: /damen/jeans-blau.html',
        sprecher: 'Die alte Adresse steht noch in Google.',
      },
      {
        label: '6–10',
        text: 'OHNE WEITERLEITUNG: FEHLERSEITE.',
        gestaltung: 'Enter → harter Schnitt auf Espresso-Fläche mit großem „404“ in Weiß.',
        sprecher: 'Ohne Weiterleitung landet jeder Besucher auf einer Fehlerseite.',
      },
      {
        label: '10–15',
        text: 'MIT 301: DER BESUCHER KOMMT AN. GOOGLE AUCH.',
        gestaltung: 'Zurück zur Browserzeile, Pfeil animiert von alt nach neu /products/jeans-blau, Label „301“ in Eisblau-Kasten.',
        sprecher: 'Mit einer 301-Weiterleitung kommen Besucher und Google dort an, wo das Produkt jetzt liegt.',
      },
      { label: '15–18', text: 'EINE ZEILE PRO URL. VOR DEM LIVEGANG.', gestaltung: 'Liste mit vielen Zeilen alt → neu scrollt schnell durch.', sprecher: 'Eine Zeile pro URL. Vor dem Livegang.' },
      { label: '18–20', text: 'UMZUGSPLAN · VELONIFY', gestaltung: 'Endcard Vorlage E, Velonify-Wordmark.', sprecher: '' },
    ],
    caption:
      'Ein Umzug auf Shopify ändert eure URLs. Google kennt aber noch die alten.\n\n' +
      'Ohne Weiterleitung landet jeder, der über Google oder einen alten Link kommt, auf einer Fehlerseite. Mit einer 301-Weiterleitung kommt er dort an, wo das Produkt jetzt liegt. Und Google versteht, dass die Seite umgezogen ist.\n\n' +
      'Deshalb bauen wir das Redirect-Mapping vor dem Livegang: eine Zeile pro URL, alt → neu. Produkte, Kategorien, CMS-Seiten und die Filterseiten, die gern vergessen werden.\n\n' +
      'Das ist keine Kür. Es ist der Teil der Migration, der entscheidet, ob eure Rankings mitkommen.\n\n' +
      'Ihr plant einen Umzug? Schreibt UMZUG per DM, wir schicken euch unsere Checkliste.',
    cta: 'DM „UMZUG“',
    hashtags: '#shopmigration #shopify #magento #shopware #woocommerce #seo #redirects #onlineshop #ecommerce #shopifyagentur',
    alt_text:
      'Animiertes Video. Eine alte Shop-URL führt ohne Weiterleitung auf eine 404-Fehlerseite, mit 301-Weiterleitung auf die neue Produktseite. Text: Eine Zeile pro URL, vor dem Livegang.',
    ton: 'Kein Trend-Audio. Minimaler Beat aus der Instagram-Business-Bibliothek, dazu Tipp- und Klickgeräusche passend zur Animation. Standard ohne Stimme. Wenn KI-Stimme: in der Caption „Stimme KI-generiert“ ergänzen und die KI-Kennzeichnung in Instagram aktivieren.',
    material: '',
    hinweis: '',
    status: 'text',
  },
  {
    kennung: 'R2',
    art: 'reel',
    serie: 'DATENLECK #2',
    saeule: 2,
    titel: 'Purchase feuert doppelt',
    ziel: 'Kompetenz bei Shopify-Bestand, Kommentare, DM „DATEN“. Länge 25 Sekunden.',
    hook: 'EIN KAUF. ZWEI CONVERSIONS.',
    slides: [
      { label: '0–2', text: 'EIN KAUF. ZWEI CONVERSIONS.', gestaltung: 'Bordeaux-Fläche, „1 KAUF“ links, „2 CONVERSIONS“ rechts, rechte Seite blinkt einmal.', sprecher: 'Ein Kauf. Zwei Conversions.' },
      { label: '2–8', text: 'WIR KAUFEN IM TESTSHOP.', gestaltung: 'Screenrecording: Testkauf im Checkout, Bestellbestätigung erscheint.', sprecher: 'Wir machen einen Testkauf.' },
      {
        label: '8–14',
        text: 'DAS PURCHASE-EVENT FEUERT ZWEIMAL.',
        gestaltung: 'Screenrecording Tag Assistant / GTM-Vorschau, Zoom auf zwei „purchase“-Einträge, eckiger Eisblau-Rahmen markiert beide.',
        sprecher: 'Das Purchase-Event feuert zweimal.',
      },
      { label: '14–19', text: 'ZWEI QUELLEN, DIE DASSELBE MELDEN.', gestaltung: 'Split: links „App-Pixel“, rechts „GTM-Tag“, beide Kästen Bordeaux.', sprecher: 'Eine App und ein eigener Tag melden denselben Kauf.' },
      { label: '19–23', text: 'FOLGE: KAMPAGNEN SEHEN BESSER AUS, ALS SIE SIND.', gestaltung: 'Weiße Fläche.', sprecher: 'Eure Kampagnen sehen dann besser aus, als sie sind.' },
      { label: '23–25', text: 'DATENLECK · VELONIFY', gestaltung: 'Endcard Vorlage E.', sprecher: '' },
    ],
    caption:
      'Ein Kauf, zwei Conversions. Das fällt selten auf, weil die Zahlen dann ja gut aussehen.\n\n' +
      'Im Video zeigen wir es an unserem Testshop: Eine App bringt ihr eigenes Pixel mit, und zusätzlich läuft ein Purchase-Tag im Google Tag Manager. Beide melden denselben Kauf.\n\n' +
      'Die Folge: Eure Kampagnen sehen besser aus, als sie sind. Und ihr erhöht Budget auf Basis einer Zahl, die nicht stimmt.\n\n' +
      'So prüft ihr es selbst: Testkauf machen, Tag Assistant oder GTM-Vorschau offen lassen und zählen, wie oft purchase auftaucht. Einmal ist richtig.\n\n' +
      'Zweimal gesehen? Schreibt DATEN per DM.',
    cta: 'DM „DATEN“',
    hashtags: '#tracking #ga4 #googletagmanager #metaads #googleads #shopify #performancemarketing #conversiontracking #ecommerce #onlineshop',
    alt_text:
      'Bildschirmaufnahme eines Testkaufs in einem Shopify-Testshop. Im Google Tag Manager erscheint das Purchase-Event zweimal, markiert mit einem Rahmen. Text: Ein Kauf, zwei Conversions.',
    ton: 'Trockener elektronischer Loop, Signalton bei jedem „purchase“-Treffer. Keine Stimme als Standard.',
    material: 'Screenrecording aus einem Velonify-Testshop (Shopify-Entwicklungsshop) mit absichtlich doppelt eingebautem Purchase-Tag. Keine Kundendaten.',
    hinweis: '',
    status: 'text',
  },
  {
    kennung: 'R3',
    art: 'reel',
    serie: 'KEIN UMWEG',
    saeule: 4,
    titel: 'So sieht unser Ticketsystem aus',
    ziel: 'Positionierung mit Augenzwinkern, Shares, Profilbesuche. Länge 15 Sekunden.',
    hook: 'SO SIEHT UNSER TICKETSYSTEM AUS:',
    slides: [
      { label: '0–2', text: 'SO SIEHT UNSER TICKETSYSTEM AUS:', gestaltung: 'Weiße Fläche, Text Bordeaux.', sprecher: '' },
      {
        label: '2–6',
        text: '',
        gestaltung: 'Nachgebaute Chat-Oberfläche in Markenfarben (eckige Blasen, keine echten Logos): Nachricht „Kurze Frage: Warum lädt der Checkout so langsam?“ Klein unten links: „Nachgestellt“.',
        sprecher: '',
      },
      { label: '6–10', text: '', gestaltung: 'Antwort erscheint: „Schau ich mir an. Ich hab den gebaut. – Julian“. Klein unten links weiterhin: „Nachgestellt“.', sprecher: '' },
      { label: '10–13', text: 'KEIN TICKET. KEINE WEITERLEITUNG. DIE PERSON, DIE ES GEBAUT HAT.', gestaltung: 'Bordeaux-Fläche.', sprecher: '' },
      { label: '13–15', text: 'EUER SHOP. UNSER TEAM. KEIN UMWEG.', gestaltung: 'Endcard.', sprecher: '' },
    ],
    caption:
      'Wie wir Anfragen organisieren? Gar nicht. Die Person, die euer Projekt baut, liest eure Nachricht.\n\n' +
      'Wir sind drei Leute. Lukas, Johannes und Julian. Wenn ihr eine Frage zum Checkout habt, antwortet die Person, die den Checkout gebaut hat. Wenn es um eure Kampagnen geht, antwortet die Person, die sie steuert.\n\n' +
      'Das spart keine Zeit, weil wir schneller tippen. Es spart Zeit, weil niemand erst nachfragen muss, worum es eigentlich geht.\n\n' +
      'Natürlich dokumentieren wir trotzdem. Aber nicht zwischen euch und uns.\n\n' +
      'Wollt ihr das ausprobieren? Erstgespräch über den Link im Profil, direkt mit einem von uns.',
    cta: 'Erstgespräch',
    hashtags: '#shopifyagentur #agenturalltag #ecommerce #shopify #onlineshop #ecommerceagentur #onlinehandel #d2c',
    alt_text:
      'Animiertes Video. Text: So sieht unser Ticketsystem aus. Ein nachgestellter Chat zeigt eine Frage zum Checkout und die Antwort: Schau ich mir an, ich hab den gebaut, Julian. Schlusstext: Euer Shop. Unser Team. Kein Umweg.',
    ton: 'Nachrichten-Pling bei jeder Blase, sonst Stille, dann kurzer Beat ab Sekunde 10.',
    material: '',
    hinweis: 'Der Hinweis „Nachgestellt“ muss während Sekunde 2–10 sichtbar sein.',
    status: 'text',
  },
  {
    kennung: 'R4',
    art: 'reel',
    serie: 'SHOP-BEFUND #1',
    saeule: 3,
    titel: 'Vier Stellen im Checkout',
    ziel: 'Conversion-Optimierung zeigen, Speicherungen, Erstgespräch. Länge 30 Sekunden.',
    hook: 'VIER STELLEN IM CHECKOUT, AN DENEN WIR ZUERST SCHAUEN.',
    slides: [
      { label: '0–2', text: 'VIER STELLEN IM CHECKOUT, AN DENEN WIR ZUERST SCHAUEN.', gestaltung: 'Bordeaux-Fläche.', sprecher: 'Vier Stellen im Checkout, an denen wir zuerst schauen.' },
      {
        label: '2–8',
        text: '1 · VERSANDKOSTEN KOMMEN ZU SPÄT',
        gestaltung: 'Screenrecording Produktseite → Warenkorb, Versandkosten erscheinen erst im Checkout. Eisblau-Rahmen um Versandzeile.',
        sprecher: 'Versandkosten, die erst im Checkout auftauchen.',
      },
      { label: '8–14', text: '2 · KONTO ALS PFLICHT', gestaltung: 'Checkout mit Pflicht-Kundenkonto, Rahmen um „Konto erstellen“.', sprecher: 'Ein Kundenkonto als Pflicht vor dem Kauf.' },
      {
        label: '14–20',
        text: '3 · ZAHLUNGSARTEN ZU SPÄT SICHTBAR',
        gestaltung: 'Zahlungsarten-Liste, Rahmen um fehlende bzw. versteckte Optionen.',
        sprecher: 'Zahlungsarten, die man erst im letzten Schritt sieht.',
      },
      {
        label: '20–26',
        text: '4 · GUTSCHEINFELD SCHICKT KUNDEN ZUR SUCHE',
        gestaltung: 'Gutscheinfeld groß und prominent, Cursor verlässt Tab.',
        sprecher: 'Ein Gutscheinfeld, das Kunden zum Suchen nach Codes schickt.',
      },
      { label: '26–30', text: 'SHOP-BEFUND · VELONIFY', gestaltung: 'Endcard Vorlage E.', sprecher: '' },
    ],
    caption:
      'Wenn Besucher im Checkout abspringen, liegt es selten am Design. Meistens liegt es an einer Überraschung.\n\n' +
      'Bei einem CRO-Audit schauen wir zuerst an diese vier Stellen:\n' +
      '1. Versandkosten, die erst im Checkout auftauchen\n' +
      '2. Ein Kundenkonto als Pflicht vor dem Kauf\n' +
      '3. Zahlungsarten, die erst im letzten Schritt sichtbar sind\n' +
      '4. Ein Gutscheinfeld, das Kunden in einen neuen Tab schickt, um nach Codes zu suchen\n\n' +
      'Keine dieser Stellen braucht ein Redesign. Die meisten lassen sich direkt im Shop beheben.\n\n' +
      'Ob sie bei euch wirklich Käufe kosten, zeigen eure Daten, nicht unsere Liste. Genau das prüfen wir im Audit.\n\n' +
      'Neugierig, wo euer Shop Besucher verliert? Erstgespräch über den Link im Profil.',
    cta: 'Erstgespräch',
    hashtags: '#conversionoptimierung #cro #checkout #shopify #onlineshop #ecommerce #ux #shopifyplus #onlinehandel #ecommercedeutschland',
    alt_text:
      'Bildschirmaufnahme eines Test-Checkouts. Vier Stellen werden nacheinander markiert: Versandkosten erst im Checkout, Kundenkonto als Pflicht, spät sichtbare Zahlungsarten, auffälliges Gutscheinfeld.',
    ton: 'Ruhiger Loop, kurzer Klickton bei jedem neuen Rahmen.',
    material: 'Screenrecording im Velonify-Testshop, jeweils Vorher/Nachher. Keine echten Kundenshops.',
    hinweis: '',
    status: 'text',
  },
  {
    kennung: 'E1',
    art: 'einzelbild',
    serie: '',
    saeule: 4,
    titel: 'Vorstellung: Euer Shop. Unser Team. Kein Umweg.',
    ziel: 'Profil erklären. Anheften auf Platz 1.',
    hook: 'EUER SHOP. UNSER TEAM. KEIN UMWEG.',
    slides: [
      {
        label: 'Bild',
        text: 'EUER SHOP.\nUNSER TEAM.\nKEIN UMWEG.\n\nShopify-Agentur aus dem DACH-Raum. Lukas, Johannes, Julian.',
        gestaltung:
          '1080 × 1350 px. Obere 70 % Bordeaux-Vollfläche. Darauf linksbündig, Rand 80 px, drei Zeilen Krona One Weiß, 92 pt, Zeilenabstand 1,05. Untere 30 % Weiß. Darin Albert Sans 600, Espresso, 34 pt. Darunter ein Eisblau-Balken 16 px über die volle Breite innerhalb des Rands. Unten rechts „VELONIFY“ in Krona One 20 pt Bordeaux. Keine Fotos, kein Logo-Zeichen groß.',
        sprecher: '',
      },
    ],
    caption:
      'Wir sind Velonify. Eine Shopify-Agentur aus dem DACH-Raum, drei Leute: Lukas, Johannes und Julian.\n\n' +
      'Wir machen fünf Dinge. Shopify-Migration von Magento, Shopware oder WooCommerce. Tracking & Attribution, damit Daten stimmen, bevor Budget fließt. Performance Marketing mit Meta Ads und Google Ads, gesteuert nach Umsatz und Marge. E-Mail & Retention mit Klaviyo. Und Conversion-Optimierung direkt im Shop.\n\n' +
      'Das Besondere daran ist nicht die Liste. Es ist, wer sie umsetzt. Bei uns beantwortet die Person eure Fragen, die euer Projekt baut. Keine Subunternehmer, kein Ticketsystem, keine Freigabeschleifen.\n\n' +
      'Hier zeigen wir, wie wir arbeiten: Checklisten, Fehler aus dem Alltag, Baupläne. Folgt uns, wenn euer Shop gerade auf einem dieser Themen hängt.',
    cta: 'Folgen',
    hashtags: '#shopifyagentur #shopify #shopifyplus #ecommerce #onlineshop #ecommerceagentur #onlinehandel #ecommercedeutschland #dach',
    alt_text: 'Bordeauxrote Fläche mit weißer Schrift: Euer Shop. Unser Team. Kein Umweg. Darunter auf Weiß: Shopify-Agentur aus dem DACH-Raum. Lukas, Johannes, Julian.',
    ton: '',
    material: '',
    hinweis: 'Nach der Veröffentlichung anheften.',
    status: 'text',
  },
  {
    kennung: 'E2',
    art: 'einzelbild',
    serie: 'UMZUGSPLAN',
    saeule: 1,
    titel: 'Magento 1 ohne Sicherheitsupdates',
    ziel: 'Umzügler auf Magento 1 aufrütteln, Kommentare, Shares.',
    hook: 'MAGENTO 1 BEKOMMT SEIT JUNI 2020 KEINE OFFIZIELLEN SICHERHEITSUPDATES MEHR.',
    slides: [
      {
        label: 'Bild',
        text: 'MAGENTO 1 BEKOMMT SEIT JUNI 2020 KEINE OFFIZIELLEN SICHERHEITSUPDATES MEHR.\n\nLäuft euer Shop noch darauf?',
        gestaltung:
          '1080 × 1350 px, Vorlage W (weiß). Oben links Label „UMZUGSPLAN“ in Eisblau-Kasten. Mittig, linksbündig, Krona One Bordeaux 76 pt. Darunter mit 60 px Abstand Albert Sans 700, Espresso, 44 pt. Unterer Rand: Bordeaux-Balken 120 px hoch über volle Breite, darin „VELONIFY“ weiß, rechts. Keine Grafik, keine Icons.',
        sprecher: '',
      },
    ],
    caption:
      'Adobe hat den offiziellen Support für Magento 1 im Juni 2020 beendet. Seitdem gibt es keine offiziellen Sicherheitsupdates mehr.\n\n' +
      'Trotzdem laufen noch Shops darauf. Oft, weil der Umzug größer wirkt als das Risiko. Und weil der Shop ja noch verkauft.\n\n' +
      'Das Problem ist nicht der heutige Tag. Es ist der Tag, an dem eine Zahlungs-App nicht mehr kompatibel ist, ein Sicherheitsproblem auftaucht oder die Person geht, die das System als einzige versteht.\n\n' +
      'Ein Umzug auf Shopify lässt sich planen, ohne Umsatz und Rankings zu verlieren. Der Plan dafür beginnt mit einer URL-Liste, nicht mit dem Export.\n\n' +
      'Ihr sitzt noch auf Magento 1 oder einer älteren Magento-2-Version? Schreibt UMZUG per DM, wir schicken euch unsere Checkliste.',
    cta: 'DM „UMZUG“',
    hashtags: '#magento #magento1 #magento2 #shopmigration #shopify #onlineshop #ecommerce #itsicherheit #shopifyagentur #onlinehandel',
    alt_text: 'Weiße Fläche mit bordeauxroter Schrift: Magento 1 bekommt seit Juni 2020 keine offiziellen Sicherheitsupdates mehr. Darunter: Läuft euer Shop noch darauf?',
    ton: '',
    material: '',
    hinweis: 'Vor dem 03.10. das Datum gegen die Adobe-Quelle abgleichen.',
    status: 'text',
  },
  {
    kennung: 'E3',
    art: 'einzelbild',
    serie: 'DATENLECK',
    saeule: 2,
    titel: 'Budget erhöhen, bevor das Tracking stimmt',
    ziel: 'Haltung zu Tracking vor Ads, Shares, Speicherungen.',
    hook: 'BUDGET ERHÖHEN, BEVOR DAS TRACKING STIMMT, HEISST: TEURER RATEN.',
    slides: [
      {
        label: 'Bild',
        text: 'BUDGET ERHÖHEN,\nBEVOR DAS TRACKING\nSTIMMT, HEISST:\nTEURER RATEN.',
        gestaltung:
          '1080 × 1350 px, Vorlage E (Espresso-Vollfläche). Mittig, linksbündig, Rand 80 px, Krona One Weiß 80 pt, vier Zeilen. Das Wort „TEURER RATEN.“ in Eisblau. Unten links Label „DATENLECK“ in Albert Sans 800, Eisblau, 24 pt. Unten rechts „VELONIFY“ Weiß.',
        sprecher: '',
      },
    ],
    caption:
      'Mehr Budget macht falsche Daten nicht richtiger. Es macht sie nur teurer.\n\n' +
      'Bevor wir Meta Ads oder Google Ads skalieren, prüfen wir drei Dinge: Kommt jede Conversion genau einmal an? Kommt sie mit dem richtigen Wert an? Und stimmt sie ungefähr mit dem überein, was Shopify als Bestellung zählt?\n\n' +
      'Wenn eine dieser Fragen offen ist, steuert der Algorithmus auf eine Zahl, die es so nicht gibt. Er optimiert dann fleißig in die falsche Richtung.\n\n' +
      'Deshalb steht Tracking bei uns vor Performance Marketing. Nicht, weil es spannender ist, sondern weil alles andere darauf aufbaut.\n\n' +
      'Wann habt ihr euer Tracking zuletzt mit einem Testkauf geprüft? Schreibt es in die Kommentare.',
    cta: 'Kommentar',
    hashtags: '#tracking #performancemarketing #metaads #googleads #ga4 #conversionsapi #shopify #ecommerce #onlinemarketing #datenqualitaet',
    alt_text: 'Dunkelbraune Fläche mit weißer Schrift: Budget erhöhen, bevor das Tracking stimmt, heißt: teurer raten. Die Worte teurer raten sind hellblau hervorgehoben.',
    ton: '',
    material: '',
    hinweis: '',
    status: 'text',
  },

  // Stories
  {
    kennung: 'S1',
    art: 'story',
    serie: 'Umfrage',
    saeule: 1,
    titel: 'Systemfrage',
    ziel: 'Zielgruppe sortieren und sehen, wie viele Umzügler mitlesen.',
    hook: 'AUF WELCHEM SYSTEM LÄUFT EUER SHOP?',
    slides: [{ label: 'Frame 1', text: 'AUF WELCHEM SYSTEM LÄUFT EUER SHOP?', gestaltung: 'Bordeaux.', sprecher: '' }],
    caption: '',
    cta: '',
    hashtags: '',
    alt_text: '',
    ton: 'Umfrage mit 4 Optionen: Magento · Shopware · WooCommerce · Shopify (Quiz-Sticker als Mehrfachauswahl ohne richtige Antwort).',
    material: '',
    hinweis: '',
    status: 'text',
  },
  {
    kennung: 'S2',
    art: 'story',
    serie: 'Richtig oder falsch',
    saeule: 1,
    titel: 'Passwörter',
    ziel: 'Ein Missverständnis zum Umzug geraderücken.',
    hook: 'KUNDENPASSWÖRTER KANN MAN BEIM UMZUG MITNEHMEN.',
    slides: [
      { label: 'Frame 1', text: 'KUNDENPASSWÖRTER KANN MAN BEIM UMZUG MITNEHMEN.', gestaltung: 'Aussage in Krona One auf Bordeaux.', sprecher: '' },
      {
        label: 'Frame 2',
        text: 'Falsch. Passwörter lassen sich nicht übertragen. Kund:innen aktivieren ihr Konto neu. Das plant man als E-Mail-Strecke. – Lukas',
        gestaltung: 'Auflösung in 2 Sätzen auf Weiß, unterschrieben mit Namen.',
        sprecher: '',
      },
    ],
    caption: '',
    cta: '',
    hashtags: '',
    alt_text: '',
    ton: 'Quiz-Sticker mit „Richtig“ / „Falsch“.',
    material: '',
    hinweis: '',
    status: 'text',
  },
  {
    kennung: 'S3',
    art: 'story',
    serie: 'Umfrage',
    saeule: 1,
    titel: 'Umzugsplan',
    ziel: 'Bedarf bei den Mitlesenden messen.',
    hook: 'STEHT BEI EUCH EIN UMZUG AN?',
    slides: [{ label: 'Frame 1', text: 'STEHT BEI EUCH EIN UMZUG AN?', gestaltung: 'Reshare K1, Frage darunter.', sprecher: '' }],
    caption: '',
    cta: '',
    hashtags: '',
    alt_text: '',
    ton: 'Umfrage: Dieses Jahr · Nächstes Jahr · Kein Thema.',
    material: '',
    hinweis: '',
    status: 'text',
  },
  {
    kennung: 'S4',
    art: 'story',
    serie: 'Freitagsfrage',
    saeule: 4,
    titel: 'Agentur-Fragen',
    ziel: 'Material für die Montagsantworten und für künftige Posts sammeln.',
    hook: 'WAS WOLLTET IHR EINE AGENTUR SCHON IMMER FRAGEN?',
    slides: [{ label: 'Frame 1', text: 'WAS WOLLTET IHR EINE AGENTUR SCHON IMMER FRAGEN?', gestaltung: 'Frage auf Bordeaux.', sprecher: '' }],
    caption: '',
    cta: '',
    hashtags: '',
    alt_text: '',
    ton: 'Fragesticker. Antworten am Montag, je Antwort ein Frame, mit Namen unterschrieben.',
    material: '',
    hinweis: '',
    status: 'text',
  },
  {
    kennung: 'S5',
    art: 'story',
    serie: 'Umfrage',
    saeule: 2,
    titel: 'Datenlücke',
    ziel: 'Sehen, wie verbreitet das Thema ist, und DMs auslösen.',
    hook: 'WEICHT GA4 BEI EUCH VON SHOPIFY AB?',
    slides: [{ label: 'Frame 1', text: 'WEICHT GA4 BEI EUCH VON SHOPIFY AB?', gestaltung: 'Reshare K2.', sprecher: '' }],
    caption: '',
    cta: '',
    hashtags: '',
    alt_text: '',
    ton: 'Umfrage: Ja, stark · Ja, etwas · Keine Ahnung.',
    material: '',
    hinweis: '',
    status: 'text',
  },
  {
    kennung: 'S6',
    art: 'story',
    serie: 'Richtig oder falsch',
    saeule: 2,
    titel: 'Consent',
    ziel: 'Consent Mode erklären, ohne zu belehren.',
    hook: 'WER DAS COOKIE-BANNER ABLEHNT, IST FÜR GA4 UNSICHTBAR.',
    slides: [
      { label: 'Frame 1', text: 'WER DAS COOKIE-BANNER ABLEHNT, IST FÜR GA4 UNSICHTBAR.', gestaltung: 'Aussage auf Bordeaux.', sprecher: '' },
      {
        label: 'Frame 2',
        text: 'Teilweise. Mit Consent Mode kommen Signale ohne Cookies an, GA4 modelliert daraus. Ohne Consent Mode fehlt der Besuch. – Julian',
        gestaltung: 'Auflösung auf Weiß.',
        sprecher: '',
      },
    ],
    caption: '',
    cta: '',
    hashtags: '',
    alt_text: '',
    ton: 'Quiz-Sticker.',
    material: '',
    hinweis: '',
    status: 'text',
  },
  {
    kennung: 'S7',
    art: 'story',
    serie: 'Aus dem Projekt',
    saeule: 1,
    titel: 'Redirect-Mapping',
    ziel: 'Echte Arbeit zeigen, ohne einen Kundenshop preiszugeben.',
    hook: 'SO SIEHT EIN REDIRECT-MAPPING AUS. EINE ZEILE PRO URL.',
    slides: [
      {
        label: 'Frame 1',
        text: 'SO SIEHT EIN REDIRECT-MAPPING AUS. EINE ZEILE PRO URL.',
        gestaltung: 'Screenshot einer Mapping-Tabelle auf Espresso, URLs verpixelt bis auf das Pfadmuster.',
        sprecher: '',
      },
      { label: 'Frame 2', text: 'Filterseiten vergisst man gern.', gestaltung: 'Was wir geändert haben.', sprecher: '' },
    ],
    caption: '',
    cta: '',
    hashtags: '',
    alt_text: '',
    ton: 'Umfrage: Habt ihr so eins? Ja · Nein.',
    material: 'Anonymisierter Screenshot eines Redirect-Mappings.',
    hinweis: '',
    status: 'text',
  },
  {
    kennung: 'S8',
    art: 'story',
    serie: 'Richtig oder falsch',
    saeule: 3,
    titel: 'Flows',
    ziel: 'Die Reihenfolge Flows vor Kampagnen begründen.',
    hook: 'KAMPAGNEN BRINGEN MEHR ALS FLOWS.',
    slides: [
      { label: 'Frame 1', text: 'KAMPAGNEN BRINGEN MEHR ALS FLOWS.', gestaltung: 'Aussage auf Bordeaux.', sprecher: '' },
      {
        label: 'Frame 2',
        text: 'Kommt drauf an. Flows laufen aber jeden Tag ohne Aufwand. Deshalb bauen wir sie zuerst. – Johannes',
        gestaltung: 'Auflösung auf Weiß.',
        sprecher: '',
      },
    ],
    caption: '',
    cta: '',
    hashtags: '',
    alt_text: '',
    ton: 'Quiz-Sticker.',
    material: '',
    hinweis: '',
    status: 'text',
  },
  {
    kennung: 'S9',
    art: 'story',
    serie: 'Umfrage',
    saeule: 3,
    titel: 'Gastbestellung',
    ziel: 'Aufhänger für das Checkout-Thema schaffen.',
    hook: 'KÖNNEN KUNDEN BEI EUCH OHNE KONTO KAUFEN?',
    slides: [{ label: 'Frame 1', text: 'KÖNNEN KUNDEN BEI EUCH OHNE KONTO KAUFEN?', gestaltung: 'Frage auf Bordeaux.', sprecher: '' }],
    caption: '',
    cta: '',
    hashtags: '',
    alt_text: '',
    ton: 'Umfrage: Ja · Nein · Weiß nicht.',
    material: '',
    hinweis: '',
    status: 'text',
  },
  {
    kennung: 'S10',
    art: 'story',
    serie: 'Freitagsfrage',
    saeule: 4,
    titel: 'Umzugsfragen',
    ziel: 'Fragen sammeln, die zu Säule-1-Posts werden.',
    hook: 'WAS WOLLT IHR ÜBER EINEN UMZUG AUF SHOPIFY WISSEN?',
    slides: [{ label: 'Frame 1', text: 'WAS WOLLT IHR ÜBER EINEN UMZUG AUF SHOPIFY WISSEN?', gestaltung: 'Reshare K5.', sprecher: '' }],
    caption: '',
    cta: '',
    hashtags: '',
    alt_text: '',
    ton: 'Fragesticker.',
    material: '',
    hinweis: '',
    status: 'text',
  },
];

// ─── Redaktionsplan 22.09. bis 21.10.2026 ────────────────────────────────────

export const SOCIAL_START_PLAN: SocialStartPlan[] = [
  { ...IG, datum: '2026-09-22', format: 'einzelbild', saeule: 4, thema: 'Vorstellung „Euer Shop. Unser Team. Kein Umweg.“ (anheften)', kennung: 'E1', status: 'in_arbeit', hinweis: 'Design offen', zustaendig: 'Johannes' },
  { ...STORY, datum: '2026-09-22', format: 'story', saeule: 1, thema: 'Umfrage: Auf welchem System läuft euer Shop?', kennung: 'S1', status: 'bereit', hinweis: 'Text fertig', zustaendig: '' },
  { ...STORY, datum: '2026-09-23', format: 'story', saeule: 1, thema: 'Richtig oder falsch: Kundenpasswörter lassen sich mitnehmen?', kennung: 'S2', status: 'bereit', hinweis: 'Text fertig', zustaendig: 'Lugge' },
  { ...LINKEDIN, datum: '2026-09-23', format: 'textpost', saeule: 4, thema: 'Velonify ist gestartet – aus E1 umgeschrieben', kennung: '', status: 'geplant', hinweis: '', zustaendig: 'Lugge' },
  { ...IG, datum: '2026-09-24', format: 'karussell', saeule: 1, thema: 'UMZUGSPLAN #1: 7 Dinge vor dem ersten Export', kennung: 'K1', status: 'in_arbeit', hinweis: 'Design offen', zustaendig: 'Johannes' },
  { ...STORY, datum: '2026-09-24', format: 'story', saeule: 1, thema: 'Reshare K1 + Umfrage: Steht bei euch ein Umzug an?', kennung: 'S3', status: 'bereit', hinweis: 'Text fertig', zustaendig: '' },
  { ...STORY, datum: '2026-09-25', format: 'story', saeule: 4, thema: 'Freitagsfrage: „Was wolltet ihr eine Agentur schon immer fragen?“', kennung: 'S4', status: 'bereit', hinweis: 'Text fertig', zustaendig: 'Lugge' },
  { ...IG, datum: '2026-09-26', format: 'einzelbild', saeule: 2, thema: 'Budget vor Tracking = teurer raten', kennung: 'E3', status: 'in_arbeit', hinweis: 'Design offen', zustaendig: 'Johannes' },
  { ...STORY, datum: '2026-09-28', format: 'story', saeule: 4, thema: 'Antworten auf die Freitagsfrage, je Frage ein Frame', kennung: '', status: 'geplant', hinweis: '', zustaendig: 'Lugge' },
  { ...IG, datum: '2026-09-29', format: 'karussell', saeule: 2, thema: 'DATENLECK #1: GA4 vs. Shopify', kennung: 'K2', status: 'in_arbeit', hinweis: 'Design offen', zustaendig: 'Johannes' },
  { ...STORY, datum: '2026-09-29', format: 'story', saeule: 2, thema: 'Umfrage: Weicht GA4 bei euch ab?', kennung: 'S5', status: 'bereit', hinweis: 'Text fertig', zustaendig: '' },
  { ...STORY, datum: '2026-09-30', format: 'story', saeule: 2, thema: 'Richtig oder falsch: Consent-Banner und Tracking', kennung: 'S6', status: 'bereit', hinweis: 'Text fertig', zustaendig: 'Julian' },
  { ...LINKEDIN, datum: '2026-09-30', format: 'pdf', saeule: 1, thema: 'K1 als PDF', kennung: 'K1', status: 'geplant', hinweis: '', zustaendig: 'Lugge' },
  { ...IG, datum: '2026-10-01', format: 'reel', saeule: 1, thema: 'Redirects in 20 Sekunden', kennung: 'R1', status: 'in_arbeit', hinweis: 'Animation offen', zustaendig: 'Johannes' },
  { ...STORY, datum: '2026-10-01', format: 'story', saeule: 1, thema: 'Aus dem Projekt: anonymisiertes Redirect-Mapping', kennung: 'S7', status: 'in_arbeit', hinweis: 'Screenshot offen', zustaendig: '' },
  { ...STORY, datum: '2026-10-02', format: 'story', saeule: 1, thema: 'Freitagsfrage: „Was macht euch beim Umzug am meisten Sorgen?“', kennung: '', status: 'bereit', hinweis: 'Text fertig', zustaendig: 'Lugge' },
  { ...IG, datum: '2026-10-03', format: 'einzelbild', saeule: 1, thema: 'Magento 1 ohne Sicherheitsupdates', kennung: 'E2', status: 'in_arbeit', hinweis: 'Datum gegen die Adobe-Quelle prüfen', zustaendig: 'Johannes' },
  { ...STORY, datum: '2026-10-05', format: 'story', saeule: 1, thema: 'Antworten auf die Freitagsfrage', kennung: '', status: 'geplant', hinweis: '', zustaendig: 'Lugge' },
  { ...IG, datum: '2026-10-06', format: 'karussell', saeule: 4, thema: 'KEIN UMWEG #1: Wer antwortet?', kennung: 'K3', status: 'in_arbeit', hinweis: 'Rollen je Person offen', zustaendig: 'Johannes' },
  { ...STORY, datum: '2026-10-06', format: 'story', saeule: 4, thema: 'Reshare K3 + Fragesticker: „Was nervt euch an Agenturen?“', kennung: '', status: 'bereit', hinweis: 'Text fertig', zustaendig: '' },
  { ...STORY, datum: '2026-10-07', format: 'story', saeule: 3, thema: 'Richtig oder falsch: Flows vs. Kampagnen', kennung: 'S8', status: 'bereit', hinweis: 'Text fertig', zustaendig: 'Johannes' },
  { ...LINKEDIN, datum: '2026-10-07', format: 'pdf', saeule: 2, thema: 'K2 als PDF', kennung: 'K2', status: 'geplant', hinweis: '', zustaendig: 'Lugge' },
  { ...IG, datum: '2026-10-08', format: 'reel', saeule: 2, thema: 'DATENLECK #2: Purchase feuert doppelt', kennung: 'R2', status: 'in_arbeit', hinweis: 'Aufnahme offen', zustaendig: 'Julian' },
  { ...STORY, datum: '2026-10-08', format: 'story', saeule: 2, thema: 'Aus dem Projekt: Tag-Assistant-Screenshot aus dem Testshop', kennung: '', status: 'geplant', hinweis: '', zustaendig: 'Julian' },
  { ...STORY, datum: '2026-10-09', format: 'story', saeule: 2, thema: 'Freitagsfrage: „Welches Tool zeigt bei euch die ‚richtige‘ Zahl?“', kennung: '', status: 'bereit', hinweis: 'Text fertig', zustaendig: 'Lugge' },
  { ...IG, datum: '2026-10-10', format: 'karussell', saeule: 3, thema: 'FLOW-BAUPLAN #1: 5 Klaviyo-Flows', kennung: 'K4', status: 'in_arbeit', hinweis: 'Design offen', zustaendig: 'Johannes' },
  { ...STORY, datum: '2026-10-12', format: 'story', saeule: 2, thema: 'Antworten auf die Freitagsfrage', kennung: '', status: 'geplant', hinweis: '', zustaendig: 'Lugge' },
  { ...IG, datum: '2026-10-13', format: 'reel', saeule: 3, thema: 'SHOP-BEFUND #1: 4 Stellen im Checkout', kennung: 'R4', status: 'in_arbeit', hinweis: 'Aufnahme offen', zustaendig: 'Julian' },
  { ...STORY, datum: '2026-10-13', format: 'story', saeule: 3, thema: 'Umfrage Gastbestellung', kennung: 'S9', status: 'bereit', hinweis: 'Text fertig', zustaendig: '' },
  { ...STORY, datum: '2026-10-14', format: 'story', saeule: 3, thema: 'Richtig oder falsch: „Ein Warenkorbabbruch-Flow reicht mit einer E-Mail.“', kennung: '', status: 'bereit', hinweis: 'Text fertig', zustaendig: 'Johannes' },
  { ...LINKEDIN, datum: '2026-10-14', format: 'pdf', saeule: 3, thema: 'K4 als PDF', kennung: 'K4', status: 'geplant', hinweis: 'Johannes oder Julian', zustaendig: '' },
  { ...IG, datum: '2026-10-15', format: 'karussell', saeule: 1, thema: 'Referenz (anheften)', kennung: 'K5', status: 'geplant', hinweis: 'Wartet auf Freigabe von Zahlen und Zitat', zustaendig: 'Lugge' },
  { ...STORY, datum: '2026-10-15', format: 'story', saeule: 4, thema: 'Reshare K5 + Frage: „Was wollt ihr über den Umzug wissen?“', kennung: 'S10', status: 'bereit', hinweis: 'Text fertig', zustaendig: '' },
  { ...STORY, datum: '2026-10-16', format: 'story', saeule: 3, thema: 'Freitagsfrage: „Welcher Flow fehlt bei euch?“', kennung: '', status: 'bereit', hinweis: 'Text fertig', zustaendig: 'Lugge' },
  { ...IG, datum: '2026-10-17', format: 'reel', saeule: 4, thema: 'Unser Ticketsystem', kennung: 'R3', status: 'in_arbeit', hinweis: 'Animation offen', zustaendig: 'Johannes' },
  { ...STORY, datum: '2026-10-19', format: 'story', saeule: 3, thema: 'Antworten auf die Freitagsfrage', kennung: '', status: 'geplant', hinweis: '', zustaendig: 'Lugge' },
  { ...IG, datum: '2026-10-20', format: 'reel', saeule: 1, thema: 'K1 als animiertes Reel: 7 Punkte, je 3 Sek.', kennung: 'K1', status: 'geplant', hinweis: 'Wiederverwendung', zustaendig: 'Johannes' },
  { ...STORY, datum: '2026-10-20', format: 'story', saeule: 1, thema: 'Reshare + Umfrage: „Welcher der 7 Punkte fehlt bei euch?“', kennung: '', status: 'geplant', hinweis: '', zustaendig: '' },
  { ...STORY, datum: '2026-10-21', format: 'story', saeule: 2, thema: 'Richtig oder falsch: Server-Side-Tracking', kennung: '', status: 'geplant', hinweis: '', zustaendig: 'Julian' },
  { ...LINKEDIN, datum: '2026-10-21', format: 'pdf', saeule: 4, thema: 'K3 als PDF', kennung: 'K3', status: 'geplant', hinweis: '', zustaendig: 'Lugge' },
  {
    kanal: 'intern',
    uhrzeit: '',
    datum: '2026-10-21',
    format: 'auswertung',
    saeule: null,
    thema: 'Monatsauswertung: Kennzahlen, Formatentscheidungen, Plan Woche 5–8',
    kennung: '',
    status: 'geplant',
    hinweis: 'Termin setzen',
    zustaendig: 'Lugge',
  },
];

// ─── Hook-Bibliothek ─────────────────────────────────────────────────────────

const hook = (saeule: number, text: string): SocialHookInput => ({ saeule, text, status: 'frei', inhalt_id: '' });

export const SOCIAL_START_HOOKS: SocialHookInput[] = [
  hook(1, 'EUER SHOP ZIEHT UM. ZIEHEN EURE RANKINGS MIT?'),
  hook(1, 'DER UMZUG BEGINNT MIT EINER URL-LISTE. NICHT MIT DEM EXPORT.'),
  hook(1, 'WAS IN MAGENTO EIN ATTRIBUT IST, IST IN SHOPIFY … KOMMT DRAUF AN.'),
  hook(1, 'SHOPWARE 5 LÄUFT NOCH. DIE FRAGE IST: WIE LANGE NOCH?'),
  hook(1, 'DIE ERSTEN 48 STUNDEN NACH DEM LIVEGANG. UNSERE CHECKLISTE.'),
  hook(2, 'EIN KAUF. ZWEI CONVERSIONS.'),
  hook(2, 'GA4 SAGT DAS EINE. SHOPIFY DAS ANDERE.'),
  hook(2, 'EUER ROAS SIEHT GUT AUS. STIMMT ER AUCH?'),
  hook(2, 'SERVER-SIDE-TRACKING: WANN IHR ES BRAUCHT. UND WANN NICHT.'),
  hook(2, 'BEVOR IHR BUDGET ERHÖHT, MACHT EINEN TESTKAUF.'),
  hook(3, 'IHR VERSCHICKT NEWSLETTER. ABER LAUFEN EURE FLOWS?'),
  hook(3, 'DER CHECKOUT IST FERTIG. DIE ÜBERRASCHUNGEN AUCH?'),
  hook(3, 'EUER WARENKORBABBRUCH-FLOW HAT EINE E-MAIL? DAS IST EIN ANFANG.'),
  hook(3, 'DREI SEGMENTE, DIE JEDER SHOP IN KLAVIYO BRAUCHT.'),
  hook(3, 'WO VERLIEREN EURE BESUCHER DEN FADEN?'),
  hook(4, 'IHR STELLT EINE FRAGE. WER ANTWORTET?'),
  hook(4, 'SO SIEHT UNSER TICKETSYSTEM AUS:'),
  hook(4, 'WAS WIR NICHT MACHEN. UND WARUM.'),
  hook(4, 'WAS IN UNSEREM ERSTGESPRÄCH PASSIERT. MINUTE FÜR MINUTE.'),
  hook(4, 'DREI LEUTE. FÜNF LEISTUNGEN. KEINE SUBUNTERNEHMER.'),
];

// ─── Aufgaben: erste Woche, was fehlt, wöchentlicher Ablauf ──────────────────

const woche1 = (titel: string, beschreibung: string, zustaendig = ''): SocialAufgabeInput => ({
  bereich: 'woche1',
  titel,
  beschreibung,
  dringlichkeit: 'sofort',
  faellig_am: '',
  zustaendig,
});

const fehlt = (dringlichkeit: string, faellig_am: string, titel: string, beschreibung: string): SocialAufgabeInput => ({
  bereich: 'fehlt',
  titel,
  beschreibung,
  dringlichkeit,
  faellig_am,
  zustaendig: '',
});

const ritual = (titel: string, beschreibung: string, zustaendig = ''): SocialAufgabeInput => ({
  bereich: 'ritual',
  titel,
  beschreibung,
  dringlichkeit: '',
  faellig_am: '',
  zustaendig,
});

export const SOCIAL_START_AUFGABEN: SocialAufgabeInput[] = [
  woche1(
    'Instagram-Account anlegen und einrichten',
    '@velonify anlegen bzw. prüfen, auf Business-Konto umstellen, Kategorie „Marketingagentur“, mit Facebook-Seite und Meta Business Suite verbinden. @velonify auf TikTok sichern.',
    'Lugge',
  ),
  woche1('Profilbild', 'Velonify-Zeichen in Weiß auf Bordeaux-Fläche, mittig, mit genug Rand für den runden Zuschnitt.', 'Johannes'),
  woche1('Name-Feld setzen', '„Velonify | Shopify-Agentur“ – das Name-Feld ist in der Suche auffindbar.', 'Lugge'),
  woche1(
    'Bio eintragen',
    'Wörtlich:\nShopify-Agentur aus dem DACH-Raum.\nMigration · Tracking · Ads · E-Mail · CRO\nWer euren Shop baut, beantwortet eure Fragen.\n↓ Erstgespräch, 30 Min.',
    'Lugge',
  ),
  woche1(
    'Link im Profil setzen und prüfen',
    'https://velonify.de/?utm_source=instagram&utm_medium=social&utm_campaign=profil#kontakt – vorher prüfen, dass der Kontaktabschnitt mit dieser URL korrekt anspringt und der Buchungslink funktioniert.',
    'Lugge',
  ),
  woche1('Kontakt-Buttons', 'E-Mail hallo@velonify.de. Keine Telefonnummer, solange sie auf der Website Platzhalter ist.', 'Lugge'),
  woche1(
    'Highlights anlegen',
    'Cover: Bordeaux-Quadrat, weißer Text in Krona One, mittig.\nLEISTUNGEN (5 Frames, je Leistung ein Satz von der Website)\nUMZUG (Säule-1-Stories)\nTRACKING (Säule-2-Stories)\nABLAUF (Erstgespräch → Angebot → Umsetzung, je ein Frame)\nREFERENZ (ab 15.10.)\nFRAGEN (Antworten der Freitagsfragen)',
    'Johannes',
  ),
  woche1('Vorlagen bauen', 'W, B, E, CTA-Slide, Story-Vorlagen für die drei Formate, Reel-Endcard. Einmalig ca. 6 Stunden.', 'Johannes'),
  woche1('Slack-Channel #feed-content anlegen', 'Und allen dreien den Ablauf aus „Wiederverwendung“ schicken.', 'Lugge'),
  woche1('Formular und CRM vorbereiten', 'Verstecktes UTM-Feld, Pflichtfrage „Wie seid ihr auf uns gekommen?“, CRM-Werte für quelle ergänzen.', 'Lugge'),
  woche1('Checkliste „Umzugsplan“ als PDF bauen', 'Aus K1, 2 Seiten, Vorlage W – damit das DM-Stichwort UMZUG ab 24.09. funktioniert.', 'Johannes'),
  woche1('Die ersten drei Posts gestalten', 'Di 22.09. E1 (danach anheften) · Do 24.09. K1 · Sa 26.09. E3.', 'Johannes'),
  woche1('Vor dem ersten Post', 'E1, K1 und E3 fertig gestaltet und in der Meta Business Suite eingeplant, bevor E1 live geht.', 'Lugge'),
  woche1('LinkedIn vorbereiten', 'Lukas aktualisiert die Headline (Annahme: „Mitgründer Velonify · Shopify-Migration, Tracking, Performance Marketing“) und postet am 23.09. den Vorstellungstext.', 'Lugge'),
  woche1('Allen dreien folgen lassen', 'Eigene Accounts folgen dem Velonify-Account und teilen E1 in ihrer Story. Nicht mehr.', ''),

  fehlt('sofort', '2026-09-22', 'Buchungslink für das Erstgespräch', 'Auf der Website steht noch [BUCHUNGSLINK]. Ohne ihn führt jeder CTA ins Leere.'),
  fehlt('sofort', '2026-09-22', 'Instagram-Handle bestätigen oder anlegen', 'Ist @velonify frei?'),
  fehlt('sofort', '2026-09-22', 'Rolle je Person in max. 5 Wörtern', 'Für K3, das Highlight ABLAUF und die Zuständigkeit bei DMs.'),
  fehlt('sofort', '2026-09-22', 'Profilbild-Datei und Schriften', 'Velonify-Zeichen als PNG, Krona One und Albert Sans im Design-Tool.'),
  fehlt('diese_woche', '2026-09-24', 'Umzugs-Checkliste als PDF', 'Aus K1 – sonst ist das DM-Stichwort UMZUG leer.'),
  fehlt('diese_woche', '2026-09-24', 'Formular-Anpassung', 'UTM-Übergabe und Pflichtfrage zur Herkunft.'),
  fehlt('diese_woche', '2026-09-24', 'CRM-Felder', 'quelle (neue Werte), erstkontakt_inhalt, erstkontakt_datum.'),
  fehlt(
    'diese_woche',
    '2026-09-24',
    'Zielwert und Mindestkriterien festlegen',
    'Zielwert für qualifizierte Erstgespräche aus Social bis 20.12.2026 und ab welchem Budget oder Shop-Umsatz eine Anfrage als qualifiziert zählt.',
  ),
  fehlt('vor_0110', '2026-10-01', 'Shopify-Testshop', 'Mit Beispielprodukten für Screenrecordings (R2, R4, Stories). Keine Kundenshops im Bild.'),
  fehlt('vor_0110', '2026-10-01', 'Anonymisierte Screenshots', 'Ein Redirect-Mapping, eine GTM-Vorschau, eine Klaviyo-Flow-Übersicht.'),
  fehlt(
    'vor_0110',
    '2026-10-01',
    'Datum Magento-1-Support prüfen',
    'Ende des offiziellen Supports (Juni 2020) gegen die Adobe-Quelle abgleichen, bevor E2 am 03.10. erscheint. Gleiches gilt künftig für Shopware-5-Aussagen.',
  ),
  fehlt(
    'vor_1310',
    '2026-10-13',
    'Referenz freigeben lassen',
    'Ausgangslage in 2 Sätzen, Umfang der Migration, heutige Leistungen, freigegebene Kennzahlen mit Zeitraum, freigegebenes Zitat mit Name und Funktion. Alles direkt bei K5 eintragen.',
  ),
  fehlt(
    'vor_1310',
    '2026-10-13',
    'Öffentliche Darstellung der Kundenverbindung klären',
    'Lukas’ Rolle beim Referenzkunden ist auf LinkedIn sichtbar. Einmal gemeinsam formulieren, wie ihr das Verhältnis beschreibt, bevor jemand im Kommentar danach fragt.',
  ),
  fehlt('spaeter', '', 'Partnerstatus bestätigen', 'Shopify Partner, Google Partner, Klaviyo Silver. Bis dahin steht er in keinem Post, keiner Bio und keinem Highlight.'),
  fehlt(
    'spaeter',
    '',
    'Weitere Kunden-Freigaben',
    'Welche Kunden genannt werden dürfen und welche nicht, steht in „Velonify Context.md“ im Vault. Ohne schriftliche Freigabe wird kein Kunde als Referenz verwendet.',
  ),
  fehlt('spaeter', '', 'Eigene Landingpage für Social', 'Z. B. velonify.de/start mit Checkliste und Termin, sobald Monat 1 zeigt, welches Stichwort die meisten DMs bringt.'),

  ritual('Montag, 30 Min., alle drei', 'Material aus #feed-content sichten, Posts der Woche festlegen, Freitagsfrage beantworten.', ''),
  ritual('Montag, 15 Min.', 'Kennzahlen der Woche eintragen: Reichweite je Post, Speicherungen, Geteilt, Profilaufrufe, Link-Klicks, DMs je Stichwort.', 'Lugge'),
  ritual('Montag bis Mittwoch', 'Produktion für Donnerstag und Samstag der laufenden Woche und Dienstag der nächsten Woche – eine Woche Vorlauf.', 'Johannes'),
  ritual('Posts vorplanen', 'In der Meta Business Suite vorplanen. Stories live posten.', ''),
  ritual('Täglich, ca. 15 Min.', 'Kommentare und DMs zum eigenen Thema beantworten, mit Namen unterschrieben. Material in #feed-content ablegen.', ''),
  ritual('Monatlich', 'Monatsauswertung: neue Follower und Stichprobe der letzten 30, GA4-Sitzungen mit utm_source, Erstgespräche und qualifizierte Leads mit Quelle Social.', 'Lugge'),
];

// ─── Strategie: die Kapitel, die als Text bleiben ────────────────────────────

export const SOCIAL_START_TEXTE: SocialTextInput[] = [
  {
    schluessel: 'fundament',
    titel: 'Fundament',
    text:
      'Zeitraum: 22.09.2026 bis 20.12.2026 · Kapazität: 3 Posts + 5 Stories pro Woche · Ohne Gesicht: nur Grafik, Screenrecording, Animation.\n\n' +
      'ZIEL\nQualifizierte Anfragen aus Social. Qualifiziert heißt: Onlineshop im DACH-Raum, Entscheider:in am anderen Ende, konkreter Bedarf in einer der fünf Leistungen innerhalb der nächsten sechs Monate. Ab welchem Mindestbudget oder Shop-Umsatz eine Anfrage zählt, legt ihr fest (siehe Aufgaben).\n\n' +
      'ZIELGRUPPE\nUmzügler: Inhaber:innen und E-Commerce-Verantwortliche auf Magento 1/2, Shopware 5 oder WooCommerce. Sie haben Angst vor dem Umzug, nicht vor Shopify: Rankings, Daten, Ausfall.\n' +
      'Shopify-Bestand: Shops, die schon auf Shopify laufen und bei Tracking, Ads oder E-Mail nicht weiterkommen. Oft haben sie schon eine Agentur erlebt, die viel versprochen hat.\n\n' +
      'Beide vergleichen Agenturen und misstrauen Versprechen. Also versprechen wir nichts. Wir zeigen Arbeit.\n\n' +
      'WAS VELONIFY AUF SOCIAL ANDERS MACHT\n' +
      '1. Zeigen statt behaupten. Jeder Post enthält ein Stück echter Arbeit: eine Checkliste, ein Mapping, einen Screenshot, einen Flow-Plan. Kein Post ohne Inhalt, den man speichern kann.\n' +
      '2. Keine Zahl ohne Beleg. Lieber „so prüfen wir das“ als „+X % Umsatz“.\n' +
      '3. Die Antwort kommt von der Person, die baut. Kommentare und DMs beantworten Lukas, Johannes und Julian selbst und unterschreiben mit Namen („– Julian“).\n' +
      '4. Social ist die Beweisschicht für den Vertrieb. Wer aus dem Outreach auf das Profil klickt, sieht in 30 Sekunden, dass wir wissen, wovon wir schreiben.\n\n' +
      'WAS ERFOLG NACH 90 TAGEN HEISST\n' +
      '· Die Messkette steht: Jede Anfrage im CRM hat eine Quelle, Social-Anfragen sind eindeutig erkennbar.\n' +
      '· Zielwert qualifizierte Erstgespräche bis 20.12.2026: noch festzulegen.\n' +
      '· Rund 38 Posts sind veröffentlicht. Das Profil funktioniert als Referenz im Vertrieb.\n' +
      '· Wir wissen, welche Säule und welches Format DMs und Anfragen auslöst, und haben den Plan für Q1 2027 danach ausgerichtet.',
  },
  {
    schluessel: 'kanaele',
    titel: 'Kanalentscheidung',
    text:
      'Instagram (Velonify-Account) – Hauptkanal. Profil als Beleg, Einstieg per DM, Stories für Nähe. 3 Posts + 5 Stories pro Woche, ca. 8–9 Std. MACHEN.\n' +
      'LinkedIn (persönliche Profile) – Zweitverwertung. Karussells als PDF-Dokument, Kernaussagen als Textpost. 1 Post/Woche, ab Woche 3 je Person 1 Post alle 2 Wochen, ca. 1–1,5 Std., keine Neuproduktion. MACHEN.\n' +
      'LinkedIn-Unternehmensseite – nur anlegen und Posts der drei Profile teilen. MINIMAL.\n' +
      'TikTok – nicht in den 90 Tagen. Handle @velonify sichern, sonst nichts.\n' +
      'Facebook-Seite – nur als technische Voraussetzung für Meta Business Suite und späteres Ads-Konto. Nicht aktiv pflegen.\n\n' +
      'WARUM LINKEDIN DAZUGEHÖRT\nDie Zielgruppe entscheidet beruflich und informiert sich beruflich auf LinkedIn. Unsere Positionierung sind drei Personen, keine Marke. Persönliche Profile transportieren das direkter als eine Firmenseite. Und es kostet fast nichts: Jedes Karussell wird als PDF hochgeladen, jede Caption wird zum Textpost umgeschrieben.\n\n' +
      'WARUM KEIN TIKTOK\nOhne Gesicht vor der Kamera fehlt dort das, was funktioniert. Die Zielgruppe sucht dort keine Shopify-Agentur. Und die Kapazität reicht nicht für einen dritten Kanal mit eigener Formatlogik. Nach 90 Tagen neu bewerten, falls jemand vor die Kamera geht.\n\n' +
      'WAS WIR NICHT MACHEN\n' +
      '· Keine Trend-Audios, Memes oder Tanz-Formate.\n' +
      '· Keine Gewinnspiele, keine gekauften Follower, keine Engagement-Gruppen.\n' +
      '· Keine KI-generierten Menschen oder Gesichter. KI nur für Animation, Hintergründe aus Flächen und Formen, Schnitt.\n' +
      '· Keine Ergebnisversprechen, keine Prozentzahlen ohne Beleg.\n' +
      '· Kein tägliches Posten. Drei gute Posts schlagen sieben dünne.\n' +
      '· Keine Kaltakquise per DM an Follower. DMs beantworten ja, anschreiben nein.',
  },
  {
    schluessel: 'saeulen',
    titel: 'Die vier Content-Säulen',
    text:
      '1 · UMZUG OHNE VERLUST (Shopify-Migration) – 35 %. Umzügler abholen, Angst vor dem Umzug in einen Plan verwandeln. Beweis: konkretes Arbeitsmaterial – Checklisten, Redirect-Mappings, Datenmodell-Entscheidungen, Livegang-Plan. Die freigegebene Referenz als einzige.\n' +
      'Themen: Magento 1 vs. 2 vs. Shopify · Was mit Kundenpasswörtern passiert · Redirects für Filterseiten · Shopware-5-Attribute in Shopify-Metafeldern · Markets für DE/AT/CH · B2B auf Shopify Plus · Die ersten 48 Stunden nach Livegang.\n\n' +
      '2 · DATEN, DIE STIMMEN (Tracking & Attribution, Performance Marketing) – 25 %. Shopify-Bestand abholen, zeigen, dass wir Fehler finden, die andere übersehen. Beweis: echte, anonymisierte Fehlerbilder – Tag Assistant, GTM-Vorschau, Abweichungen zwischen GA4, Meta und Shopify mit Erklärung.\n' +
      'Themen: Warum GA4 und Shopify verschiedene Umsätze zeigen · Consent Mode erklärt · Purchase-Event doppelt · Server-Side-Tracking: wann es sich lohnt, wann nicht · Meta Conversions API · Merchant-Center-Ablehnungen · Kampagnen nach Marge steuern statt nach ROAS.\n\n' +
      '3 · MEHR AUS DEM SHOP (E-Mail & Retention, Conversion-Optimierung) – 20 %. Zeigen, dass wir nach dem Livegang weiterarbeiten. Beweis: Flow-Baupläne, Befunde aus Shop-Audits mit Screenshot und konkreter Änderung.\n' +
      'Themen: Fünf Flows vor der ersten Kampagne · Segmente, die jeder Shop braucht · Warenkorbabbruch-Flow aufbauen · Checkout-Stolperstellen · Produktseiten-Befunde · Was ein CRO-Audit prüft.\n\n' +
      '4 · KEIN UMWEG (Arbeitsweise, Team, Referenz) – 20 %. Den Unterschied zu anderen Agenturen greifbar machen. Beweis: wie ein Projekt abläuft, wer antwortet, was wir selbst machen, wie das Erstgespräch läuft.\n' +
      'Themen: Wer beantwortet eure Frage · Was wir selbst machen, ohne Subunternehmer · Ablauf Erstgespräch · Die Referenz · Unser Werkzeugkasten · Warum wir Nein sagen.',
  },
  {
    schluessel: 'formate',
    titel: 'Formate und Vorlagen',
    text:
      'FORMATE\n' +
      'Karussell – 1080 × 1350 px (4:5), 7–9 Slides. Slide 1 Hook · Slides 2–n je ein Punkt · letzte Slide CTA. Säulen 1–4, ca. 40 %.\n' +
      'Reel – 1080 × 1920 px, Text in der Mitte (oben 250 px, unten 380 px frei), 15–30 Sek. 0–2 Sek. Hook als Text · 3 bis 4 Beats · Endcard 2 Sek. Säulen 1–4, ca. 35 %.\n' +
      'Einzelbild – 1080 × 1350 px, eine Aussage, groß gesetzt. Säulen 1, 2, 4, ca. 25 %.\n' +
      'Story – 1080 × 1920 px, 1–3 Frames. Eine Frage oder ein Screenshot plus Interaktion. Alle Säulen, 5 pro Woche.\n\n' +
      'VORLAGEN (einmal bauen, immer nutzen)\n' +
      'Vorlage W (Weiß): Weiße Fläche, Rand 80 px. Überschrift Krona One, Großbuchstaben, Bordeaux #45142D, 64–88 pt. Fließtext Albert Sans 500, Espresso #2C0E18, 34–40 pt. Eisblauer Balken #C5D8E6, 16 px hoch, als Marker unter der Überschrift.\n' +
      'Vorlage B (Bordeaux): Bordeaux-Vollfläche, Überschrift weiß, Akzent Eisblau. Für Hooks und Aussagen.\n' +
      'Vorlage E (Espresso): Espresso-Vollfläche für Screenshots und CTA-Slides. Screenshots eckig, 4 px weißer Rahmen, kein Schatten.\n' +
      'Fußzeile jeder Feed-Slide: links „VELONIFY“ in Krona One 20 pt, rechts Seitenzahl „03/09“ in Albert Sans 700, 20 pt, 60 px vom unteren Rand.\n' +
      'Nummern-Block: Eisblaues Quadrat 140 × 140 px, darin die Ziffer in Krona One Bordeaux.\n' +
      'Standard-CTA-Slide (Vorlage E): Oben der Leitsatz der Serie. Mitte in Weiß: „30 MINUTEN. MIT DER PERSON, DIE ES UMSETZT.“ Darunter Albert Sans: „Erstgespräch über den Link im Profil. Oder schreibt uns per DM.“ Unten Eisblau-Balken über die volle Breite, 24 px.\n\n' +
      'WIEDERKEHRENDE SERIEN\n' +
      'UMZUGSPLAN – Säule 1, Karussell, alle 2 Wochen, Label „UMZUGSPLAN #n“ oben links in Eisblau.\n' +
      'DATENLECK – Säule 2, Reel oder Karussell, alle 2 Wochen, Label „DATENLECK #n“.\n' +
      'FLOW-BAUPLAN – Säule 3, Karussell, monatlich, Label „FLOW-BAUPLAN #n“.\n' +
      'SHOP-BEFUND – Säule 3, Reel (Screenrecording), monatlich, Label „SHOP-BEFUND #n“.\n' +
      'KEIN UMWEG – Säule 4, Einzelbild oder Karussell, alle 2 Wochen, Label „KEIN UMWEG“.',
  },
  {
    schluessel: 'stories',
    titel: 'Story-Formate',
    text:
      'RICHTIG ODER FALSCH – mittwochs. Frame 1: Aussage in Krona One auf Bordeaux. Frame 2: Auflösung in 2 Sätzen auf Weiß, unterschrieben mit Namen. Quiz-Sticker mit „Richtig“ / „Falsch“.\n\n' +
      'AUS DEM PROJEKT – donnerstags. Frame 1: anonymisierter Screenshot (Mapping, GTM, Flow) auf Espresso, ein Satz darüber. Frame 2: Was wir geändert haben. Umfrage „Kennt ihr das?“ Ja / Nein.\n\n' +
      'FREITAGSFRAGE – freitags, Antworten montags. Frame 1: Frage auf Bordeaux. Montag: je Antwort ein Frame, unterschrieben mit Namen. Fragesticker.\n\n' +
      'Dienstags: Post-Reshare mit Umfrage. Jede Story mit Linkziel bekommt den Link-Sticker mit UTM.',
  },
  {
    schluessel: 'wiederverwendung',
    titel: 'Wiederverwendung statt Neuproduktion',
    text:
      'DER WEG IN DREI SCHRITTEN\n' +
      '1. Festhalten, wenn es passiert. Jede:r legt im Slack-Channel #feed-content einen Screenshot plus einen Satz ab: „Was war das Problem, was haben wir gemacht?“ Dauer: 1 Minute. Nicht bewerten, nur sammeln.\n' +
      '2. Anonymisieren und einsortieren. Beim wöchentlichen Planen (Mo, 30 Min.): Kundennamen, Domains, Logos, Umsätze und Personen entfernen oder verpixeln. Ausnahme: die freigegebene Referenz im freigegebenen Rahmen. Dann Säule und Format festlegen.\n' +
      '3. In die Vorlage gießen. Eine Aussage pro Slide, Hook aus der Bibliothek, Standard-CTA. Screenshots immer im Espresso-Rahmen der Vorlage E.\n\n' +
      'QUELLE → POST\n' +
      'Website-Texte velonify.de → Einzelbild-Aussage (wie E3); je Leistung ein Erklär-Karussell „Was wir bei [Leistung] konkret machen“.\n' +
      'Shop-Audits (unser internes Audit-Werkzeug) → SHOP-BEFUND-Reel oder Story „Aus dem Projekt“. Nur die Befundart, nie der geprüfte Shop.\n' +
      'Migrations-Screenshots (Redirect-Mapping, Metafeld-Zuordnung, Import-Fehlerliste) → UMZUGSPLAN-Karussell oder Story S7.\n' +
      'Tracking-Fehler aus dem Alltag (doppeltes Purchase-Event, fehlender Consent-Default, falsche Währung) → DATENLECK-Reel, nachgestellt im Testshop.\n' +
      'Klaviyo-Flows (Flow-Übersicht als Canvas-Screenshot) → FLOW-BAUPLAN-Karussell, Flow-Grafik nachgebaut in Markenfarben.\n' +
      'Kundenfragen im Erstgespräch → Freitagsfrage-Antwort, dann Karussell.\n' +
      'Ein Karussell → Reel (Slides animiert) · LinkedIn-PDF · 3 Story-Frames · Textpost.',
  },
  {
    schluessel: 'messung',
    titel: 'Messung: Kennzahlen und Schwellen',
    text:
      'WÖCHENTLICH (Mo, 15 Min.)\n' +
      '· Reichweite je Post, Speicherungen, Geteilt, Profilaufrufe, Link-Klicks (Instagram-Insights) – zeigt, welche Inhalte tragen.\n' +
      '· DMs mit Stichwort (UMZUG, DATEN, FLOWS) – frühestes Lead-Signal. Im Hub unter „Messung“ erfassen.\n' +
      '· Story-Antworten und Umfrage-Teilnahmen – Nähe zur Zielgruppe.\n\n' +
      'MONATLICH\n' +
      '· Neue Follower, davon aus der Zielgruppe. Stichprobe: die letzten 30 neuen Follower manuell prüfen – Shop-Betreiber oder E-Commerce-Rolle?\n' +
      '· Website-Sitzungen mit utm_source=instagram / linkedin, Formular-Absendungen, Terminbuchungen (GA4).\n' +
      '· Erstgespräche und qualifizierte Leads mit Quelle Social, Wert der daraus entstandenen Angebote (CRM).\n\n' +
      'SCHWELLEN ZUM AUSSORTIEREN ODER VERDOPPELN\n' +
      'Vergleichsgröße ist der eigene Median, nicht ein Branchenwert. Ab dem 9. Post: Median von Speicherungen + Geteilt pro Reichweite über die letzten 8 Posts. Der Hub rechnet das aus.\n' +
      '· Aussortieren: Ein Format oder eine Serie liegt dreimal hintereinander unter dem Median UND hat keine DM ausgelöst.\n' +
      '· Verdoppeln: Ein Format liegt zweimal hintereinander deutlich über dem Median (Faustregel: das 1,5-Fache) ODER hat mindestens eine qualifizierte DM ausgelöst. Dann alle 2 Wochen statt monatlich.\n' +
      '· Eine DM mit echtem Projektbezug zählt mehr als jede Reichweite. Ein Post, der Anfragen bringt, bleibt, auch wenn er wenig Reichweite hat.\n\n' +
      'WAS IM CRM LANDEN MUSS\n' +
      '· quelle: „Instagram“, „Instagram DM“, „LinkedIn“ (neben bestehenden Werten wie „Magento Lauf 1“).\n' +
      '· erstkontakt_inhalt: welcher Post oder welches Stichwort (z. B. „K1 / UMZUG“).\n' +
      '· erstkontakt_datum.\n' +
      '· Ob die Person vor dem Erstgespräch das Profil kannte – im Gespräch fragen, auch wenn sie über Outreach kam.\n\n' +
      'DM-Anfragen trägt die Person ein, die sie beantwortet, am selben Tag.',
  },
  {
    schluessel: 'rollen',
    titel: 'Aufgabenteilung im Dreierteam',
    text:
      'Annahme nach bisherigen Schwerpunkten – bitte bestätigen oder tauschen.\n\n' +
      'LUKAS – Redaktionsplan, Captions, Freigabe, Montagsplanung, Monatsauswertung, eigenes LinkedIn, DMs mit Stichwort UMZUG. Ca. 3,5 Std./Woche.\n' +
      'JOHANNES – Design der Posts in den Vorlagen, Animation der Reels, Story-Grafiken. Ca. 3 Std./Woche.\n' +
      'JULIAN – Screenrecordings im Testshop (Tracking, Checkout), fachliche Prüfung aller Tracking-Posts, DMs mit Stichwort DATEN. Ca. 2 Std./Woche.\n' +
      'ALLE – Kommentare und DMs zum eigenen Thema, mit Namen unterschrieben. Material in #feed-content ablegen. Je ca. 15 Min./Tag.\n\n' +
      'EINMALIG IN WOCHE 1\nVorlagen W/B/E, Story-Vorlagen, Highlight-Cover, Reel-Endcard bauen: ca. 6 Std. (Johannes). Testshop mit Beispieldaten einrichten: ca. 2 Std. (Julian).',
  },
  {
    schluessel: 'erwartung',
    titel: 'Was nach 30 Tagen zu erwarten ist',
    text:
      'Nach 30 Tagen habt ihr 13 Posts, ein Profil, das im Vertrieb als Beleg funktioniert, und eine Messkette, die jede Anfrage einer Quelle zuordnet.\n\n' +
      'Ein neuer Account ohne Werbebudget erreicht in dieser Zeit vor allem Menschen, die ihr ohnehin ansprecht, also Outreach-Kontakte und euer LinkedIn-Netzwerk. Deshalb kommen die ersten Anfragen eher aus Outreach plus Profil als aus Instagram allein.\n\n' +
      'Ob Social eigenständig Leads bringt, zeigt sich realistisch erst im zweiten und dritten Monat.',
  },
];
