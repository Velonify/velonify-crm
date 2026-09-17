import { ValidationError } from './errors';
import { inSprache, type KategorieMitLeistungen, type Sprache } from './katalog';
import type { Angebot, AngebotInput, Auswahl, AuswahlKategorie, AuswahlPosten, Leistung, Leistungskategorie } from './types';

export const ANGEBOT_STATUS = [
  { wert: 'entwurf', label: 'Entwurf' },
  { wert: 'kalkulation', label: 'In Kalkulation' },
  { wert: 'versendet', label: 'Versendet' },
  { wert: 'angenommen', label: 'Angenommen' },
  { wert: 'abgelehnt', label: 'Abgelehnt' },
] as const;

export const statusLabel = (status: string) => ANGEBOT_STATUS.find((s) => s.wert === status)?.label ?? status;

const NUMMER = /^(\d{4})\/(\d{2,})$/;

/** Next number in the "JJJJ/NN" sequence of the given year, e.g. "2026/49" after "2026/48". */
export function naechsteNummer(angebote: readonly Pick<Angebot, 'nummer'>[], jahr: number): string {
  const hoechste = angebote.reduce((max, a) => {
    const match = a.nummer.match(NUMMER);
    return match && Number(match[1]) === jahr ? Math.max(max, Number(match[2])) : max;
  }, 0);
  return `${jahr}/${String(hoechste + 1).padStart(2, '0')}`;
}

export const leereAuswahl = (): Auswahl => ({ kategorien: [] });

/** Reads the stored JSON; anything unreadable counts as an empty selection instead of breaking the page. */
export function parseAuswahl(json: string): Auswahl {
  try {
    const data = JSON.parse(json) as Partial<Auswahl>;
    return Array.isArray(data?.kategorien) ? { kategorien: data.kategorien } : leereAuswahl();
  } catch {
    return leereAuswahl();
  }
}

export const anzahlPosten = (auswahl: Auswahl) => auswahl.kategorien.reduce((n, k) => n + k.posten.length, 0);

const zufall = () => Math.random().toString(36).slice(2, 10);

function kopieKategorie(kategorie: Leistungskategorie, sprache: Sprache): AuswahlKategorie {
  return {
    schluessel: kategorie.id,
    kategorie_id: kategorie.id,
    titel: inSprache(kategorie, 'titel', sprache),
    umfang: inSprache(kategorie, 'umfang', sprache),
    abrechnung: kategorie.abrechnung || 'einmalig',
    optional: false,
    posten: [],
  };
}

function kopiePosten(leistung: Leistung, sprache: Sprache): AuswahlPosten {
  return { schluessel: leistung.id, leistung_id: leistung.id, titel: inSprache(leistung, 'titel', sprache), text: inSprache(leistung, 'text', sprache), notiz: '' };
}

/** Catalogue order for categories and items; own categories and manual items go to the end. */
function sortiere(auswahl: Auswahl, baum: readonly KategorieMitLeistungen[]): Auswahl {
  const kategorieIndex = new Map(baum.map((k, i) => [k.kategorie.id, i]));
  const leistungIndex = new Map(baum.flatMap((k) => k.leistungen.map((l, i) => [l.id, i] as const)));
  const pos = (map: Map<string, number>, key: string) => map.get(key) ?? Number.MAX_SAFE_INTEGER;
  return {
    kategorien: auswahl.kategorien
      .filter((k) => k.posten.length > 0)
      .map((k, i) => ({ k, i }))
      .sort((a, b) => pos(kategorieIndex, a.k.kategorie_id) - pos(kategorieIndex, b.k.kategorie_id) || a.i - b.i)
      .map(({ k }) => ({
        ...k,
        posten: k.posten
          .map((p, i) => ({ p, i }))
          .sort((a, b) => pos(leistungIndex, a.p.leistung_id) - pos(leistungIndex, b.p.leistung_id) || a.i - b.i)
          .map(({ p }) => p),
      })),
  };
}

export type KategorieStatus = 'keine' | 'teilweise' | 'alle';

