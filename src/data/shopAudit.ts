import type { AuditAnfrage, AuditErgebnis, Befund } from './audit';
import { AuthExpiredError } from './errors';

export interface ShopAuditApi {
  pruefe(anfrage: AuditAnfrage): Promise<AuditErgebnis>;
}

/** Calls the Cloud Function with the Google token the app already holds. One audit takes 20–60 seconds. */
export class CloudShopAudit implements ShopAuditApi {
  constructor(
    private readonly url: string,
    private readonly getToken: () => Promise<string>,
  ) {}

  async pruefe(anfrage: AuditAnfrage): Promise<AuditErgebnis> {
    const token = await this.getToken();
    let antwort: Response;
    try {
      antwort = await fetch(this.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(anfrage),
      });
    } catch {
      throw new Error('Das Shop-Audit ist gerade nicht erreichbar. Bitte Internetverbindung prüfen und erneut versuchen.');
    }
    const body = (await antwort.json().catch(() => null)) as (AuditErgebnis & { fehler?: string }) | null;
    if (antwort.status === 401 && /abgelaufen|nicht angemeldet/i.test(body?.fehler ?? '')) throw new AuthExpiredError();
    if (!antwort.ok || !body?.befunde) {
      throw new Error(body?.fehler ?? `Das Shop-Audit hat mit Fehler ${antwort.status} geantwortet.`);
    }
    return body;
  }
}

/** Demo mode: a made-up but plausible audit, the same for the same domain. No shop is contacted. */
export class DemoShopAudit implements ShopAuditApi {
  constructor(private readonly dauerMs = 1500) {}

