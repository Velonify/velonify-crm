import type { Bereich, Entscheidung, EntscheidungEintrag, LeadDetail, LeadFinderApi, LeadKandidat, LeadStatistik, ListenZeile, PoolKandidat, ZaehlerTag } from '../leadFinder';

const WERBUNG = [['Meta', 'Google Ads'], ['Microsoft Ads'], [], ['Meta'], ['Meta', 'TikTok', 'Pinterest'], []];
const EMAIL = [['Mailchimp'], [], ['Klaviyo'], ['Brevo'], [], ['CleverReach']];

/*
 * Demo mode of the lead finder: invented shops on the reserved .example TLD, checked and decided in memory.
 * This repo is public – never real leads here.
 */

const SYSTEME: [string, string, string][] = [
  ['shopware', '5', 'Shopware 5, seit Juli 2024 ohne Support'],
  ['magento', '1', 'Magento 1, seit Juni 2020 ohne Sicherheitsupdates'],
  ['xtcommerce', '', 'xt:Commerce, nicht mehr gepflegt'],
  ['oxid', '4', 'OXID eShop 4, seit Jahren ohne Support'],
  ['magento', '2.4', ''],
  ['shopware', '6.5', 'Shopware 6.5, Support endet Februar 2027'],
];
const ORTE: [string, string][] = [['50667', 'Köln'], ['20095', 'Hamburg'], ['80331', 'München'], ['70173', 'Stuttgart'], ['01067', 'Dresden'], ['90402', 'Nürnberg']];
const BRANCHEN = ['garten', 'moebel', 'angel', 'musik', 'tee', 'fahrrad', 'lampen', 'werkzeug', 'spielwaren', 'wein', 'outdoor', 'kaffee', 'mode', 'deko', 'reitsport', 'grill', 'buero', 'bad'];
const RAENGE = [5_000, 10_000, 50_000, 100_000, 500_000];

function pool(i: number): PoolKandidat {
  const [system, version] = SYSTEME[i % SYSTEME.length];
  return {
    domain: `${BRANCHEN[i % BRANCHEN.length]}-shop-${i + 1}.example`,
    system, version: version || null, rang_de: RAENGE[i % RAENGE.length], lcp_ms: 1400 + ((i * 733) % 4200),
    system_seit: i % 3 === 0 ? '2019-01-01' : '2022-01-01', system_vorher: null, prioritaet: 110 - i,
  };
}

