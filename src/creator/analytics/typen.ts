/** Mirrors functions/crm-api/src/creator/analytics/* (the frontend does not import function code). */
export interface Konto {
  id: string;
  plattform: string;
  handle: string;
  name: string;
  url: string;
  status: 'beispiel' | 'verbunden' | 'fehler' | 'getrennt';
  beispiel: boolean;
  letzte_abholung: string | null;
  fehler: string | null;
  token_bis: string | null;
  datum: string;
  follower: number | null;
  aufrufe: number | null;
  reichweite: number | null;
}

export interface Video {
  id: string;
  konto_id: string;
  plattform: string;
  titel: string;
  url: string;
  veroeffentlicht_am: string;
  vorschaubild: string;
  typ: string;
  beispiel: boolean;
  thema: string;
  format: string;
  hook: string;
  bestaetigt: boolean;
  aufrufe: number | null;
  likes: number | null;
  kommentare: number | null;
  shares: number | null;
  saves: number | null;
  wiedergabezeit_s: number | null;
  durchschnitt_s: number | null;
  interaktionsrate: number | null;
  stand: string;
}

export interface Vergleich {
  art: 'thema' | 'format' | 'hook';
  wert: string;
  anzahl: number;
  bestaetigt: number;
  median_aufrufe: number | null;
  interaktionsrate: number | null;
}

export interface Ableitung {
  titel: string;
  kanal: string;
  format: string;
  begruendung: string;
  inhalt_id?: string;
}

export interface Bericht {
  id: string;
  typ: 'woche' | 'monat';
  von: string;
  bis: string;
  inhalt: {
    text?: string;
    hinweis?: string;
    kanaele?: { plattform: string; handle: string; follower: number | null; follower_delta: number | null; aufrufe: number | null; videos: number }[];
    tops?: Video[];
    flops?: Video[];
    merkmale?: Vergleich[];
  };
  ableitungen: Ableitung[];
  einschaetzung: string | null;
  status: 'entwurf' | 'freigegeben';
  beispiel: boolean;
  freigegeben_von: string | null;
}

export const PLATTFORM_LABEL: Record<string, string> = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', twitch: 'Twitch', facebook: 'Facebook (Instagram-Vergleiche)' };

export const zahlText = (w: number | null | undefined) => (w === null || w === undefined ? '–' : new Intl.NumberFormat('de-DE', { notation: w >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(w));
export const prozent = (w: number | null | undefined) => (w === null || w === undefined ? '–' : `${(w * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`);
export const datum = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–');
