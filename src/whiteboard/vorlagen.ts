import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform';

/**
 * Templates of the whiteboard: each one is a frame with ready shapes, connected by bound arrows, so moving a box keeps
 * its lines. They are skeletons (Excalidraw's own format for generated content) around 0/0; the board page moves them
 * to the middle of the view and lets Excalidraw give every element a fresh id, so a template can be placed twice.
 */

export interface Vorlage {
  id: string;
  name: string;
  beschreibung: string;
  elemente(): ExcalidrawElementSkeleton[];
}

/** Sticky colours: Excalidraw's light palette, readable with black text. */
export const STICKY_FARBEN = [
  { name: 'Gelb', wert: '#ffec99' },
  { name: 'Grün', wert: '#b2f2bb' },
  { name: 'Blau', wert: '#a5d8ff' },
  { name: 'Rosa', wert: '#fcc2d7' },
  { name: 'Orange', wert: '#ffd8a8' },
] as const;

const STICKY = 200;

/** A sticky note: a filled square with text bound to it, so it grows with the text and moves as one. */
export function sticky(x: number, y: number, farbe: string = STICKY_FARBEN[0].wert, text = ''): ExcalidrawElementSkeleton {
  return {
    type: 'rectangle',
    x,
    y,
    width: STICKY,
    height: STICKY,
    backgroundColor: farbe,
    fillStyle: 'solid',
    strokeColor: '#1e1e1e',
    strokeWidth: 1,
    roughness: 0,
    roundness: { type: 3 },
    customData: { sticky: true },
    label: { text, fontSize: 20, textAlign: 'left', verticalAlign: 'top' },
  } as ExcalidrawElementSkeleton;
}

type Form = 'rectangle' | 'ellipse' | 'diamond';
interface Rechteck {
  x: number;
  y: number;
  breite: number;
  hoehe: number;
}

/** Where the line from the middle of `r` towards (zx, zy) leaves the box, plus a small gap. */
function randPunkt(r: Rechteck, zx: number, zy: number, abstand = 8): { x: number; y: number } {
  const mx = r.x + r.breite / 2;
  const my = r.y + r.hoehe / 2;
  const dx = zx - mx;
  const dy = zy - my;
  if (dx === 0 && dy === 0) return { x: mx, y: my };
  const t = Math.min(dx === 0 ? Infinity : (r.breite / 2 + abstand) / Math.abs(dx), dy === 0 ? Infinity : (r.hoehe / 2 + abstand) / Math.abs(dy));
  return { x: mx + dx * t, y: my + dy * t };
}

/**
 * Builds one template: remembers where each box is, so arrows can be drawn from edge to edge. Excalidraw binds an arrow
 * to boxes given by id but does not place it, so the template does that; after that Excalidraw keeps it attached.
 */
class Bau {
  readonly elemente: ExcalidrawElementSkeleton[] = [];
  private readonly kaesten = new Map<string, Rechteck>();

  kasten(id: string, text: string, x: number, y: number, optionen: { form?: Form; breite?: number; hoehe?: number; farbe?: string } = {}): this {
    const breite = optionen.breite ?? 180;
    const hoehe = optionen.hoehe ?? 80;
    this.kaesten.set(id, { x, y, breite, hoehe });
    this.elemente.push({
      type: optionen.form ?? 'rectangle',
      id,
      x,
      y,
      width: breite,
      height: hoehe,
      backgroundColor: optionen.farbe ?? '#ffffff',
      fillStyle: 'solid',
      roughness: 0,
      roundness: optionen.form === 'diamond' ? null : { type: 3 },
      label: { text, fontSize: 18 },
    } as ExcalidrawElementSkeleton);
    return this;
  }

  sticky(id: string, x: number, y: number, farbe: string, text = ''): this {
    this.kaesten.set(id, { x, y, breite: STICKY, hoehe: STICKY });
    this.elemente.push({ ...sticky(x, y, farbe, text), id } as ExcalidrawElementSkeleton);
    return this;
  }