function kandidat(p: PoolKandidat, i: number): LeadKandidat {
  const [system, version, supportText] = SYSTEME[i % SYSTEME.length];
  const [plz, ort] = ORTE[i % ORTE.length];
  const name = `${p.domain.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} GmbH`;
  const blockiert = i % 11 === 7;
  const anlaesse: LeadKandidat['anlaesse'] = [];
  if (supportText) anlaesse.push({ id: version.startsWith('6') ? 'support_endet' : 'system_ohne_support', text: supportText, gewicht: version.startsWith('6') ? 25 : 40 });
  else anlaesse.push({ id: 'magento_version_unbekannt', text: 'Magento 2, Patch-Stand nicht öffentlich (2.4.4–2.4.6 sind ohne Support)', gewicht: 8 });
  if ((p.lcp_ms ?? 0) > 4000) anlaesse.push({ id: 'langsam', text: `mobil ${((p.lcp_ms ?? 0) / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} s bis zum größten Element (echte Nutzer)`, gewicht: 20 });
  if (p.system_seit === '2019-01-01') anlaesse.push({ id: 'lange_unveraendert', text: `seit mindestens 2019 auf ${system === 'magento' ? 'Magento' : 'Shopware'}`, gewicht: 10 });
  for (const a of anlaesse) a.bereich = 'migration';
  const werbung = WERBUNG[i % WERBUNG.length];
  const email = EMAIL[(i + 1) % EMAIL.length];
  if (werbung.length) anlaesse.push({ id: 'ads_aktiv', text: `schaltet Werbung (${werbung.join(', ')})`, gewicht: 30, bereich: 'ads' });
  else if (p.rang_de! <= 100_000) anlaesse.push({ id: 'ads_ungenutzt', text: `Top ${p.rang_de!.toLocaleString('de-DE')} in Deutschland, aber kein Werbe-Pixel`, gewicht: 20, bereich: 'ads' });
  if (email.includes('Klaviyo')) anlaesse.push({ id: 'klaviyo_ausbau', text: 'nutzt Klaviyo', gewicht: 20, bereich: 'klaviyo' });
  else if (email.length) anlaesse.push({ id: 'klaviyo_wechsel', text: `nutzt ${email.join(', ')}, Wechsel zu Klaviyo möglich`, gewicht: 35, bereich: 'klaviyo' });
  const basis = (p.rang_de! <= 10_000 ? 32 : p.rang_de! <= 100_000 ? 20 : 12) + 13;
  const scores = { migration: 0, ads: 0, klaviyo: 0 } as Record<Bereich, number>;
  for (const b of ['migration', 'ads', 'klaviyo'] as Bereich[]) {
    const eigene = anlaesse.filter((a) => a.bereich === b);
    if (eigene.length) scores[b] = eigene.reduce((s, a, n) => s + (n === 0 ? a.gewicht : Math.round(a.gewicht / 2)), 0) + basis;
  }
  const score = Math.max(...Object.values(scores));
  return {
    domain: p.domain, url: `https://www.${p.domain}/`, geprueft_am: new Date().toISOString(),
    qualifiziert: !blockiert, ausschluss: blockiert ? [{ id: 'blockiert', text: 'Shop blockiert automatische Abrufe (HTTP 403)' }] : [],
    anlaesse, bereiche: (['migration', 'ads', 'klaviyo'] as Bereich[]).filter((b) => scores[b] > 0), scores, score, score_gruende: anlaesse.map((a) => `+${a.gewicht} ${a.text}`), http_status: blockiert ? 403 : 200,
    system, system_label: system === 'magento' ? 'Magento' : system === 'shopware' ? 'Shopware' : system === 'oxid' ? 'OXID eShop' : 'xt:Commerce',
    version, sicherheit: 90, support: { status: supportText ? (version.startsWith('6') ? 'eol_soon' : 'eol') : 'unknown', text: supportText, datum: '' },
    letztes_deploy: system === 'magento' && version.startsWith('2') ? '2024-11-03' : '',
    firma: {
      gefunden: !blockiert, url: `https://www.${p.domain}/impressum`, name: blockiert ? '' : name, rechtsform: 'GmbH',
      register: blockiert ? '' : `HRB ${10_000 + i * 37}`, registergericht: ort, ust_id: '', geschaeftsfuehrer: blockiert ? [] : [['Anna Beispiel', 'Bernd Muster', 'Clara Probe'][i % 3]],
      strasse: `Musterweg ${i + 1}`, plz, ort, land: blockiert ? '' : 'DE', offshore: false, email: blockiert ? '' : `info@${p.domain}`, telefon: blockiert ? '' : '+49 221 000000',
    },
    sitemap: { gefunden: true, urls: 800 + i * 90, produkt_urls: 700 + i * 80, neuestes_lastmod: '2026-09-01' },
    signale: { titel: name, warenkorb: ['warenkorb'], preise: true, copyright_jahr: 2026, social: {} },
    zahlarten: ['paypal', 'klarna', 'rechnung'].slice(0, 1 + (i % 3)), marketing: ['GA4'], werbung, gtm: i % 3 !== 2, email_tools: email, newsletter_formular: true, bewertungen: i % 2 ? ['trustedshops'] : [],
    sprachen: ['de'], technik: ['PHP', 'jQuery'], rang_de: p.rang_de, lcp_ms: p.lcp_ms, pagespeed_mobil: null, belege: [],
  };
}

export class DemoLeadFinder implements LeadFinderApi {
  private readonly pool = Array.from({ length: 60 }, (_, i) => pool(i));
  private readonly pruefungen = new Map<string, LeadKandidat>();
  private readonly entscheidungen = new Map<string, EntscheidungEintrag & { am: string }>();

  constructor(private readonly dauerMs = 400) {
    for (const [i, p] of this.pool.slice(0, 18).entries()) this.pruefungen.set(p.domain, kandidat(p, i));
  }

  private warte = () => new Promise((r) => setTimeout(r, this.dauerMs));

  /** Like the function: an e-mail entered on release fills an Impressum without one. */
  private mitEmail(k: LeadKandidat): LeadKandidat {
    const email = this.entscheidungen.get(k.domain)?.email;
    return k.firma.email || !email ? k : { ...k, firma: { ...k.firma, email } };
  }

