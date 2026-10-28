/**
 * Rules of the content module shared by crm-api (functions/crm-api/src/creator/content.ts) and the hub: channels,
 * status chain, formats and the upload hygiene per platform (ad labelling, imprint, checklist). Pure TypeScript, no React.
 */

export const KANAELE = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'twitch', label: 'Twitch' },
] as const;
export type Kanal = (typeof KANAELE)[number]['id'];
export const istKanal = (wert: unknown): wert is Kanal => KANAELE.some((k) => k.id === wert);
export const kanalLabel = (id: string) => KANAELE.find((k) => k.id === id)?.label ?? id;

/** Status chain of the content plan, from idea to live. */
export const STATUS = [
  { id: 'idee', label: 'Idee' },
  { id: 'skript', label: 'Skript' },
  { id: 'dreh', label: 'Dreh' },
  { id: 'schnitt', label: 'Schnitt' },
  { id: 'upload', label: 'Upload' },
  { id: 'live', label: 'Live' },
] as const;
export type InhaltStatus = (typeof STATUS)[number]['id'];
export const istStatus = (wert: unknown): wert is InhaltStatus => STATUS.some((s) => s.id === wert);
export const statusLabel = (id: string) => STATUS.find((s) => s.id === id)?.label ?? id;

/** Suggestions for the format field; the field stays free text (plus the format list of the Merkmale). */
export const FORMATE: Record<Kanal, string[]> = {
  tiktok: ['Video', 'Foto-Karussell', 'Live'],
  instagram: ['Reel', 'Karussell', 'Beitrag', 'Story'],
  youtube: ['Longform', 'Short', 'Live'],
  twitch: ['Stream'],
};

export interface PlattformRegel {
  /** Label of the title field (YouTube title, stream title, cover text on TikTok/Instagram). */
  titelLabel: string;
  titelMax: number;
  /** Main text: the caption on TikTok/Instagram, the description on YouTube/Twitch. */
  text: 'caption' | 'beschreibung';
  textLabel: string;
  textMax: number;
  hashtagLabel: string;
  hashtagMax: number;
  /** Where the ad label goes. */
  kennzeichnungIn: ('titel' | 'text')[];
  /** The platform's own switch for paid partnerships, to set by hand when uploading. */
  schalter: string;
  /** Imprint: appended to the description, or linked in the profile (no clickable links in captions). */
  impressum: 'text' | 'profil';
}

export const PLATTFORM_REGELN: Record<Kanal, PlattformRegel> = {
  tiktok: {
    titelLabel: 'Cover-Text',
    titelMax: 80,
    text: 'caption',
    textLabel: 'Caption',
    textMax: 4000,
    hashtagLabel: 'Hashtags',
    hashtagMax: 8,
    kennzeichnungIn: ['text'],
    schalter: 'Beim Posten unter „Weitere Optionen“ die Offenlegung von Inhalten einschalten und „Markeninhalt“ wählen, damit TikTok „Bezahlte Partnerschaft“ anzeigt.',
    impressum: 'profil',
  },
  instagram: {
    titelLabel: 'Cover-Text',
    titelMax: 80,
    text: 'caption',
    textLabel: 'Caption',
    textMax: 2200,
    hashtagLabel: 'Hashtags',
    hashtagMax: 30,
    kennzeichnungIn: ['text'],
    schalter: 'Unter „Erweiterte Einstellungen“ das Label „Bezahlte Partnerschaft“ hinzufügen und die Marke als Partner markieren.',
    impressum: 'profil',
  },
  youtube: {
    titelLabel: 'Titel',
    titelMax: 100,
    text: 'beschreibung',
    textLabel: 'Beschreibung',
    textMax: 5000,
    hashtagLabel: 'Hashtags',
    hashtagMax: 15,
    kennzeichnungIn: ['titel', 'text'],
    schalter: 'In YouTube Studio unter „Details“ bei „Bezahlte Werbung“ das Häkchen „Mein Video enthält bezahlte Werbung“ setzen und die Werbung zu Beginn im Video ansagen.',
    impressum: 'text',
  },
  twitch: {
    titelLabel: 'Stream-Titel',
    titelMax: 140,
    text: 'beschreibung',
    textLabel: 'Info-Panel',
    textMax: 5000,
    hashtagLabel: 'Tags',
    hashtagMax: 10,
    kennzeichnungIn: ['titel'],
    schalter: 'Im Stream-Manager unter „Stream-Infos bearbeiten“ das Häkchen „Markeninhalt“ setzen.',
    impressum: 'text',
  },
};

