import type { OutreachLeistungInput } from './types';

/**
 * Start list of the Contact Generator. Deliberately generic and without references – this repo is public,
 * and a "Beleg" is only written by the team once a client has agreed to be named.
 */
export const OUTREACH_STARTLISTE: OutreachLeistungInput[] = [
  {
    titel: 'Shopify Migration',
    beschreibung:
      'Umzug eines bestehenden Shops, z. B. von Magento, Shopware oder WooCommerce, zu Shopify oder Shopify Plus: Produkte, Kunden und Bestellhistorie, 301-Redirects und SEO, Theme, Apps und Go-live.',
    anlass:
      'Veraltetes oder teures Shop-System: Magento 2.4.6 hat seit 11.08.2026 keinen Standard-Support mehr, Magento 1 bekommt seit 2020 keine Sicherheitsupdates. Hohe Kosten für Wartung, Hosting und Updates.',
    nutzen: 'Ein Shop ohne eigenen Update- und Hosting-Aufwand, bei dem Rankings, Kundenkonten und Bestellhistorie erhalten bleiben.',
    beleg: '',
  },
  {
    titel: 'Klaviyo Setup & Email Marketing',
    beschreibung:
      'Klaviyo einrichten oder übernehmen, automatische Flows (Willkommen, Warenkorbabbruch, Produktansicht, Nachkauf, Rückgewinnung), Segmente, Templates und laufende Kampagnen.',
    anlass: 'Keine oder nur wenige automatische E-Mails, Newsletter ohne Segmentierung, Anmeldung ohne Willkommensstrecke.',
    nutzen: 'Mehr Umsatz aus vorhandenen Besuchern und Kunden, ohne mehr Geld für Werbung auszugeben.',
    beleg: '',
  },
  {
    titel: 'Media Buying',
    beschreibung: 'Planung, Umsetzung und Optimierung bezahlter Kampagnen auf Meta (Facebook, Instagram), TikTok und Google, mit Creatives, Tests und Reporting.',
    anlass: 'Werbung läuft ohne klare Zielwerte, kaum Tests mit neuen Creatives, Pixel ist eingebaut, aber keine erkennbare Kampagnenstruktur.',
    nutzen: 'Das Werbebudget fließt in Kampagnen, die messbar verkaufen, mit regelmäßigen Tests statt Bauchgefühl.',
    beleg: '',
  },
  {
    titel: 'Shopify Store Management',
    beschreibung:
      'Laufende Betreuung eines Shopify-Shops: Theme- und App-Pflege, Fehlerbehebung, kleine Weiterentwicklungen, Performance und Support mit festem Ansprechpartner.',
    anlass: 'Shop läuft auf Shopify, aber ohne feste technische Betreuung: langsame Ladezeiten, veraltete Apps oder Änderungen, die liegen bleiben.',
    nutzen: 'Das Team kümmert sich um Sortiment und Marketing, die Technik läuft zuverlässig im Hintergrund.',
    beleg: '',
  },
  {
    titel: 'Google Ads Setup / Tracking Setup / UTMs / Consent Management',
    beschreibung:
      'Google-Ads-Konto und Conversion-Tracking sauber aufsetzen: GA4 und Google Tag Manager, serverseitiges Tracking, einheitliche UTM-Parameter und Consent-Management.',
    anlass: 'Unvollständiges oder doppeltes Tracking, fehlende Conversions in Google Ads, uneinheitliche UTM-Links, veraltetes oder fehlendes Consent-Banner.',
    nutzen: 'Verlässliche Zahlen, nach denen sich das Werbebudget verteilen lässt, und ein Consent-Setup, das zum Datenschutz passt.',
    beleg: '',
  },
  {
    titel: 'Full E-Commerce Service',
    beschreibung: 'Shop, Performance-Marketing und E-Mail-Marketing aus einer Hand: technische Betreuung, Media Buying, Klaviyo und Tracking mit gemeinsamem Reporting.',
    anlass: 'Mehrere Dienstleister für Shop, Werbung und E-Mail, oder alles liegt intern bei wenigen Personen.',
    nutzen: 'Ein Ansprechpartner für das ganze Online-Geschäft und Maßnahmen, die aufeinander abgestimmt sind.',
    beleg: '',
  },
];
