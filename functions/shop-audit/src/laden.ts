import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { Agent, fetch } from 'undici';

const USER_AGENT = 'Mozilla/5.0 (compatible; VelonifyShopAudit/1.0; +https://velonify.de)';
const ZEITLIMIT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;

export class DomainFehler extends Error {}

/**
 * Turns user input like "https://www.shop.example/de/" into a bare host name. Only public host names with a
 * letter TLD are accepted: no IPs, no localhost, no ports, so the function cannot be used to reach internal hosts.
 */
export function normalisiereDomain(eingabe: string): string {
  let host = eingabe.trim().toLowerCase();
  host = host.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0];
  if (host.includes('@') || host.includes(':')) throw new DomainFehler('Bitte nur die Domain angeben, ohne Port oder Zugangsdaten.');
  host = host.replace(/\.$/, '');
  if (isIP(host)) throw new DomainFehler('IP-Adressen werden nicht geprüft.');
  if (host.length > 253 || !/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) {
    throw new DomainFehler(`„${eingabe.trim().slice(0, 80)}“ ist keine gültige Domain.`);
  }
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) throw new DomainFehler('Interne Adressen werden nicht geprüft.');
  return host;
}

const GESPERRT = new BlockList();
for (const [netz, praefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  GESPERRT.addSubnet(netz, praefix, 'ipv4');
}
for (const [netz, praefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96]] as const) {
  GESPERRT.addSubnet(netz, praefix, 'ipv6');
}

/** True for addresses on the public internet; false for private, loopback, link-local (metadata server) and the like. */
export function istOeffentlich(adresse: string): boolean {
  const gemappt = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(adresse);
  if (gemappt) return istOeffentlich(gemappt[1]);
  const familie = isIP(adresse);
  if (familie === 0) return false;
  return !GESPERRT.check(adresse, familie === 4 ? 'ipv4' : 'ipv6');
}

/**
 * DNS lookup that refuses non-public addresses. It runs for every connection, redirects included, so a shop
 * redirecting to an internal address or a DNS name pointing at the metadata server is blocked.
 */
const sichererLookup = ((hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
  dnsLookup(hostname, { ...options, all: true }, (error, adressen: LookupAddress[]) => {
    if (error) return callback(error);
    const gesperrt = adressen.find((a) => !istOeffentlich(a.address));
    if (gesperrt || adressen.length === 0) return callback(Object.assign(new Error(`${hostname} zeigt auf keine öffentliche Adresse.`), { code: 'EACCES' }));
    if (options.all) return callback(null, adressen);
    return callback(null, adressen[0].address, adressen[0].family);
  });
}) as unknown as LookupFunction;

const agent = new Agent({ connect: { lookup: sichererLookup, timeout: ZEITLIMIT_MS } });

export interface Seite {
  url: string;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  text: string;
  /** Why the page could not be loaded, for "nicht geprüft". */
  fehler?: string;
}

async function lesen(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!body) return '';
  const reader = body.getReader();
  const teile: Uint8Array[] = [];
  let groesse = 0;
  while (groesse < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    teile.push(value);
    groesse += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(teile).subarray(0, MAX_BYTES));
}

/** Loads one page of the shop with a time and size limit. Never throws; failures come back as ok=false. */
export async function ladeSeite(url: string): Promise<Seite> {
  try {
    const antwort = await fetch(url, {
      dispatcher: agent,
      redirect: 'follow',
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'de-DE,de;q=0.9,en;q=0.7' },
    });
    const headers: Record<string, string> = {};
    antwort.headers.forEach((wert, name) => {
      headers[name.toLowerCase()] = wert;
    });
    const text = await lesen(antwort.body as ReadableStream<Uint8Array> | null);
    return { url: antwort.url || url, status: antwort.status, ok: antwort.ok, headers, text };
  } catch (error) {
    const grund = error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : String(error);
    return { url, status: 0, ok: false, headers: {}, text: '', fehler: grund.slice(0, 200) };
  }
}

export const leereSeite = (url: string, fehler: string): Seite => ({ url, status: 0, ok: false, headers: {}, text: '', fehler });
