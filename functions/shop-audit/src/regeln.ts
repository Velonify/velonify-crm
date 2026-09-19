import type { Merkmale } from './merkmale.js';
import type { Messung } from './pagespeed.js';

export type Bereich = 'plattform' | 'geschwindigkeit' | 'tracking' | 'email' | 'shop' | 'seo';
export type Schwere = 'hoch' | 'mittel' | 'hinweis';

export interface Befund {
  /** Stable key of the rule, also used by Claude to reference the finding. */
  id: string;
  bereich: Bereich;
  schwere: Schwere;
  text: string;
  /** The measured value behind the finding, e.g. "5800 ms" or "2.4.6". */
  wert: string;
}

export interface NichtGeprueft {
  bereich: Bereich | 'produktseite';
  grund: string;
}

/**
 * End of standard support for Magento Open Source / Adobe Commerce (Adobe lifecycle policy).
 * Same table as EOL_STANDARD in the lead qualifier (scoring.py); keep both in sync.
 */
export const MAGENTO_EOL: Record<string, string> = {
  '2.4.4': '2025-04-12',
  '2.4.5': '2025-08-12',
  '2.4.6': '2026-08-11',
  '2.4.7': '2027-05-31',
  '2.4.8': '2028-05-31',
  '2.4.9': '2029-05-31',
};

export type EolStatus = 'eol' | 'eol_soon' | 'supported' | 'unknown';

export function magentoEol(version: string, heute: Date): { status: EolStatus; datum: string } {
  const teile = version.replace(/-p\d+$/i, '').split('.');
  const datum = MAGENTO_EOL[teile.slice(0, 3).join('.')];
  if (!datum) {
    if (teile[0] === '2' && teile.length >= 2 && Number(teile[1]) <= 3) return { status: 'eol', datum: '' };
    if (teile[0] === '1') return { status: 'eol', datum: '2020-06-30' };
    return { status: 'unknown', datum: '' };
  }
  const ende = new Date(`${datum}T00:00:00Z`);
  if (ende <= heute) return { status: 'eol', datum };
  if (ende.getTime() - heute.getTime() <= 365 * 24 * 3600 * 1000) return { status: 'eol_soon', datum };
  return { status: 'supported', datum };
}

