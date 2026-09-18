import { describe, expect, it } from 'vitest';
import { istOeffentlich, normalisiereDomain } from './laden.js';

describe('normalisiereDomain', () => {
  it('strips protocol, path and trailing dot', () => {
    expect(normalisiereDomain(' https://www.Muster-Shop.example/de/?a=1 ')).toBe('www.muster-shop.example');
    expect(normalisiereDomain('muster-shop.example.')).toBe('muster-shop.example');
  });

  it('refuses IPs, ports, credentials and internal names', () => {
    for (const eingabe of ['127.0.0.1', 'http://169.254.169.254/', 'shop.example:8080', 'user@shop.example', 'localhost', 'metadata.google.internal', 'nas.local', 'ohne-punkt', '[::1]']) {
      expect(() => normalisiereDomain(eingabe), eingabe).toThrow();
    }
  });
});

describe('istOeffentlich', () => {
  it('blocks private, loopback, link-local and mapped addresses', () => {
    for (const a of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.20.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', 'kein-ip']) {
      expect(istOeffentlich(a), a).toBe(false);
    }
  });

  it('allows public addresses', () => {
    for (const a of ['8.8.8.8', '23.227.38.65', '2a00:1450:4001:80b::200e', '::ffff:8.8.8.8']) {
      expect(istOeffentlich(a), a).toBe(true);
    }
  });
});
