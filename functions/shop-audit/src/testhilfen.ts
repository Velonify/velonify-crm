import type { Seite } from './laden.js';

export const seite = (url: string, text: string, extra: Partial<Seite> = {}): Seite => ({ url, status: 200, ok: true, headers: {}, text, ...extra });
export const fehlt = (url: string, status = 404): Seite => ({ url, status, ok: false, headers: {}, text: '' });

/** Homepage of a fictional Magento 2 shop with Meta pixel, GA4 and no consent tool or e-mail tool. */
export const MAGENTO_HOME = `<!doctype html><html><head><title>Muster Shop – Gartenmöbel</title>
<link rel="canonical" href="https://muster-shop.example/">
<link rel="alternate" hreflang="de-DE" href="https://muster-shop.example/"><link rel="alternate" hreflang="en" href="https://muster-shop.example/en/">
<script src="https://muster-shop.example/static/version1690000000/frontend/Muster/default/de_DE/requirejs/require.js"></script>
<script type="text/x-magento-init">{}</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABCDEF1234"></script>
<script>!function(f,b,e,v,n,t,s){}(window, document,'script','https://connect.facebook.net/en_US/fbevents.js'); fbq('init', '123');</script>
</head><body><div class="g-recaptcha"></div><h1>Gartenmöbel</h1>
<a href="/tisch-eiche-120.html">Tisch Eiche</a><a href="/checkout/cart/">Warenkorb</a>
<footer>PayPal · Kauf auf Rechnung</footer></body></html>`;

export const PRODUKT_OHNE_MARKUP = `<html><body><h1>Tisch Eiche</h1><button id="product-addtocart-button">In den Warenkorb</button></body></html>`;
export const PRODUKT_MIT_MARKUP = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Tisch","aggregateRating":{"ratingValue":4.5}}</script></head><body>In den Warenkorb</body></html>`;