/** Tri-state of a catalogue category's checkbox, counting only its catalogue items. */
export function kategorieStatus(auswahl: Auswahl, eintrag: KategorieMitLeistungen): KategorieStatus {
  const gewaehlt = auswahl.kategorien.find((k) => k.kategorie_id === eintrag.kategorie.id);
  const ids = new Set(gewaehlt?.posten.map((p) => p.leistung_id));
  const anzahl = eintrag.leistungen.filter((l) => ids.has(l.id)).length;
  if (anzahl === 0) return gewaehlt && gewaehlt.posten.length > 0 ? 'teilweise' : 'keine';
  return anzahl === eintrag.leistungen.length ? 'alle' : 'teilweise';
}

export function istGewaehlt(auswahl: Auswahl, leistung: Leistung): boolean {
  return auswahl.kategorien.some((k) => k.kategorie_id === leistung.kategorie_id && k.posten.some((p) => p.leistung_id === leistung.id));
}

function mitKategorie(auswahl: Auswahl, kategorie: Leistungskategorie, sprache: Sprache, aendern: (k: AuswahlKategorie) => AuswahlKategorie): Auswahl {
  const vorhanden = auswahl.kategorien.some((k) => k.kategorie_id === kategorie.id);
  const kategorien = vorhanden ? auswahl.kategorien : [...auswahl.kategorien, kopieKategorie(kategorie, sprache)];
  return { kategorien: kategorien.map((k) => (k.kategorie_id === kategorie.id ? aendern(k) : k)) };
}

/** Ticks or unticks one catalogue item. */
export function schalteLeistung(auswahl: Auswahl, baum: readonly KategorieMitLeistungen[], leistung: Leistung, sprache: Sprache): Auswahl {
  const eintrag = baum.find((k) => k.kategorie.id === leistung.kategorie_id);
  if (!eintrag) return auswahl;
  const naechste = mitKategorie(auswahl, eintrag.kategorie, sprache, (k) =>
    k.posten.some((p) => p.leistung_id === leistung.id)
      ? { ...k, posten: k.posten.filter((p) => p.leistung_id !== leistung.id) }
      : { ...k, posten: [...k.posten, kopiePosten(leistung, sprache)] },
  );
  return sortiere(naechste, baum);
}

/** Main category checkbox: selects every catalogue item, or – when all are selected – removes them (manual items stay). */
export function schalteKategorie(auswahl: Auswahl, baum: readonly KategorieMitLeistungen[], eintrag: KategorieMitLeistungen, sprache: Sprache): Auswahl {
  const alle = kategorieStatus(auswahl, eintrag) === 'alle';
  const naechste = mitKategorie(auswahl, eintrag.kategorie, sprache, (k) => {
    const manuell = k.posten.filter((p) => !p.leistung_id);
    if (alle) return { ...k, posten: manuell };
    const vorhanden = new Map(k.posten.filter((p) => p.leistung_id).map((p) => [p.leistung_id, p]));
    return { ...k, posten: [...eintrag.leistungen.map((l) => vorhanden.get(l.id) ?? kopiePosten(l, sprache)), ...manuell] };
  });
  return sortiere(naechste, baum);
}

export type ManuellZiel = { art: 'katalog'; kategorie: Leistungskategorie } | { art: 'auswahl'; schluessel: string } | { art: 'neu'; titel: string; abrechnung: string };

/** Adds an item typed in by hand to a catalogue category, an own category already in the offer, or a new own category. */
export function fuegeManuellHinzu(auswahl: Auswahl, baum: readonly KategorieMitLeistungen[], titel: string, ziel: ManuellZiel, sprache: Sprache): Auswahl {
  const text = titel.trim();
  if (!text) throw new ValidationError('manuell_titel', 'Bitte einen Unterpunkt eingeben.');
  const posten: AuswahlPosten = { schluessel: `manuell-${zufall()}`, leistung_id: '', titel: text, text: '', notiz: '' };

  if (ziel.art === 'katalog') {
    return sortiere(mitKategorie(auswahl, ziel.kategorie, sprache, (k) => ({ ...k, posten: [...k.posten, posten] })), baum);
  }
  if (ziel.art === 'auswahl') {
    if (!auswahl.kategorien.some((k) => k.schluessel === ziel.schluessel)) throw new ValidationError('manuell_kategorie', 'Bitte eine Hauptkategorie wählen.');
    return { kategorien: auswahl.kategorien.map((k) => (k.schluessel === ziel.schluessel ? { ...k, posten: [...k.posten, posten] } : k)) };
  }
  const name = ziel.titel.trim();
  if (!name) throw new ValidationError('manuell_neu', 'Bitte einen Namen für die neue Hauptkategorie eingeben.');
  const kategorie: AuswahlKategorie = { schluessel: `eigen-${zufall()}`, kategorie_id: '', titel: name, umfang: '', abrechnung: ziel.abrechnung, optional: false, posten: [posten] };
  return sortiere({ kategorien: [...auswahl.kategorien, kategorie] }, baum);
}