  pfeil(von: string, nach: string, text?: string, ohneSpitze = false): this {
    const a = this.kaesten.get(von);
    const b = this.kaesten.get(nach);
    if (!a || !b) throw new Error(`Vorlage: Kasten ${a ? nach : von} fehlt`);
    const start = randPunkt(a, b.x + b.breite / 2, b.y + b.hoehe / 2);
    const ende = randPunkt(b, a.x + a.breite / 2, a.y + a.hoehe / 2);
    this.elemente.push({
      type: 'arrow',
      id: `${von}>${nach}`,
      x: start.x,
      y: start.y,
      width: Math.abs(ende.x - start.x),
      height: Math.abs(ende.y - start.y),
      points: [
        [0, 0],
        [ende.x - start.x, ende.y - start.y],
      ],
      roughness: 0,
      start: { id: von },
      end: { id: nach },
      endArrowhead: ohneSpitze ? null : 'arrow',
      ...(text ? { label: { text, fontSize: 16 } } : {}),
    } as ExcalidrawElementSkeleton);
    return this;
  }

  rahmen(name: string, x: number, y: number, breite: number, hoehe: number): ExcalidrawElementSkeleton[] {
    const ids = this.elemente.map((k) => (k as { id?: string }).id).filter((id): id is string => Boolean(id));
    return [...this.elemente, { type: 'frame', name, x, y, width: breite, height: hoehe, children: ids } as ExcalidrawElementSkeleton];
  }
}

function mindmap(): ExcalidrawElementSkeleton[] {
  const aeste = ['Ziele', 'Zielgruppe', 'Kanäle', 'Inhalte', 'Budget', 'Zeitplan'];
  const bau = new Bau().kasten('mm-mitte', 'Thema', -110, -55, { form: 'ellipse', breite: 220, hoehe: 110, farbe: '#ffec99' });
  aeste.forEach((name, i) => {
    const winkel = (i / aeste.length) * Math.PI * 2 - Math.PI / 2;
    bau.kasten(`mm-${i}`, name, Math.cos(winkel) * 380 - 90, Math.sin(winkel) * 250 - 35, { breite: 180, hoehe: 70, farbe: '#a5d8ff' }).pfeil('mm-mitte', `mm-${i}`, undefined, true);
  });
  return bau.rahmen('Mindmap', -560, -400, 1120, 800);
}

function flowchart(): ExcalidrawElementSkeleton[] {
  return new Bau()
    .kasten('fc-start', 'Start', -90, -340, { form: 'ellipse', farbe: '#b2f2bb' })
    .kasten('fc-schritt', 'Schritt', -90, -200)
    .kasten('fc-frage', 'Entscheidung?', -110, -60, { form: 'diamond', breite: 220, hoehe: 120, farbe: '#ffec99' })
    .kasten('fc-ja', 'Weiter mit …', -340, 130)
    .kasten('fc-nein', 'Stattdessen …', 160, 130)
    .kasten('fc-ende', 'Ende', -90, 290, { form: 'ellipse', farbe: '#ffc9c9' })
    .pfeil('fc-start', 'fc-schritt')
    .pfeil('fc-schritt', 'fc-frage')
    .pfeil('fc-frage', 'fc-ja', 'Ja')
    .pfeil('fc-frage', 'fc-nein', 'Nein')
    .pfeil('fc-ja', 'fc-ende')
    .pfeil('fc-nein', 'fc-ende')
    .rahmen('Flowchart', -440, -420, 880, 840);
}

function userFlow(): ExcalidrawElementSkeleton[] {
  const schritte = ['Einstieg (Anzeige, Suche)', 'Startseite', 'Kategorie', 'Produktseite', 'Warenkorb', 'Checkout', 'Danke-Seite'];
  const bau = new Bau();
  schritte.forEach((name, i) => {
    const randschritt = i === 0 || i === schritte.length - 1;
    bau.kasten(`uf-${i}`, name, -880 + i * 250, -40, { breite: 200, hoehe: 90, farbe: randschritt ? '#b2f2bb' : '#ffffff' });
    if (i > 0) bau.pfeil(`uf-${i - 1}`, `uf-${i}`);
  });
  return bau
    .kasten('uf-abbruch', 'Abbruch', 370, 200, { breite: 200, hoehe: 80, farbe: '#ffc9c9' })
    .kasten('uf-erinnerung', 'Erinnerungs-Mail', 640, 200, { breite: 200, hoehe: 80, farbe: '#ffec99' })
    .pfeil('uf-5', 'uf-abbruch', 'verlässt')
    .pfeil('uf-abbruch', 'uf-erinnerung')
    .pfeil('uf-erinnerung', 'uf-4', 'kommt zurück')
    .sticky('uf-notiz', -880, 120, STICKY_FARBEN[3].wert, 'Wo springen die meisten ab?')
    .rahmen('User Flow', -940, -160, 1880, 520);
}