/** Labels that count as a clear ad label in Germany ("Werbung" or "Anzeige" at the start, not hidden in hashtags). */
export const istKennzeichnung = (text: string) => /^\s*(werbung|anzeige)\b/i.test(text);
export const standardKennzeichnung = (marke: string) => (marke.trim() ? `Werbung | ${marke.trim()}` : 'Werbung');

/** Hashtags or search terms from free input ("#a, b c" → ["a", "b", "c"]), without duplicates. */
export function begriffe(eingabe: string | string[] | null | undefined, ohneRaute = true): string[] {
  const roh = Array.isArray(eingabe) ? eingabe.join(',') : (eingabe ?? '');
  const teile = roh
    .split(ohneRaute ? /[,\n\s]+/ : /[,\n]+/)
    .map((t) => (ohneRaute ? t.replace(/^#+/, '') : t).trim())
    .filter(Boolean);
  const gesehen = new Set<string>();
  return teile.filter((t) => {
    const k = t.toLocaleLowerCase('de');
    if (gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  });
}

/** Search terms keep their spaces ("japanisch lernen"), split only by comma or line. */
export const suchbegriffeVon = (eingabe: string | string[] | null | undefined) => begriffe(eingabe, false);

export interface UploadTexte {
  titel: string;
  caption: string;
  hashtags: string;
  beschreibung: string;
  suchbegriffe: string;
  kennzeichnung: string;
  abgehakt: Record<string, boolean>;
}

export interface UploadUmfeld {
  /** A cooperation with advertising is linked to the content. */
  werbung: boolean;
  impressumUrl: string;
  /** The imprint is linked in this platform's profile (setting of the module). */
  impressumImProfil: boolean;
}

/** The finished texts to paste into the platform: ad label and imprint are built in, never optional. */
export function fertigeTexte(plattform: Kanal, u: UploadTexte, umfeld: UploadUmfeld): { titel: string; text: string } {
  const regel = PLATTFORM_REGELN[plattform];
  const kennzeichnung = umfeld.werbung ? u.kennzeichnung.trim() : '';
  const tags = begriffe(u.hashtags);
  const titel = kennzeichnung && regel.kennzeichnungIn.includes('titel') ? `${kennzeichnung.split('|')[0].trim()} | ${u.titel.trim()}` : u.titel.trim();
  const haupt = (regel.text === 'caption' ? u.caption : u.beschreibung).trim();
  const teile: string[] = [];
  if (kennzeichnung && regel.kennzeichnungIn.includes('text')) teile.push(kennzeichnung);
  if (haupt) teile.push(haupt);
  if (tags.length && plattform !== 'twitch') teile.push(tags.map((t) => `#${t}`).join(' '));
  if (regel.impressum === 'text' && umfeld.impressumUrl) teile.push(`Impressum: ${umfeld.impressumUrl}`);
  return { titel, text: teile.join('\n\n') };
}

export interface CheckPunkt {
  id: 'titel' | 'text' | 'suchbegriffe' | 'hashtags' | 'kennzeichnung' | 'schalter' | 'impressum' | 'thumbnail';
  label: string;
  ok: boolean;
  hinweis: string;
  /** Ticked by hand in the hub (the platform's switch, the uploaded thumbnail). */
  manuell: boolean;
}

/** The checklist before the upload: title, caption, search terms, hashtags, ad label (+ switch), imprint, thumbnail. */
export function pruefeUpload(plattform: Kanal, u: UploadTexte, umfeld: UploadUmfeld): CheckPunkt[] {
  const regel = PLATTFORM_REGELN[plattform];
  const fertig = fertigeTexte(plattform, u, umfeld);
  const haupt = (regel.text === 'caption' ? u.caption : u.beschreibung).trim();
  const tags = begriffe(u.hashtags);
  const such = suchbegriffeVon(u.suchbegriffe);
  const imText = `${u.titel} ${haupt}`.toLocaleLowerCase('de');
  const gefunden = such.filter((s) => imText.includes(s.toLocaleLowerCase('de')));
  const punkte: CheckPunkt[] = [
    {
      id: 'titel',
      label: regel.titelLabel,
      ok: Boolean(u.titel.trim()) && fertig.titel.length <= regel.titelMax,
      hinweis: !u.titel.trim() ? 'fehlt' : fertig.titel.length > regel.titelMax ? `${fertig.titel.length} von höchstens ${regel.titelMax} Zeichen` : '',
      manuell: false,
    },
    {
      id: 'text',
      label: regel.textLabel,
      ok: Boolean(haupt) && fertig.text.length <= regel.textMax,
      hinweis: !haupt ? 'fehlt' : fertig.text.length > regel.textMax ? `${fertig.text.length} von höchstens ${regel.textMax} Zeichen` : '',
      manuell: false,
    },
    {
      id: 'suchbegriffe',
      label: 'Deutsche Suchbegriffe im Text',
      ok: gefunden.length > 0,
      hinweis: such.length === 0 ? 'keine Suchbegriffe eingetragen' : gefunden.length === 0 ? 'kein Suchbegriff steht im Titel oder Text' : `${gefunden.length} von ${such.length} im Text`,
      manuell: false,
    },
    {
      id: 'hashtags',
      label: regel.hashtagLabel,
      ok: tags.length > 0 && tags.length <= regel.hashtagMax,
      hinweis: tags.length === 0 ? 'fehlen' : tags.length > regel.hashtagMax ? `${tags.length}, höchstens ${regel.hashtagMax}` : `${tags.length}`,
      manuell: false,
    },
    {
      id: 'kennzeichnung',
      label: 'Werbekennzeichnung',
      ok: !umfeld.werbung || istKennzeichnung(u.kennzeichnung),
      hinweis: umfeld.werbung ? (istKennzeichnung(u.kennzeichnung) ? `„${u.kennzeichnung.trim()}“ steht am Anfang` : 'muss mit „Werbung“ oder „Anzeige“ beginnen') : 'keine Kooperation verknüpft, keine Kennzeichnung nötig',
      manuell: false,
    },
  ];
  if (umfeld.werbung) {
    punkte.push({ id: 'schalter', label: 'Schalter für bezahlte Partnerschaft', ok: Boolean(u.abgehakt.schalter), hinweis: regel.schalter, manuell: true });
  }
  punkte.push({
    id: 'impressum',
    label: 'Impressum-Link',
    ok: Boolean(umfeld.impressumUrl) && (regel.impressum === 'text' || umfeld.impressumImProfil),
    hinweis: !umfeld.impressumUrl
      ? 'Impressum-Link in den Upload-Einstellungen fehlt'
      : regel.impressum === 'text'
        ? 'steht am Ende des Textes'
        : umfeld.impressumImProfil
          ? 'im Profil verlinkt'
          : 'im Profil verlinken und in den Upload-Einstellungen bestätigen',
    manuell: false,
  });
  punkte.push({ id: 'thumbnail', label: plattform === 'youtube' ? 'Thumbnail hochgeladen' : 'Cover gewählt', ok: Boolean(u.abgehakt.thumbnail), hinweis: '', manuell: true });
  return punkte;
}