export function entfernePosten(auswahl: Auswahl, kategorieSchluessel: string, postenSchluessel: string): Auswahl {
  return {
    kategorien: auswahl.kategorien
      .map((k) => (k.schluessel === kategorieSchluessel ? { ...k, posten: k.posten.filter((p) => p.schluessel !== postenSchluessel) } : k))
      .filter((k) => k.posten.length > 0),
  };
}

export function aendereKategorie(auswahl: Auswahl, schluessel: string, changes: Partial<Pick<AuswahlKategorie, 'optional'>>): Auswahl {
  return { kategorien: auswahl.kategorien.map((k) => (k.schluessel === schluessel ? { ...k, ...changes } : k)) };
}

export function aenderePosten(auswahl: Auswahl, kategorieSchluessel: string, postenSchluessel: string, changes: Partial<Pick<AuswahlPosten, 'notiz' | 'titel'>>): Auswahl {
  return {
    kategorien: auswahl.kategorien.map((k) =>
      k.schluessel === kategorieSchluessel ? { ...k, posten: k.posten.map((p) => (p.schluessel === postenSchluessel ? { ...p, ...changes } : p)) } : k,
    ),
  };
}

/** After switching the language: catalogue texts are copied again in the new language; manual entries stay as typed. */
export function uebersetze(auswahl: Auswahl, baum: readonly KategorieMitLeistungen[], sprache: Sprache): Auswahl {
  const kategorien = new Map(baum.map((k) => [k.kategorie.id, k.kategorie]));
  const leistungen = new Map(baum.flatMap((k) => k.leistungen.map((l) => [l.id, l] as const)));
  return {
    kategorien: auswahl.kategorien.map((k) => {
      const kat = kategorien.get(k.kategorie_id);
      return {
        ...k,
        ...(kat && { titel: inSprache(kat, 'titel', sprache), umfang: inSprache(kat, 'umfang', sprache) }),
        posten: k.posten.map((p) => {
          const l = leistungen.get(p.leistung_id);
          return l ? { ...p, titel: inSprache(l, 'titel', sprache), text: inSprache(l, 'text', sprache) } : p;
        }),
      };
    }),
  };
}

export function prepareAngebot(input: AngebotInput, alle: readonly Angebot[], selfId?: string): AngebotInput {
  const clean: AngebotInput = {
    ...input,
    nummer: input.nummer.trim(),
    titel: input.titel.trim(),
    auswahl: { kategorien: input.auswahl.kategorien.filter((k) => k.posten.length > 0) },
  };
  if (!clean.firma_id) throw new ValidationError('firma_id', 'Bitte eine Firma wählen.');
  if (!NUMMER.test(clean.nummer)) throw new ValidationError('nummer', 'Angebotsnummer im Format JJJJ/NN, z. B. 2026/49.');
  if (!clean.titel) throw new ValidationError('titel', 'Bitte einen Titel angeben, z. B. „Shopify-Plus-Migration“.');
  if (clean.sprache !== 'de' && clean.sprache !== 'en') throw new ValidationError('sprache', 'Sprache: Deutsch oder Englisch.');
  if (anzahlPosten(clean.auswahl) === 0) throw new ValidationError('auswahl', 'Bitte mindestens eine Leistung auswählen.');
  const doppelt = alle.find((a) => a.id !== selfId && !a.archiviert && a.nummer === clean.nummer);
  if (doppelt) throw new ValidationError('nummer', `Die Nummer ${clean.nummer} ist schon vergeben („${doppelt.titel}“).`);
  return clean;
}
