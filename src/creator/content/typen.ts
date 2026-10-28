import type { InhaltStatus, Kanal, UploadTexte, UploadUmfeld, CheckPunkt } from './regeln';

export interface Inhalt {
  id: string; titel: string; kanal: Kanal; format: string; status: InhaltStatus; geplant_am: string;
  zustaendig: string; kooperation_id: string; video_id: string; quelle: string; quelle_id: string;
  notiz: string; archiviert: boolean; geaendert_am: string;
}
export interface VideoAuswahl { id: string; titel: string; plattform: string; url: string; beispiel: boolean; vorschaubild: string }
export interface ContentDaten { inhalte: Inhalt[]; videos: VideoAuswahl[]; team: string[]; kanaele: Kanal[] }
export interface Ton { beschreibung: string; beispiele: string; no_gos: string }
export interface Skript { id: string; inhalt_id: string; version: number; skript: string; titel: string[]; hooks: string[]; titel_wahl: string; hook_wahl: string; quelle: string; erstellt_am: string }
export interface Thumbnail { id: string; inhalt_id: string; bild: string; text: string; gesicht: string; farben: string; komposition: string; referenzen: string[]; hinweise: string; aufgabe_id: string; aufgabe_board_id: string }
export interface Vorschlag { id: string; titel: string; kanal: Kanal; format: string; begruendung: string; quellen: {id:string; text:string; beispiel?:boolean}[]; status: string; inhalt_id: string }
export interface RechercheDaten { vorschlaege: Vorschlag[]; laeufe: {id:string; woche:string; erstellt_am:string; quellen:{hinweise:string[]; beispiel?:boolean}}[] }
export interface UploadDaten { upload: UploadTexte; umfeld: UploadUmfeld; fertig: {titel:string; text:string}; pruefung: CheckPunkt[] }
export interface CaptionVorschlag { id:string; video_id:string; bisher:string; caption:string; hashtags:string; suchbegriffe:string; begruendung:string; status:string }