function sitemap(): ExcalidrawElementSkeleton[] {
  const ebene1 = [
    { name: 'Shop', kinder: ['Kategorien', 'Produkt', 'Suche'] },
    { name: 'Über uns', kinder: ['Team', 'Nachhaltigkeit'] },
    { name: 'Ratgeber', kinder: ['Artikel', 'FAQ'] },
    { name: 'Service', kinder: ['Kontakt', 'Versand', 'Retoure'] },
  ];
  const bau = new Bau().kasten('sm-home', 'Startseite', -100, -300, { breite: 200, farbe: '#ffec99' });
  ebene1.forEach((seite, i) => {
    const x = -760 + i * 400;
    bau.kasten(`sm-${i}`, seite.name, x, -120, { breite: 180, farbe: '#a5d8ff' }).pfeil('sm-home', `sm-${i}`, undefined, true);
    seite.kinder.forEach((kind, j) => {
      bau.kasten(`sm-${i}-${j}`, kind, x + 20, 40 + j * 110, { breite: 160, hoehe: 70 }).pfeil(j === 0 ? `sm-${i}` : `sm-${i}-${j - 1}`, `sm-${i}-${j}`, undefined, true);
    });
  });
  return bau.kasten('sm-rechtliches', 'Impressum · Datenschutz · AGB', 380, -300, { breite: 280, hoehe: 60, farbe: '#e9ecef' }).rahmen('Sitemap', -840, -380, 1680, 800);
}

function retro(): ExcalidrawElementSkeleton[] {
  const spalten = [
    { name: '1 Gut gelaufen', farbe: STICKY_FARBEN[1].wert },
    { name: '2 Besser machen', farbe: STICKY_FARBEN[3].wert },
    { name: '3 Ideen & nächste Schritte', farbe: STICKY_FARBEN[2].wert },
  ];
  return spalten.flatMap((spalte, i) => {
    const x = -780 + i * 540;
    return new Bau()
      .sticky(`rt-${i}-a`, x + 40, -160, spalte.farbe)
      .sticky(`rt-${i}-b`, x + 260, -160, spalte.farbe)
      .sticky(`rt-${i}-c`, x + 40, 70, spalte.farbe)
      .rahmen(spalte.name, x, -220, 500, 520);
  });
}

export const VORLAGEN: Vorlage[] = [
  { id: 'mindmap', name: 'Mindmap', beschreibung: 'Thema in der Mitte, sechs Äste zum Weiterdenken', elemente: mindmap },
  { id: 'flowchart', name: 'Flowchart', beschreibung: 'Start, Schritte, Entscheidung mit Ja/Nein, Ende', elemente: flowchart },
  { id: 'userflow', name: 'User Flow', beschreibung: 'Vom Einstieg bis zur Danke-Seite, mit Abbruch und Erinnerung', elemente: userFlow },
  { id: 'sitemap', name: 'Sitemap', beschreibung: 'Startseite, vier Bereiche mit Unterseiten, Rechtliches', elemente: sitemap },
  { id: 'retro', name: 'Workshop / Retro', beschreibung: 'Drei Frames mit Stickies: gut, besser, Ideen', elemente: retro },
];

export const vorlageFuer = (id: string) => VORLAGEN.find((v) => v.id === id);

/** Moves skeletons so their frame (or all of them) is centred on the given point. */
export function verschiebe(elemente: ExcalidrawElementSkeleton[], mitteX: number, mitteY: number): ExcalidrawElementSkeleton[] {
  const mitPosition = elemente.filter((e) => typeof (e as { width?: number }).width === 'number');
  if (mitPosition.length === 0) return elemente;
  const links = Math.min(...mitPosition.map((e) => e.x ?? 0));
  const oben = Math.min(...mitPosition.map((e) => e.y ?? 0));
  const rechts = Math.max(...mitPosition.map((e) => (e.x ?? 0) + ((e as { width?: number }).width ?? 0)));
  const unten = Math.max(...mitPosition.map((e) => (e.y ?? 0) + ((e as { height?: number }).height ?? 0)));
  const dx = mitteX - (links + rechts) / 2;
  const dy = mitteY - (oben + unten) / 2;
  return elemente.map((e) => ({ ...e, x: (e.x ?? 0) + dx, y: (e.y ?? 0) + dy }) as ExcalidrawElementSkeleton);
}