  async pruefe(anfrage: AuditAnfrage): Promise<AuditErgebnis> {
    await new Promise((resolve) => setTimeout(resolve, this.dauerMs));
    const domain = anfrage.domain.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    let h = 0;
    for (const zeichen of domain) h = (h * 31 + zeichen.charCodeAt(0)) >>> 0;
    const magento1 = h % 3 === 0;
    const lcp = 2200 + (h % 5000);
    const score = 25 + (h % 60);

    const befunde: Befund[] = [];
    if (magento1) befunde.push({ id: 'plattform_magento1', bereich: 'plattform', schwere: 'hoch', text: 'Der Shop läuft auf Magento 1, das seit Juni 2020 keine Sicherheitsupdates mehr bekommt.', wert: 'magento1' });
    else befunde.push({ id: 'plattform_magento_eol', bereich: 'plattform', schwere: 'hoch', text: 'Magento 2.4.6 ist seit dem 11.08.2026 ohne Standard-Support, es gibt also keine regulären Sicherheitsupdates mehr.', wert: '2.4.6' });
    const sek = (lcp / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (lcp > 2500) befunde.push({ id: 'speed_lcp_mobil', bereich: 'geschwindigkeit', schwere: lcp > 4000 ? 'hoch' : 'mittel', text: `Mobil dauert es ${sek} s, bis der Hauptinhalt steht (gemessen bei echten Nutzern; Google empfiehlt höchstens 2,5 s).`, wert: `${lcp} ms` });
    if (score < 50) befunde.push({ id: 'speed_score_mobil', bereich: 'geschwindigkeit', schwere: 'mittel', text: `PageSpeed-Wert mobil: ${score} von 100.`, wert: String(score) });
    if (h % 2 === 0) befunde.push({ id: 'email_kein_tool', bereich: 'email', schwere: 'mittel', text: 'Es gibt eine Newsletter-Anmeldung, aber kein E-Mail-Tool mit Onsite-Tracking wie Klaviyo im Seitencode. Automatische Mails nach abgebrochenem Warenkorb oder angesehenen Produkten sind damit kaum möglich.', wert: 'kein onsite-tool' });
    befunde.push({ id: 'tracking_ohne_consent', bereich: 'tracking', schwere: 'hoch', text: 'Meta-Pixel und Google Analytics sind direkt eingebunden, aber kein bekanntes Consent-Tool ist erkennbar.', wert: 'Meta-Pixel, Google Analytics' });
    befunde.push({ id: 'seo_product_markup', bereich: 'seo', schwere: 'mittel', text: 'Die geprüfte Produktseite hat keine strukturierten Produktdaten, Preis und Verfügbarkeit fehlen damit in den Google-Ergebnissen.', wert: 'kein Product' });
    befunde.push({ id: 'seo_canonical', bereich: 'seo', schwere: 'hinweis', text: 'Die Startseite hat kein Canonical-Tag.', wert: 'fehlt' });
    const rang = { hoch: 0, mittel: 1, hinweis: 2 };
    befunde.sort((a, b) => rang[a.schwere] - rang[b.schwere]);

    // Hooks for the first services whose titles fit, like Claude would pick them.
    const passt = (muster: RegExp) => anfrage.leistungen.find((l) => muster.test(l.titel));
    const aufhaenger = [
      { leistung: passt(/migration/i), text: befunde[0].text, befunde: [befunde[0].id] },
      { leistung: passt(/migration/i), text: lcp > 2500 ? `Mobil dauert es ${sek} s, bis der Hauptinhalt steht. Viele Besucher springen ab, bevor sie ein Produkt sehen.` : '', befunde: ['speed_lcp_mobil'] },
      { leistung: passt(/klaviyo|e-?mail/i), text: h % 2 === 0 ? 'Es gibt zwar eine Newsletter-Anmeldung, aber kein E-Mail-Tool mit Onsite-Tracking. Warenkorbabbrecher bekommen so keine automatische Erinnerung.' : '', befunde: ['email_kein_tool'] },
      { leistung: passt(/tracking|consent|google ads/i), text: 'Meta-Pixel und Google Analytics laufen ohne erkennbares Consent-Tool, das ist ein rechtliches Risiko und verfälscht die Daten.', befunde: ['tracking_ohne_consent'] },
    ].flatMap((a) => (a.leistung && a.text ? [{ leistung_id: a.leistung.id, text: a.text, befunde: a.befunde }] : []));

    return {
      domain,
      url: `https://www.${domain}/`,
      status: 'ok',
      plattform: magento1
        ? { name: 'magento1', version: '1', edition: '', sicherheit: 90, eol: 'eol', eol_datum: '2020-06-30' }
        : { name: 'magento2', version: '2.4.6', edition: 'Community', sicherheit: 98, eol: 'eol', eol_datum: '2026-08-11' },
      mobil: {
        strategie: 'mobile', score, lcp_ms: lcp, cls: 0.08, inp_ms: 180 + (h % 300), quelle: 'feld', bytes: 3_100_000, anfragen: 96,
        fcp_ms: 1600 + (h % 900), tbt_ms: 300 + (h % 700), ttfb_ms: 500 + (h % 1500), felddaten: 'seite',
        bremsen: [
          { id: 'image-delivery-insight', titel: 'Bildübermittlung verbessern', anzeige: 'Geschätzte Einsparung von 1.240 KiB', ms: 0, bytes: 1_269_760 },
          { id: 'render-blocking-insight', titel: 'Anfragen zum Blockieren des Renderings', anzeige: 'Geschätzte Einsparung von 610 ms', ms: 610, bytes: 0 },
        ],
        drittanbieter: [
          { name: 'Facebook', kb: 118, ms: 640 },
          { name: 'Google Tag Manager', kb: 410, ms: 220 },
        ],
      },
      desktop: { strategie: 'desktop', score: Math.min(99, score + 25), lcp_ms: 1400, cls: 0.02, inp_ms: null, quelle: 'labor', bytes: 3_300_000, anfragen: 102, fcp_ms: 700, tbt_ms: 90, ttfb_ms: 480, felddaten: 'seite', bremsen: [], drittanbieter: [] },
      merkmale: {
        plattform: { name: magento1 ? 'magento1' : 'magento2', sicherheit: 90, version: magento1 ? '1' : '2.4.6', edition: '', deploy_ts: 0, belege: [] },
        https: true,
        analyse: { ga4: true, gtm: false, universal_analytics: false, andere: [] },
        pixel: ['meta'],
        google_ads: false,
        consent: [],
        email_tools: [],
        newsletter_formular: h % 2 === 0,
        zahlarten: ['paypal', 'klarna', 'rechnung'],
        bewertungen: ['trustedshops'],
        sprachen: ['de'],
        technologien: [
          { name: 'Magento', kategorien: ['Ecommerce'], version: magento1 ? '1' : '2', website: '' },
          { name: 'PHP', kategorien: ['Programming languages'], version: '', website: '' },
          { name: 'Google Analytics', kategorien: ['Analytics'], version: 'GA4', website: '' },
          { name: 'Facebook Pixel', kategorien: ['Advertising'], version: '', website: '' },
          { name: 'PayPal', kategorien: ['Payment processors'], version: '', website: '' },
          { name: 'Klarna Checkout', kategorien: ['Payment processors', 'Buy now pay later'], version: '', website: '' },
          { name: 'Trusted Shops', kategorien: ['Reviews'], version: '', website: '' },
          { name: 'jQuery', kategorien: ['JavaScript libraries'], version: '1.12.4', website: '' },
          { name: 'Nginx', kategorien: ['Web servers', 'Reverse proxies'], version: '', website: '' },
        ],
        seo: { title: `${domain} – Online-Shop`, meta_description: true, h1: true, canonical: false, organization_markup: false, product_markup: false, product_bewertungen: false, sitemap: true, robots_sperrt_alles: false },
      },
      produkt_url: `https://www.${domain}/beispiel-produkt.html`,
      befunde,
      nicht_geprueft: [],
      geprueft_am: new Date().toISOString(),
      zusammenfassung: `${magento1 ? 'Magento 1' : 'Magento 2.4.6'} ohne Support, mobil ${sek} s bis zum Hauptinhalt, Tracking ohne Consent-Tool. (Beispiel aus dem Demo-Modus)`,
      aufhaenger,
      hinweis: '',
      modell: 'demo',
    };
  }
}
