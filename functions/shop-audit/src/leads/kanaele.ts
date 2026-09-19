/*
 * Advertising channels and e-mail tools of a shop, from two sources: our live check of the raw HTML (misses tags
 * the Tag Manager loads later) and HTTP Archive's Wappalyzer run in a real browser (sees them, but is a month old).
 * Both use different names for the same tool, so everything is mapped to one display name.
 */

/** Lower-case name as either source reports it → display name. */
const WERBUNG: Record<string, string> = {
  meta: 'Meta', 'facebook pixel': 'Meta', 'meta pixel': 'Meta', pixelyoursite: 'Meta',
  'google ads': 'Google Ads', 'google ads conversion tracking': 'Google Ads',
  'microsoft advertising': 'Microsoft Ads',
  tiktok: 'TikTok', 'tiktok pixel': 'TikTok',
  pinterest: 'Pinterest', 'pinterest conversion tag': 'Pinterest', 'pinterest tag': 'Pinterest',
  criteo: 'Criteo',
};

const EMAIL: Record<string, string> = {
  klaviyo: 'Klaviyo', 'klaviyo forms': 'Klaviyo', 'klaviyo reviews': 'Klaviyo',
  mailchimp: 'Mailchimp', 'mailchimp for woocommerce': 'Mailchimp', 'mailchimp for wordpress': 'Mailchimp',
  brevo: 'Brevo', sendinblue: 'Brevo',
  mailjet: 'Mailjet',
  cleverreach: 'CleverReach',
  rapidmail: 'rapidmail',
  newsletter2go: 'Newsletter2Go',
  emarsys: 'Emarsys',
  omnisend: 'Omnisend',
  mailerlite: 'MailerLite', 'mailerlite plugin': 'MailerLite',
  hubspot: 'HubSpot',
  activecampaign: 'ActiveCampaign',
  inxmail: 'Inxmail',
  salesforce_mc: 'Salesforce Marketing Cloud', 'salesforce marketing cloud account engagement': 'Salesforce Marketing Cloud',
  episerver_campaign: 'Optimizely Campaign',
};

export const KLAVIYO = 'Klaviyo';

function sammle(tabelle: Record<string, string>, ...quellen: (readonly string[] | null | undefined)[]): string[] {
  const namen = quellen.flatMap((q) => q ?? []).map((n) => tabelle[n.trim().toLowerCase()]).filter((n): n is string => Boolean(n));
  return [...new Set(namen)].sort();
}

/** Ad channels seen live (pixel keys, "Google Ads") or by HTTP Archive. */
export const werbekanaele = (live: readonly string[], poolTechnik: readonly string[] | null) => sammle(WERBUNG, live, poolTechnik);

/** E-mail marketing tools seen live or by HTTP Archive. */
export const emailTools = (live: readonly string[], poolTechnik: readonly string[] | null) => sammle(EMAIL, live, poolTechnik);

/** Google Tag Manager, live (own check or webappanalyzer) or seen by HTTP Archive. */
export const hatGtm = (liveGtm: boolean, liveTechnik: readonly string[], poolTechnik: readonly string[] | null) =>
  liveGtm || [...liveTechnik, ...(poolTechnik ?? [])].some((t) => /^google tag manager/i.test(t));

/** SQL condition: the pool's technology list contains one of these tools (for the view priorities). */
export function technikSql(welche: 'werbung' | 'email' | 'klaviyo' | 'anderes_email'): string {
  const namen = (tabelle: Record<string, string>, filter: (anzeige: string) => boolean) =>
    Object.entries(tabelle).filter(([roh, anzeige]) => !roh.includes('_') && roh !== 'meta' && filter(anzeige)).map(([roh]) => `'${roh}'`);
  const liste =
    welche === 'werbung' ? namen(WERBUNG, () => true)
    : welche === 'email' ? namen(EMAIL, () => true)
    : welche === 'klaviyo' ? namen(EMAIL, (a) => a === KLAVIYO)
    : namen(EMAIL, (a) => a !== KLAVIYO);
  return `EXISTS(SELECT 1 FROM UNNEST(technik) t WHERE LOWER(t) IN (${liste.join(', ')}))`;
}