const komma = (n: number, stellen = 1) => n.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
const sekunden = (ms: number) => `${komma(ms / 1000)} s`;
const kib = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString('de-DE')} KiB`;
const tag = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
const monat = (d: Date) => d.toLocaleDateString('de-DE', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const quelle = (m: Messung) => (m.quelle === 'feld' ? 'gemessen bei echten Nutzern' : 'Labormessung mit gedrosselter Mobilverbindung');

const NAMEN: Record<string, string> = {
  meta: 'Meta-Pixel', tiktok: 'TikTok-Pixel', pinterest: 'Pinterest-Tag',
  klaviyo: 'Klaviyo', emarsys: 'Emarsys', mailchimp: 'Mailchimp', cleverreach: 'CleverReach', brevo: 'Brevo',
  rapidmail: 'rapidmail', newsletter2go: 'Newsletter2Go', omnisend: 'Omnisend', mailerlite: 'MailerLite',
  hubspot: 'HubSpot', salesforce_mc: 'Salesforce Marketing Cloud', inxmail: 'Inxmail', episerver_campaign: 'Optimizely Campaign',
};
/** E-mail tools whose signup forms usually come as pop-ups or JavaScript embeds. */
const POPUP_TOOLS = new Set(['klaviyo', 'omnisend', 'mailchimp', 'brevo', 'mailerlite', 'hubspot']);
const name = (schluessel: string) => NAMEN[schluessel] ?? schluessel;
const liste = (werte: string[]) => (werte.length <= 1 ? werte.join('') : `${werte.slice(0, -1).join(', ')} und ${werte.at(-1)}`);

export interface Eingabe {
  /** null when the homepage could not be loaded. */
  merkmale: Merkmale | null;
  mobil: Messung | null;
  desktop: Messung | null;
  heute: Date;
}

/** Fixed rules from measurements to findings. Only what was measured becomes a finding. */
export function befundeAus({ merkmale, mobil, desktop, heute }: Eingabe): Befund[] {
  const befunde: Befund[] = [];
  const add = (id: string, bereich: Bereich, schwere: Schwere, text: string, wert: string) => befunde.push({ id, bereich, schwere, text, wert });

  if (merkmale) {
    const p = merkmale.plattform;
    if (p.name === 'magento1') {
      add('plattform_magento1', 'plattform', 'hoch', 'Der Shop läuft auf Magento 1, das seit Juni 2020 keine Sicherheitsupdates mehr bekommt.', 'magento1');
    } else if (p.name === 'magento2' && p.version) {
      const eol = magentoEol(p.version, heute);
      if (eol.status === 'eol' && eol.datum) {
        add('plattform_magento_eol', 'plattform', 'hoch', `Magento ${p.version} ist seit dem ${tag(eol.datum)} ohne Standard-Support, es gibt also keine regulären Sicherheitsupdates mehr.`, p.version);
      } else if (eol.status === 'eol') {
        add('plattform_magento_eol', 'plattform', 'hoch', `Magento ${p.version} bekommt seit spätestens September 2022 keine Sicherheitsupdates mehr.`, p.version);
      } else if (eol.status === 'eol_soon') {
        add('plattform_magento_eol_bald', 'plattform', 'mittel', `Der Standard-Support für Magento ${p.version} endet am ${tag(eol.datum)}.`, p.version);
      }
    } else if (p.name === 'shopware5') {
      add('plattform_shopware5', 'plattform', 'hoch', 'Der Shop läuft auf Shopware 5, das seit Juli 2024 keine Updates mehr bekommt.', 'shopware5');
    }
    if (p.name === 'magento2' && p.deploy_ts > 0) {
      const deploy = new Date(p.deploy_ts * 1000);
      const monate = Math.floor((heute.getTime() - deploy.getTime()) / (30.44 * 24 * 3600 * 1000));
      if (monate >= 12) {
        add('plattform_alter_deploy', 'plattform', 'hinweis', `Die Shop-Dateien wurden zuletzt im ${monat(deploy)} neu ausgeliefert, vor ${monate} Monaten.`, `${monate} Monate`);
      }
    }
  }

  if (mobil) {
    const lcp = mobil.lcp_ms;
    if (lcp !== null && lcp > 2500) {
      add('speed_lcp_mobil', 'geschwindigkeit', lcp > 4000 ? 'hoch' : 'mittel',
        `Mobil dauert es ${sekunden(lcp)}, bis der Hauptinhalt steht (${quelle(mobil)}; Google empfiehlt höchstens 2,5 s).`, `${lcp} ms`);
    }
    if (mobil.score !== null && mobil.score < 50) {
      add('speed_score_mobil', 'geschwindigkeit', 'mittel', `PageSpeed-Wert mobil: ${mobil.score} von 100.`, String(mobil.score));
    }
    if (mobil.cls !== null && mobil.cls > 0.25) {
      add('speed_cls', 'geschwindigkeit', 'mittel', `Die Seite verschiebt sich beim Laden sichtbar (CLS ${komma(mobil.cls, 2)}, gut ist bis 0,1).`, String(mobil.cls));
    }
    if (mobil.inp_ms !== null && mobil.inp_ms > 500) {
      add('speed_inp', 'geschwindigkeit', 'mittel', `Die Seite reagiert mobil träge auf Eingaben (${mobil.inp_ms} ms, gut ist bis 200 ms).`, `${mobil.inp_ms} ms`);
    }
    const ttfb = mobil.ttfb_ms;
    if (ttfb !== null && ttfb > 800) {
      add('speed_ttfb', 'geschwindigkeit', ttfb > 1800 ? 'hoch' : 'mittel',
        `Der Server braucht ${sekunden(ttfb)}, bis er überhaupt antwortet (${quelle(mobil)}; gut ist unter 0,8 s).`, `${ttfb} ms`);
    }
    if (mobil.tbt_ms !== null && mobil.tbt_ms > 600) {
      add('speed_tbt', 'geschwindigkeit', 'mittel', `Beim Laden ist die Seite mobil ${sekunden(mobil.tbt_ms)} lang blockiert und reagiert nicht auf Tippen (gut ist unter 0,2 s).`, `${mobil.tbt_ms} ms`);
    }
    // The two biggest savings Google names, with Google's own wording.
    for (const b of mobil.bremsen.filter((x) => x.ms >= 300 || x.bytes >= 300 * 1024).slice(0, 2)) {
      const gross = b.ms >= 1000 || b.bytes >= 1024 * 1024;
      const ersparnis = [b.ms >= 100 && `ca. ${sekunden(b.ms)} schneller`, b.bytes >= 100 * 1024 && `${kib(b.bytes)} weniger`].filter(Boolean).join(', ');
      add(`speed_bremse_${b.id}`, 'geschwindigkeit', gross ? 'mittel' : 'hinweis',
        `Bremse laut Google: „${b.titel}“${ersparnis ? ` (${ersparnis})` : ''}.`, b.ms ? `${b.ms} ms` : `${b.bytes} Bytes`);
    }
    const fremd = mobil.drittanbieter.filter((d) => d.ms >= 50);
    const fremdMs = fremd.reduce((summe, d) => summe + d.ms, 0);
    if (fremdMs > 1000) {
      add('speed_drittanbieter', 'geschwindigkeit', 'mittel',
        `Fremd-Scripte beanspruchen mobil ${sekunden(fremdMs)} Rechenzeit, vor allem ${liste(fremd.slice(0, 3).map((d) => d.name))}.`, `${fremdMs} ms`);
    }
  }
  if (desktop?.score != null && desktop.score < 50) {
    add('speed_score_desktop', 'geschwindigkeit', 'hinweis', `PageSpeed-Wert am Desktop: ${desktop.score} von 100.`, String(desktop.score));
  }

  if (merkmale) {
    const { analyse, pixel, consent, email_tools: tools, seo } = merkmale;
    if (!analyse.ga4 && !analyse.gtm && !analyse.universal_analytics && analyse.andere.length === 0) {
      add('tracking_keine_analyse', 'tracking', 'hoch', 'Weder Google Analytics 4 noch der Google Tag Manager sind eingebunden.', 'kein ga4, kein gtm');
    } else if (analyse.universal_analytics && !analyse.ga4 && !analyse.gtm && analyse.andere.length === 0) {
      add('tracking_universal_analytics', 'tracking', 'hoch', 'Eingebunden ist nur das alte Universal Analytics, das seit Juli 2023 keine Daten mehr erfasst.', 'universal analytics');
    }
    const direkt = [...pixel.map(name), ...(analyse.ga4 || analyse.universal_analytics ? ['Google Analytics'] : [])];
    if (direkt.length > 0 && consent.length === 0) {
      add('tracking_ohne_consent', 'tracking', 'hoch', `${liste(direkt)} ${direkt.length > 1 ? 'sind' : 'ist'} direkt eingebunden, aber kein bekanntes Consent-Tool ist erkennbar.`, direkt.join(', '));
    }
    // Pixels and conversion tags loaded through the Tag Manager do not show up in the HTML, so their absence only counts without GTM.
    if (!analyse.gtm) {
      if (!merkmale.google_ads) add('tracking_kein_ads', 'tracking', 'hinweis', 'Kein Google-Ads-Conversion-Tracking gefunden.', 'kein aw-tag');
      if (pixel.length === 0) add('tracking_keine_pixel', 'tracking', 'hinweis', 'Keine Werbe-Pixel von Meta, TikTok oder Pinterest gefunden.', 'keine pixel');
    }

    if (tools.length === 0) {
      // Newsletter tools like CleverReach are often connected on the server side and leave no trace in the HTML.
      // Behaviour-based flows (abandoned cart, browse abandonment) do need a script on the page, though.
      if (!merkmale.newsletter_formular) {
        add('email_kein_tool', 'email', 'hoch', 'Weder ein E-Mail-Marketing-Tool noch eine Newsletter-Anmeldung sind auf der Startseite erkennbar.', 'kein tool');
      } else {
        add('email_kein_tool', 'email', analyse.gtm ? 'hinweis' : 'mittel',
          'Es gibt eine Newsletter-Anmeldung, aber kein E-Mail-Tool mit Onsite-Tracking wie Klaviyo im Seitencode. Automatische Mails nach abgebrochenem Warenkorb oder angesehenen Produkten sind damit kaum möglich.',
          'kein onsite-tool');
      }
    } else {
      // Pop-up tools show their signup forms via JavaScript, invisible in the HTML; only the others can be judged.
      if (!merkmale.newsletter_formular && !tools.some((t) => POPUP_TOOLS.has(t))) {
        add('email_keine_anmeldung', 'email', 'hinweis', `${liste(tools.map(name))} ist eingebunden, aber im Seitencode der Startseite ist keine Newsletter-Anmeldung zu finden.`, tools.join(', '));
      }
      if (!tools.includes('klaviyo')) add('email_anderes_tool', 'email', 'hinweis', `Für E-Mail-Marketing nutzt der Shop ${liste(tools.map(name))}.`, tools.join(', '));
    }

    if (!merkmale.https) add('shop_kein_https', 'shop', 'hoch', 'Der Shop leitet auf eine unverschlüsselte http-Adresse weiter, Browser markieren ihn als „nicht sicher“.', 'http');
    const fehlend = ['paypal', 'klarna'].filter((z) => !merkmale.zahlarten.includes(z));
    if (merkmale.zahlarten.length > 0 && fehlend.length > 0) {
      add('shop_zahlarten', 'shop', 'hinweis', `Kein Hinweis auf ${liste(fehlend.map((z) => (z === 'paypal' ? 'PayPal' : 'Klarna')))} gefunden.`, fehlend.join(', '));
    }
    if (merkmale.bewertungen.length === 0 && seo.product_bewertungen !== true) {
      add('shop_keine_bewertungen', 'shop', 'mittel', 'Keine Shop- oder Produktbewertungen sichtbar, auch kein Siegel wie Trusted Shops.', 'keine');
    }

    if (seo.robots_sperrt_alles) add('seo_robots', 'seo', 'hoch', 'Die robots.txt sperrt den ganzen Shop für Suchmaschinen.', 'Disallow: /');
    if (!seo.title) add('seo_title', 'seo', 'mittel', 'Die Startseite hat keinen Title.', 'leer');
    if (!seo.meta_description) add('seo_meta_description', 'seo', 'mittel', 'Die Startseite hat keine Meta-Description.', 'fehlt');
    if (!seo.h1) add('seo_h1', 'seo', 'hinweis', 'Die Startseite hat keine H1-Überschrift.', 'fehlt');
    if (!seo.canonical) add('seo_canonical', 'seo', 'hinweis', 'Die Startseite hat kein Canonical-Tag.', 'fehlt');
    if (seo.sitemap === false) add('seo_sitemap', 'seo', 'hinweis', 'Weder unter /sitemap.xml noch in der robots.txt ist eine XML-Sitemap zu finden.', 'fehlt');
    if (seo.product_markup === false) {
      add('seo_product_markup', 'seo', 'mittel', 'Die geprüfte Produktseite hat keine strukturierten Produktdaten, Preis und Verfügbarkeit fehlen damit in den Google-Ergebnissen.', 'kein Product');
    }
  }

  const rang: Record<Schwere, number> = { hoch: 0, mittel: 1, hinweis: 2 };
  return befunde.sort((a, b) => rang[a.schwere] - rang[b.schwere]);
}

/** Summary used when Claude is unavailable: the three most severe findings. */
export function kurzfassung(befunde: Befund[]): string {
  if (befunde.length === 0) return 'Keine auffälligen Befunde.';
  return befunde.slice(0, 3).map((b) => b.text.replace(/\.$/, '')).join('. ') + '.';
}
