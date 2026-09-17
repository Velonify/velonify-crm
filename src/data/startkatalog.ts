import type { Abrechnung } from './types';

type Text = readonly [de: string, en: string];

export interface StartLeistung {
  titel: Text;
  text: Text;
}

export interface StartKategorie {
  titel: Text;
  umfang: Text;
  abrechnung: Abrechnung;
  leistungen: readonly StartLeistung[];
}

const l = (titelDe: string, titelEn: string, textDe: string, textEn: string): StartLeistung => ({
  titel: [titelDe, titelEn],
  text: [textDe, textEn],
});

/**
 * Initial service catalogue, taken over once via "Startkatalog übernehmen" and maintained in the sheet afterwards.
 * Derived from past offers; deliberately generic – this repo is public, so no client names or client systems here.
 */
export const STARTKATALOG: readonly StartKategorie[] = [
  {
    titel: ['Analyse & Konzeption', 'Analysis & Concept'],
    umfang: ['Discovery, Datenaufnahme, Zielarchitektur, Migrationsplan, Freigabedokument', 'Discovery, data review, target architecture, migration plan, sign-off document'],
    abrechnung: 'einmalig',
    leistungen: [
      l('Discovery-Workshops', 'Discovery workshops', 'Workshops zu Sortiment, Märkten, Prozessen und Systemlandschaft', 'Workshops on product range, markets, processes and system landscape'),
      l('Bestandsaufnahme Individualentwicklungen', 'Review of custom developments', 'Aufnahme und Bewertung der bestehenden Individualentwicklungen inkl. Empfehlung Standard vs. Custom', 'Review and assessment of existing custom developments, including a standard vs. custom recommendation'),
      l('Zielarchitektur', 'Target architecture', 'Zielarchitektur für die neue Plattform: Storefront-Struktur, Märkte, Sprachen, Datenmodell', 'Target architecture for the new platform: storefront structure, markets, languages, data model'),
      l('Migrationsplan', 'Migration plan', 'Migrationsplan mit Reihenfolge, Testläufen, Cut-over-Szenario und Risikoliste', 'Migration plan with sequence, test runs, cut-over scenario and risk register'),
      l('Konzeptdokument', 'Concept document', 'Konzeptdokument als gemeinsame Freigabegrundlage für die weiteren Leistungen', 'Concept document as the shared basis for sign-off of all further work'),
    ],
  },
  {
    titel: ['Datenmigration', 'Data Migration'],
    umfang: ['Produkte, Varianten, Kunden, Bestellungen, Inhalte, Medien inkl. Mapping und Testläufe', 'Products, variants, customers, orders, content, media incl. mapping and test runs'],
    abrechnung: 'einmalig',
    leistungen: [
      l('Produkte, Varianten & Medien', 'Products, variants & media', 'Migration von Produkten, Varianten, Metafeldern, Kategorien, Medien und Anhängen', 'Migration of products, variants, metafields, collections, media and attachments'),
      l('Kunden & Bestellhistorie', 'Customers & order history', 'Übernahme von Kundenkonten, Adressen, Bestellhistorie und Gutscheinen', 'Transfer of customer accounts, addresses, order history and gift cards'),
      l('Feldmapping & Datenbereinigung', 'Field mapping & data cleansing', 'Feldmapping je Storefront und Sprache, Bereinigung und Normalisierung der Datenbestände', 'Field mapping per storefront and language, cleansing and normalisation of the data'),
      l('Probemigrationen', 'Trial migrations', 'Mindestens zwei Probemigrationen mit Abweichungsprotokoll und Korrekturschleife', 'At least two trial migrations with a deviation report and correction loop'),
      l('Delta-Migration im Cut-over', 'Delta migration at cut-over', 'Finale Delta-Migration im Cut-over-Fenster inkl. Abschlussabgleich', 'Final delta migration within the cut-over window, including a final reconciliation'),
      l('301-Redirects & SEO-Migration', '301 redirects & SEO migration', 'URL-Inventar, 1:1-Mapping aller Altrouten, 301-Weiterleitungen, Test auf Staging und Monitoring nach Launch', 'URL inventory, 1:1 mapping of all legacy routes, 301 redirects, staging test and post-launch monitoring'),
    ],
  },
  {
    titel: ['Store-Aufbau & Design', 'Store Build & Design'],
    umfang: ['Storefronts, Designsystem, Templates, interaktive Features', 'Storefronts, design system, templates, interactive features'],
    abrechnung: 'einmalig',
    leistungen: [
      l('Storefront & Theme', 'Storefront & theme', 'Designsystem und Templates: Startseite, Kategorie, Produkt, Content, Warenkorb, Konto; optimiert für Mobile und Performance', 'Design system and templates: home, collection, product, content, cart, account; optimised for mobile and performance'),
      l('Weitere Storefronts', 'Additional storefronts', 'Weitere Storefronts auf gemeinsamer Theme-Basis mit storefront-spezifischen Ausprägungen', 'Additional storefronts on a shared theme base with storefront-specific variations'),
      l('Redaktionelle Pflegbarkeit', 'Editorial flexibility', 'Inhalte über Sections pflegbar, damit Änderungen ohne Entwicklung möglich sind', 'Content managed through sections, so changes are possible without development'),
      l('Produktdokumente auf der Produktseite', 'Product documents on product pages', 'Anleitungen, Datenblätter und Quick Guides direkt auf der Produktseite', 'Manuals, data sheets and quick guides directly on the product page'),
      l('Aktionen & Rabatte', 'Promotions & discounts', 'Rabattcodes, Warenkorbrabatte, prozentuale und Kaufe-X-erhalte-Y-Aktionen', 'Discount codes, cart-level discounts, percentage and buy-X-get-Y promotions'),
      l('Produktfinder-Quiz', 'Product finder quiz', 'Geführte Produktauswahl anhand weniger Fragen mit passender Empfehlung', 'Guided product selection based on a few questions with a matching recommendation'),
      l('Vergleichskonfigurator', 'Comparison configurator', 'Dynamischer Produktvergleich mit Live-Filtern', 'Dynamic product comparison with live filters'),
      l('Onboarding- & Tutorial-Hub', 'Onboarding & tutorial hub', 'Hilfebereich zu Einrichtung, Pflege und Fehlerbehebung der Produkte', 'Help centre covering product setup, care and troubleshooting'),
    ],
  },
  {
    titel: ['Technical Setup', 'Technical Setup'],
    umfang: ['Märkte, Sprachen, Währungen, Checkout, Versand, Steuer- und Compliance-Logik', 'Markets, languages, currencies, checkout, shipping, tax and compliance logic'],
    abrechnung: 'einmalig',
    leistungen: [
      l('Märkte & Währungen', 'Markets & currencies', 'Einrichtung der Märkte, Währungen und Preisregeln je Zielland', 'Setup of markets, currencies and pricing rules per target country'),
      l('Store-Switcher', 'Store switcher', 'Länder- und Marktauswahl mit automatischer Zuordnung per Geo-IP', 'Country and market selection with automatic geo-IP routing'),
      l('Sprachen & Übersetzung', 'Languages & translation', 'Einrichtung der Sprachen und Übersetzungs-Workflow', 'Language setup and translation workflow'),
      l('Versandzonen & Länder-Restriktionen', 'Shipping zones & country restrictions', 'Versandprofile, Zonen, Versanddienstleister, Zuschläge und Schwellenwerte', 'Shipping profiles, zones, carriers, surcharges and thresholds'),
      l('Checkout-Restriktionen', 'Checkout restrictions', 'Durchsetzung von Länder- und Produktrestriktionen im Checkout', 'Enforcement of country and product restrictions at checkout'),
      l('Zahlungsarten', 'Payment methods', 'Einrichtung, Test und Freigabe der Zahlungsanbieter und Zahlungsarten', 'Setup, testing and approval of payment providers and methods'),
      l('Steuer- & Zolllogik', 'Tax & duties logic', 'Steuer- und Zolllogik inkl. Anbindung der vom Kunden lizenzierten Steuerlösung', 'Tax and duties logic, including connection of the tax solution licensed by the client'),
      l('Transaktions-E-Mails', 'Transactional emails', 'Steuerung, welche Transaktions-E-Mails der Shop versendet und welche aus Drittsystemen kommen', 'Control over which transactional emails the shop sends and which come from third-party systems'),
      l('Altersprüfung', 'Age verification', 'Altersprüfung je Markt, konfigurierbar', 'Age verification per market, configurable'),
      l('Sanctions-Screening', 'Sanctions screening', 'Prüfung von Bestellungen gegen Sanktionslisten im Checkout', 'Screening of orders against sanctions lists at checkout'),
      l('Fraud-Automation', 'Fraud automation', 'Automatische Risikokennzeichnung und Benachrichtigung bei verdächtigen Bestellungen', 'Automatic risk flagging and notification for suspicious orders'),
      l('RMA- & Garantie-Workflow', 'RMA & warranty workflow', 'Geräteregistrierung, Garantie- und Rücksendeanfragen mit Prüfprozess', 'Device registration, warranty and return requests with a review process'),
      l('Point of Sale', 'Point of sale', 'Kassensystem für Events und Ladengeschäft mit gemeinsamem Bestand online und offline', 'POS for events and retail with shared online and offline inventory'),
      l('Performance & SEO-Grundlagen', 'Performance & SEO foundations', 'Domainstruktur, hreflang, Sitemaps und Core-Web-Vitals-Optimierung', 'Domain structure, hreflang, sitemaps and Core Web Vitals optimisation'),
    ],
  },
  {
    titel: ['B2B', 'B2B'],
    umfang: ['Firmenkonten, Preislisten, Zahlungsbedingungen, B2B-Bestellprozess', 'Company accounts, price lists, payment terms, B2B ordering'],
    abrechnung: 'einmalig',
    leistungen: [
      l('Firmenkonten & Rollen', 'Company accounts & roles', 'Firmenkonten mit Standorten, Rollen und Bestellberechtigungen', 'Company accounts with locations, roles and ordering permissions'),
      l('Kataloge & Preislisten', 'Catalogues & price lists', 'Kundenspezifische Kataloge, Preislisten, Staffel- und Volumenpreise', 'Customer-specific catalogues, price lists, tiered and volume pricing'),
      l('Zahlungsziele, Steuer & Mengen', 'Payment terms, tax & quantities', 'Zahlungsziele, Steuerbefreiung, Mindestbestellmengen und Verpackungseinheiten', 'Payment terms, tax exemptions, minimum order quantities and pack sizes'),
      l('Händlerregistrierung', 'Trade registration', 'Registrierung mit Prüf-Workflow und Freischaltung neuer Händler', 'Registration with review workflow and approval of new trade customers'),
    ],
  },
  {
    titel: ['Integration / ERP', 'Integration / ERP'],
    umfang: ['ERP-Anbindung, Bestell-, Bestands- und Belegflüsse, Fehlermonitoring', 'ERP connection, order, inventory and document flows, error monitoring'],
    abrechnung: 'einmalig',
    leistungen: [
      l('ERP-Anbindung Bestellungen & Belege', 'ERP connection for orders & documents', 'Übertragung von Bestellungen und Belegen an das ERP', 'Transfer of orders and documents to the ERP'),
      l('Artikel-, Bestands- & Preissync', 'Product, inventory & price sync', 'Synchronisation von Artikeldaten, Beständen und Preisen inkl. Datenhoheit je Feld und Intervallen', 'Synchronisation of product data, inventory and prices, including field ownership and intervals'),
      l('Schnittstellenspezifikation', 'Interface specification', 'Spezifikation und Datenmodell auf Shop-Seite für die Umsetzung durch den ERP-Dienstleister', 'Shop-side specification and data model for implementation by the ERP provider'),
      l('Fehlermonitoring', 'Error monitoring', 'Fehlermonitoring, Wiederholungslogik und Benachrichtigung bei fehlgeschlagenen Übertragungen', 'Error monitoring, retry logic and notification of failed transfers'),
    ],
  },
  {
    titel: ['App-Setup & Tracking', 'App Setup & Tracking'],
    umfang: ['App-Auswahl und Einrichtung, GA4/GTM, Consent, Reporting-Basis', 'App selection and setup, GA4/GTM, consent, reporting foundation'],
    abrechnung: 'einmalig',
    leistungen: [
      l('App-Auswahl & Konfiguration', 'App selection & configuration', 'Auswahl, Einrichtung und Konfiguration der benötigten Apps (Abo-Kosten trägt der Kunde)', 'Selection, installation and configuration of the required apps (subscription fees borne by the client)'),
      l('GA4 & GTM', 'GA4 & GTM', 'GA4- und GTM-Setup mit E-Commerce-Events und Conversion-Tracking', 'GA4 and GTM setup with e-commerce events and conversion tracking'),
      l('Server-side Tracking', 'Server-side tracking', 'Vorbereitung und Einrichtung von serverseitigem Tracking', 'Preparation and setup of server-side tracking'),
      l('Consent-Management', 'Consent management', 'Consent-Management und datenschutzkonforme Tracking-Konfiguration', 'Consent management and privacy-compliant tracking configuration'),
      l('Reporting-Basis', 'Reporting foundation', 'Reporting für Umsatz, Kanäle und Storefront-Vergleich', 'Reporting on revenue, channels and storefront comparison'),
    ],
  },
  {
    titel: ['QA, Launch & Schulung', 'QA, Launch & Training'],
    umfang: ['Testing, Go-live-Begleitung, Hypercare, Schulung', 'Testing, go-live support, hypercare, training'],
    abrechnung: 'einmalig',
    leistungen: [
      l('Testphase & Abnahme', 'Testing & acceptance', 'Strukturierte Testphase auf Staging mit dokumentierten Testprotokollen und Abnahmeschleifen', 'Structured testing on staging with documented test reports and acceptance loops'),
      l('Go-live & Cut-over', 'Go-live & cut-over', 'Go-live-Begleitung mit Cut-over-Plan, DNS-Umstellung und Rollback-Option', 'Go-live support with cut-over plan, DNS switch and rollback option'),
      l('Hypercare', 'Hypercare', 'Hypercare-Phase direkt nach Launch mit priorisierter Fehlerbehebung', 'Hypercare phase right after launch with prioritised bug fixing'),
      l('Schulung', 'Training', 'Schulung des Teams zu Shop-Pflege, Bestellabwicklung, Inhalten und Reporting (remote oder vor Ort)', 'Team training on shop management, order processing, content and reporting (remote or on site)'),
    ],
  },
  {
    titel: ['Projektmanagement', 'Project Management'],
    umfang: ['Projektsteuerung, Abstimmung, Dokumentation, Qualitätssicherung', 'Project steering, coordination, documentation, quality assurance'],
    abrechnung: 'einmalig',
    leistungen: [
      l('Projektleitung & Status', 'Project lead & status', 'Feste Projektleitung mit Aufgaben-, Termin- und Risikosteuerung und wöchentlichem Status', 'Dedicated project lead with task, schedule and risk management and weekly status updates'),
      l('Abstimmung mit Dritten', 'Third-party coordination', 'Abstimmung mit Plattform, App-Anbietern, Dienstleistern und Zahlungsanbietern', 'Coordination with the platform, app vendors, service providers and payment providers'),
      l('Dokumentation & Übergabe', 'Documentation & handover', 'Laufende Dokumentation und Übergabeunterlagen zum Projektende', 'Ongoing documentation and handover package at project end'),
    ],
  },
  {
    titel: ['Website (Webflow)', 'Website (Webflow)'],
    umfang: ['Webflow-Setup, Migration bestehender Seiten, Formulare, responsives Design', 'Webflow setup, migration of existing pages, forms, responsive design'],
    abrechnung: 'einmalig',
    leistungen: [
      l('Webflow-Setup & Projektstruktur', 'Webflow setup & project structure', 'Einrichtung des Webflow-Projekts mit Seitenstruktur und CMS', 'Setup of the Webflow project with page structure and CMS'),
      l('Migration bestehender Seiten', 'Migration of existing pages', 'Übernahme aller bestehenden Seiten und Inhalte', 'Transfer of all existing pages and content'),
      l('Terminbuchung', 'Appointment booking', 'Terminbuchungssystem per Integration oder nativer Lösung', 'Appointment booking via integration or native solution'),
      l('Kontaktformular', 'Contact form', 'Kontaktformular mit Weiterleitung und Bestätigung', 'Contact form with routing and confirmation'),
      l('Responsives Design', 'Responsive design', 'Markenkonforme Gestaltung, optimiert für alle Endgeräte', 'On-brand design optimised for all devices'),
      l('SEO-Grundstruktur', 'SEO foundation', 'Meta-Tags, Seitenstruktur und saubere URLs', 'Meta tags, page structure and clean URLs'),
    ],
  },
  {
    titel: ['SEO', 'SEO'],
    umfang: ['Keyword-Recherche, Wettbewerbsanalyse, Content-Empfehlungen', 'Keyword research, competitor analysis, content recommendations'],
    abrechnung: 'einmalig',
    leistungen: [
      l('Keyword-Recherche & Wettbewerbsanalyse', 'Keyword research & competitor analysis', 'Analyse der relevantesten Suchbegriffe und des Wettbewerbs', 'Analysis of the most relevant search terms and the competition'),
      l('Priorisierte Keyword-Liste', 'Prioritised keyword list', 'Keyword-Liste mit Suchvolumen und Schwierigkeit', 'Keyword list with search volume and difficulty'),
      l('Empfehlungen Struktur & Content', 'Structure & content recommendations', 'Empfehlungen für Seitenstruktur und Content-Optimierung', 'Recommendations for page structure and content optimisation'),
    ],
  },
  {
    titel: ['E-Mail-Marketing (Klaviyo)', 'Email Marketing (Klaviyo)'],
    umfang: ['Klaviyo-Integration, Migration von Listen und Flows, Templates', 'Klaviyo integration, migration of lists and flows, templates'],
    abrechnung: 'einmalig',
    leistungen: [
      l('Klaviyo-Integration', 'Klaviyo integration', 'Anbindung von Klaviyo an Shop und Tracking', 'Connection of Klaviyo to the shop and tracking'),
      l('Migration von Listen & Flows', 'Migration of lists & flows', 'Übernahme bestehender Listen, Segmente und Automationen', 'Transfer of existing lists, segments and automations'),
      l('Flows & Templates', 'Flows & templates', 'Aufbau der Kern-Flows und E-Mail-Templates im CI', 'Build of core flows and on-brand email templates'),
    ],
  },
  {
    titel: ['Audits', 'Audits'],
    umfang: ['Bestandsaufnahme mit konkreten Handlungsempfehlungen', 'Assessment with concrete recommendations'],
    abrechnung: 'einmalig',
    leistungen: [
      l('Audit Google Ads & Meta Ads', 'Google Ads & Meta Ads audit', 'Analyse des bestehenden Kampagnen- und Tracking-Setups mit Empfehlungen', 'Analysis of the existing campaign and tracking setup with recommendations'),
      l('Shop- & Migrations-Audit', 'Shop & migration audit', 'Analyse von Plattform, Performance, Datenqualität und Migrationsaufwand', 'Analysis of platform, performance, data quality and migration effort'),
    ],
  },
  {
    titel: ['Shop-Betreuung & Wartung', 'Shop Care & Maintenance'],
    umfang: ['Monitoring, Updates, Fehlerbehebung und Support', 'Monitoring, updates, bug fixing and support'],
    abrechnung: 'monatlich',
    leistungen: [
      l('Monitoring & Verfügbarkeit', 'Monitoring & uptime', 'Laufende Überwachung von Verfügbarkeit, Checkout und Schnittstellen', 'Continuous monitoring of uptime, checkout and integrations'),
      l('Theme- & App-Updates', 'Theme & app updates', 'Einspielen und Testen von Theme- und App-Updates', 'Applying and testing theme and app updates'),
      l('Fehlerbehebung', 'Bug fixing', 'Fehlerbehebung im vereinbarten Stundenkontingent', 'Bug fixing within the agreed hour allowance'),
      l('Performance- & Sicherheitschecks', 'Performance & security checks', 'Regelmäßige Prüfung von Ladezeiten, Apps und Zugriffsrechten', 'Regular review of load times, apps and access rights'),
      l('Support mit Reaktionszeit', 'Support with response time', 'Support per E-Mail oder Ticket mit vereinbarter Reaktionszeit', 'Support via email or ticket with an agreed response time'),
    ],
  },
  {
    titel: ['Weiterentwicklung (Retainer)', 'Ongoing Development (Retainer)'],
    umfang: ['Monatliches Entwicklungskontingent für neue Funktionen und Optimierungen', 'Monthly development allowance for new features and improvements'],
    abrechnung: 'monatlich',
    leistungen: [
      l('Entwicklungskontingent', 'Development allowance', 'Festes monatliches Kontingent für Entwicklung und Design', 'Fixed monthly allowance for development and design'),
      l('Umsetzung nach Priorisierung', 'Delivery by priority', 'Umsetzung von Features und Optimierungen nach gemeinsamer Priorisierung', 'Delivery of features and improvements according to joint prioritisation'),
      l('Monatliche Planung', 'Monthly planning', 'Monatlicher Planungstermin mit Rückblick und nächsten Schritten', 'Monthly planning session with review and next steps'),
    ],
  },
  {
    titel: ['Google-Ads-Betreuung', 'Google Ads Management'],
    umfang: ['Strategie, Kampagnen, Tracking, Optimierung und Reporting', 'Strategy, campaigns, tracking, optimisation and reporting'],
    abrechnung: 'monatlich',
    leistungen: [
      l('Kampagnenstrategie & Umsetzung', 'Campaign strategy & execution', 'Kampagnenstrategie, Planung und Umsetzung (Search, ggf. Display und Shopping)', 'Campaign strategy, planning and execution (Search, and Display or Shopping where relevant)'),
      l('Tracking & Conversions', 'Tracking & conversions', 'Tracking-Setup und Conversion-Konfiguration (GTM, GA4)', 'Tracking setup and conversion configuration (GTM, GA4)'),
      l('Keywords & Anzeigentexte', 'Keywords & ad copy', 'Laufende Keyword-Optimierung und Anzeigentexte', 'Ongoing keyword optimisation and ad copy'),
      l('Gebotsmanagement & Optimierung', 'Bid management & optimisation', 'Gebotsmanagement und kontinuierliche Optimierung', 'Bid management and continuous optimisation'),
      l('Monatliches Reporting', 'Monthly reporting', 'Monatliches Reporting mit Kennzahlen und Empfehlungen', 'Monthly report with KPIs and recommendations'),
    ],
  },
  {
    titel: ['Meta-Ads-Betreuung', 'Meta Ads Management'],
    umfang: ['Strategie, Creatives, Tracking, Optimierung und Reporting', 'Strategy, creatives, tracking, optimisation and reporting'],
    abrechnung: 'monatlich',
    leistungen: [
      l('Kampagnenstrategie & Zielgruppen', 'Campaign strategy & audiences', 'Kampagnenstruktur, Zielgruppen und Funnel-Planung', 'Campaign structure, audiences and funnel planning'),
      l('Creatives & Anzeigentexte', 'Creatives & ad copy', 'Briefing, Auswahl und Test von Anzeigenmotiven und Texten', 'Briefing, selection and testing of ad creatives and copy'),
      l('Pixel & Conversions API', 'Pixel & Conversions API', 'Einrichtung und Pflege von Meta-Pixel und Conversions API', 'Setup and maintenance of the Meta pixel and Conversions API'),
      l('Budget- & Kampagnenoptimierung', 'Budget & campaign optimisation', 'Laufende Optimierung von Budgets, Zielgruppen und Anzeigen', 'Ongoing optimisation of budgets, audiences and ads'),
      l('Monatliches Reporting', 'Monthly reporting', 'Monatliches Reporting mit Kennzahlen und Empfehlungen', 'Monthly report with KPIs and recommendations'),
    ],
  },
  {
    titel: ['SEO-Betreuung', 'SEO Management'],
    umfang: ['Monitoring, OnPage- und Content-Optimierung, technisches SEO', 'Monitoring, on-page and content optimisation, technical SEO'],
    abrechnung: 'monatlich',
    leistungen: [
      l('Ranking-Monitoring', 'Ranking monitoring', 'Beobachtung der wichtigsten Rankings und Sichtbarkeit', 'Tracking of key rankings and visibility'),
      l('OnPage- & Content-Optimierung', 'On-page & content optimisation', 'Optimierung von Seiten, Meta-Daten und Inhalten', 'Optimisation of pages, metadata and content'),
      l('Technisches SEO-Monitoring', 'Technical SEO monitoring', 'Prüfung von Indexierung, Weiterleitungen, Fehlerseiten und Ladezeiten', 'Checks of indexing, redirects, error pages and load times'),
      l('Monatliches Reporting', 'Monthly reporting', 'Monatliches Reporting mit Kennzahlen und Empfehlungen', 'Monthly report with KPIs and recommendations'),
    ],
  },
  {
    titel: ['E-Mail-Marketing-Betreuung', 'Email Marketing Management'],
    umfang: ['Kampagnen, Flows, Segmentierung, Tests und Reporting', 'Campaigns, flows, segmentation, testing and reporting'],
    abrechnung: 'monatlich',
    leistungen: [
      l('Newsletter-Kampagnen', 'Newsletter campaigns', 'Planung, Gestaltung und Versand der Newsletter', 'Planning, design and sending of newsletters'),
      l('Flow-Optimierung', 'Flow optimisation', 'Laufende Optimierung der automatisierten Flows', 'Ongoing optimisation of automated flows'),
      l('Segmentierung & A/B-Tests', 'Segmentation & A/B tests', 'Segmentierung der Empfänger und Tests von Betreffzeilen und Inhalten', 'Audience segmentation and testing of subject lines and content'),
      l('Monatliches Reporting', 'Monthly reporting', 'Monatliches Reporting mit Kennzahlen und Empfehlungen', 'Monthly report with KPIs and recommendations'),
    ],
  },
  {
    titel: ['Conversion-Optimierung (CRO)', 'Conversion Rate Optimisation (CRO)'],
    umfang: ['Analyse, Hypothesen, A/B-Tests und Umsetzung', 'Analysis, hypotheses, A/B tests and implementation'],
    abrechnung: 'monatlich',
    leistungen: [
      l('Analyse & Hypothesen', 'Analysis & hypotheses', 'Auswertung von Nutzerverhalten und Ableitung von Hypothesen', 'Analysis of user behaviour and derivation of hypotheses'),
      l('A/B-Tests', 'A/B tests', 'Aufsetzen und Auswerten von A/B-Tests', 'Setup and evaluation of A/B tests'),
      l('Umsetzung der Optimierungen', 'Implementation of improvements', 'Umsetzung erfolgreicher Varianten im Shop', 'Rollout of winning variants in the shop'),
      l('Monatliches Reporting', 'Monthly reporting', 'Monatliches Reporting mit Kennzahlen und Empfehlungen', 'Monthly report with KPIs and recommendations'),
    ],
  },
  {
    titel: ['Consulting & Betreuung', 'Consulting & Support'],
    umfang: ['Strategische Begleitung, Briefings, kleine Anpassungen', 'Strategic guidance, briefings, minor adjustments'],
    abrechnung: 'monatlich',
    leistungen: [
      l('Creative Strategy & Content-Briefings', 'Creative strategy & content briefings', 'Creative Strategy und Briefings für Inhalte und Kampagnen', 'Creative strategy and briefings for content and campaigns'),
      l('Optimierungsempfehlungen', 'Optimisation recommendations', 'Laufende Empfehlungen zu SEO, Ads und Website', 'Ongoing recommendations on SEO, ads and website'),
      l('Kleine Website-Anpassungen', 'Minor website adjustments', 'Kleine Fixes und Anpassungen an der Website', 'Minor fixes and adjustments to the website'),
      l('Monatliches Reporting', 'Monthly reporting', 'Monatliches Reporting zu Ads und Website', 'Monthly reporting on ads and website'),
    ],
  },
];