  private zeile(roh: LeadKandidat): ListenZeile {
    const k = this.mitEmail(roh);
    return {
      domain: k.domain, geprueft_am: k.geprueft_am, score: k.score, ausschluss: k.ausschluss.map((a) => a.id), anlaesse: k.anlaesse.map((a) => a.id),
      anlass_texte: k.anlaesse.map((a) => a.text), system: k.system, version: k.version, rang_de: k.rang_de, firma: k.firma.name, plz: k.firma.plz, ort: k.firma.ort,
      entscheidung: this.entscheidungen.get(k.domain)?.entscheidung ?? null, prioritaet: this.pool.find((p) => p.domain === k.domain)?.prioritaet,
      bereiche: k.bereiche ?? [], score_migration: k.scores?.migration ?? 0, score_ads: k.scores?.ads ?? 0, score_klaviyo: k.scores?.klaviyo ?? 0,
      werbung: k.werbung ?? [], gtm: k.gtm ?? false, email_tools: k.email_tools, email: k.firma.email || null,
    };
  }

  async naechste(n: number, _bereich: Bereich) {
    return this.pool.filter((p) => !this.pruefungen.has(p.domain) && !this.entscheidungen.has(p.domain)).slice(0, n);
  }
  async pruefe(p: PoolKandidat) {
    await this.warte();
    const k = kandidat(p, this.pool.findIndex((x) => x.domain === p.domain));
    this.pruefungen.set(p.domain, k);
    return k;
  }
  async backlog() {
    return [...this.pruefungen.values()]
      .filter((k) => {
        const e = this.entscheidungen.get(k.domain)?.entscheidung;
        return (k.qualifiziert || e === 'freigegeben') && (!e || e === 'freigegeben');
      })
      .map((k) => this.zeile(k))
      .filter((z) => z.email)
      .sort((a, b) => b.score - a.score);
  }
  async manuell() {
    return [...this.pruefungen.values()].filter((k) => !this.entscheidungen.has(k.domain)).map((k) => this.zeile(k)).filter((z) => z.ausschluss.length > 0 || !z.email);
  }
  async detail(domain: string): Promise<LeadDetail> {
    const k = this.pruefungen.get(domain);
    if (!k) throw new Error('Diese Domain wurde noch nicht geprüft.');
    const e = this.entscheidungen.get(domain);
    return { kandidat: this.mitEmail(k), geprueft_am: k.geprueft_am, von: 'demo@velonify.de', entscheidung: e?.entscheidung ?? null, grund: e?.grund ?? null, entschieden_am: e?.am ?? null, entschieden_von: e ? 'demo@velonify.de' : null, firma_id: e?.firma_id ?? null };
  }
  async details(domains: string[]) {
    return domains.flatMap((d) => (this.pruefungen.has(d) ? [this.mitEmail(this.pruefungen.get(d)!)] : []));
  }
  async entscheide(eintraege: EntscheidungEintrag[]) {
    for (const e of eintraege) this.entscheidungen.set(e.domain, { ...e, am: new Date().toISOString() });
  }
  async zaehler(): Promise<ZaehlerTag[]> {
    const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
    const je = new Map<string, number>();
    for (const e of this.entscheidungen.values()) je.set(e.entscheidung, (je.get(e.entscheidung) ?? 0) + 1);
    return [{ tag: '2026-09-22', entscheidung: 'pipeline', n: 6 }, { tag: '2026-09-22', entscheidung: 'abgelehnt', n: 4 }, ...[...je].map(([entscheidung, n]) => ({ tag: heute, entscheidung: entscheidung as Entscheidung, n }))];
  }
  async statistik(): Promise<LeadStatistik> {
    const alle = [...this.pruefungen.values()];
    const entschieden = [...this.entscheidungen.values()];
    return {
      pool: 54_888, pool_hoch: 5_710, pool_mittel: 12_199, crawl_datum: '2026-09-01', crux_monat: 202608,
      geprueft: alle.length, qualifiziert: alle.filter((k) => k.qualifiziert).length, backlog: (await this.backlog()).length, manuell: (await this.manuell()).length,
      uebernommen: entschieden.filter((e) => e.entscheidung === 'pipeline' || e.entscheidung === 'firma').length,
      abgelehnt: entschieden.filter((e) => e.entscheidung === 'abgelehnt').length,
      offen_ab_25: this.pool.filter((p) => !this.pruefungen.has(p.domain)).length,
    };
  }
  async importiere() {
    await this.warte();
    return { crawl_datum: '2026-09-01', crux_monat: 202608 };
  }
}
