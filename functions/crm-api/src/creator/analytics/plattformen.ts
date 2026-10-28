import type { Umgebung } from '../modul';
import { ApiFehler, formular, holeJson, plusTage, tag, type Holen, type OauthPlattform, type Plattform } from './gemeinsam';

/**
 * The official interfaces of the platforms (checked against the platforms' docs on 28.10.2026, see INSTANZ.md):
 * - YouTube: Google OAuth, YouTube Data API v3 and YouTube Analytics API v2 (youtube.readonly, yt-analytics.readonly).
 * - Instagram: Instagram API with Instagram Login (graph.instagram.com), long-lived token (60 days) with ig_refresh_token.
 * - TikTok: Login Kit for Web and Display API v2 (user.info.basic, user.info.stats, video.list); access 24 h, refresh 365 days.
 * - Twitch: OAuth authorization code flow and Helix (user:read:broadcast for stream markers, moderator:read:followers).
 * - Facebook Login only for Instagram Business Discovery (public numbers of other accounts), which Instagram Login lacks.
 * No crawlers, no passwords: the account owner signs in on the platform's own page.
 */

export interface Tokens {
  access_token: string;
  refresh_token?: string;
  /** ISO time the access token expires. */
  laeuft_ab?: string;
  refresh_laeuft_ab?: string;
  /** When the token was last issued or refreshed (Instagram may refresh only after 24 h). */
  erneuert_am?: string;
  scope?: string;
  /** Platform id the token belongs to (Instagram user_id, TikTok open_id, Twitch user id). */
  nutzer_id?: string;
}

export interface KanalProfil {
  extern_id: string;
  handle: string;
  name: string;
  bild?: string;
  url?: string;
}

export interface Konfig {
  clientId: string;
  clientSecret: string;
  graphVersion: string;
}

export interface VideoDaten {
  extern_id: string;
  url?: string;
  titel?: string;
  beschreibung?: string;
  veroeffentlicht_am?: string;
  dauer_s?: number | null;
  vorschaubild?: string;
  typ: 'video' | 'reel' | 'short' | 'beitrag' | 'stream';
  werte: {
    aufrufe?: number | null;
    likes?: number | null;
    kommentare?: number | null;
    shares?: number | null;
    saves?: number | null;
    reichweite?: number | null;
    wiedergabezeit_s?: number | null;
    durchschnitt_s?: number | null;
    abos_neu?: number | null;
  };
}

export interface TagesWerte {
  datum: string;
  follower?: number | null;
  aufrufe?: number | null;
  reichweite?: number | null;
  interaktionen?: number | null;
  likes?: number | null;
  beitraege?: number | null;
  wiedergabezeit_s?: number | null;
  follower_neu?: number | null;
}

export interface AbrufErgebnis {
  profil: KanalProfil;
  /** Values of today (stand: followers, posts, total likes). */
  heute: Omit<TagesWerte, 'datum'>;
  /** Daily values the platform reports for past days (YouTube Analytics, Instagram insights). */
  tage: TagesWerte[];
  videos: VideoDaten[];
  kommentare: { extern_id: string; video_extern_id: string; text: string; likes: number | null; am: string | null }[];
  marker?: { extern_id: string; video_extern_id: string; position_s: number; beschreibung: string; am: string | null }[];
  clips?: { extern_id: string; video_extern_id: string | null; vod_offset_s: number | null; dauer_s: number | null; titel: string; aufrufe: number; url: string; ersteller: string; am: string | null }[];
}

export interface Adapter {
  plattform: OauthPlattform;
  /** Environment variables with client id and secret. */
  env: [string, string];
  scopes: string[];
  autorisierung(k: Konfig, redirect: string, state: string): string;
  tausche(k: Konfig, code: string, redirect: string, holen: Holen, jetzt: Date): Promise<{ tokens: Tokens; profil: KanalProfil }>;
  /** New tokens when a refresh was due (or `erzwingen`), else null. */
  erneuere(k: Konfig, t: Tokens, holen: Holen, jetzt: Date, erzwingen?: boolean): Promise<Tokens | null>;
  abruf?(k: Konfig, t: Tokens, holen: Holen, jetzt: Date, bekannt: Set<string>): Promise<AbrufErgebnis>;
}

const ablauf = (jetzt: Date, sekunden: number | undefined) => (sekunden ? new Date(jetzt.getTime() + sekunden * 1000).toISOString() : undefined);
const bald = (iso: string | undefined, jetzt: Date, ms: number) => !iso || Date.parse(iso) - jetzt.getTime() < ms;
const n = (w: unknown): number | null => (w === undefined || w === null || w === '' ? null : Number.isFinite(Number(w)) ? Number(w) : null);

/** Client id and secret from the instance's environment; null names what is missing. */
export function konfigFuer(adapter: Adapter, umgebung: Umgebung): { konfig: Konfig | null; fehlt: string[] } {
  const [idName, geheimName] = adapter.env;
  const clientId = umgebung.wert(idName);
  const clientSecret = umgebung.wert(geheimName);
  const fehlt = [...(clientId ? [] : [idName]), ...(clientSecret ? [] : [geheimName]), ...(umgebung.apiUrl ? [] : ['CRM_API_URL']), ...(umgebung.hubUrl ? [] : ['HUB_URL'])];
  if (fehlt.length) return { konfig: null, fehlt };
  return { konfig: { clientId: clientId!, clientSecret: clientSecret!, graphVersion: umgebung.wert('META_GRAPH_VERSION') ?? 'v26.0' }, fehlt: [] };
}

export const rueckrufUrl = (umgebung: Umgebung, plattform: OauthPlattform) => `${umgebung.apiUrl}/oeffentlich/analytics/rueckruf/${plattform}`;

// ---------------------------------------------------------------- YouTube

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const YT = 'https://www.googleapis.com/youtube/v3';
const YTA = 'https://youtubeanalytics.googleapis.com/v2/reports';

/** ISO 8601 duration (PT1H2M3S) in seconds. */
export function isoDauer(wert: string | undefined): number | null {
  const t = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(wert ?? '');
  if (!t) return null;
  return Number(t[1] ?? 0) * 86400 + Number(t[2] ?? 0) * 3600 + Number(t[3] ?? 0) * 60 + Number(t[4] ?? 0);
}

interface YtKanal {
  id: string;
  snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } };
  statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string; hiddenSubscriberCount?: boolean };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

function ytProfil(k: YtKanal): KanalProfil {
  const handle = k.snippet?.customUrl ?? '';
  return {
    extern_id: k.id,
    handle: handle ? (handle.startsWith('@') ? handle : `@${handle}`) : (k.snippet?.title ?? ''),
    name: k.snippet?.title ?? '',
    bild: k.snippet?.thumbnails?.default?.url,
    url: handle ? `https://www.youtube.com/${handle.startsWith('@') ? handle : `@${handle}`}` : `https://www.youtube.com/channel/${k.id}`,
  };
}

const bearer = (t: Tokens) => ({ headers: { authorization: `Bearer ${t.access_token}` } });

/** Rows of a YouTube Analytics report as objects by column name. */
function ytZeilen(antwort: { columnHeaders?: { name: string }[]; rows?: unknown[][] }): Record<string, unknown>[] {
  const namen = (antwort.columnHeaders ?? []).map((c) => c.name);
  return (antwort.rows ?? []).map((r) => Object.fromEntries(namen.map((name, i) => [name, r[i]])));
}

/** Videos of a channel's uploads playlist with snippet, statistics and duration (Data API, API key or OAuth). */
export async function ytVideos(holen: Holen, uploads: string, auth: { key?: string; tokens?: Tokens }, max: number): Promise<VideoDaten[]> {
  const zugang = auth.key ? `&key=${encodeURIComponent(auth.key)}` : '';
  const init = auth.tokens ? bearer(auth.tokens) : {};
  const ids: string[] = [];
  let seite = '';
  while (ids.length < max) {
    const liste = await holeJson<{ items?: { contentDetails?: { videoId?: string } }[]; nextPageToken?: string }>(
      holen,
      `${YT}/playlistItems?part=contentDetails&maxResults=50&playlistId=${encodeURIComponent(uploads)}${seite ? `&pageToken=${seite}` : ''}${zugang}`,
      init,
      'YouTube',
    );
    ids.push(...(liste.items ?? []).map((i) => i.contentDetails?.videoId ?? '').filter(Boolean));
    if (!liste.nextPageToken) break;
    seite = liste.nextPageToken;
  }
  const videos: VideoDaten[] = [];
  for (let i = 0; i < Math.min(ids.length, max); i += 50) {
    const teil = ids.slice(i, Math.min(i + 50, max));
    const daten = await holeJson<{
      items?: {
        id: string;
        snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } }; liveBroadcastContent?: string };
        statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
        contentDetails?: { duration?: string };
        liveStreamingDetails?: unknown;
      }[];
    }>(holen, `${YT}/videos?part=snippet,statistics,contentDetails,liveStreamingDetails&id=${teil.join(',')}${zugang}`, init, 'YouTube');
    for (const v of daten.items ?? []) {
      const dauer = isoDauer(v.contentDetails?.duration);
      videos.push({
        extern_id: v.id,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        titel: v.snippet?.title,
        beschreibung: v.snippet?.description,
        veroeffentlicht_am: v.snippet?.publishedAt,
        dauer_s: dauer,
        vorschaubild: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url,
        // The Data API does not say whether a video is a Short; up to three minutes it is treated as one.
        typ: v.liveStreamingDetails ? 'stream' : dauer !== null && dauer <= 180 ? 'short' : 'video',
        werte: { aufrufe: n(v.statistics?.viewCount), likes: n(v.statistics?.likeCount), kommentare: n(v.statistics?.commentCount) },
      });
    }
  }
  return videos;
}

/** Public channel of a handle (@name) or channel id (UC…), with the API key. */
export async function ytKanalOeffentlich(holen: Holen, key: string, handle: string): Promise<YtKanal | null> {
  const wer = handle.trim();
  const filter = /^UC[\w-]{20,}$/.test(wer) ? `id=${encodeURIComponent(wer)}` : `forHandle=${encodeURIComponent(wer.startsWith('@') ? wer : `@${wer}`)}`;
  const daten = await holeJson<{ items?: YtKanal[] }>(holen, `${YT}/channels?part=snippet,statistics,contentDetails&${filter}&key=${encodeURIComponent(key)}`, {}, 'YouTube');
  return daten.items?.[0] ?? null;
}

export const youtube: Adapter = {
  plattform: 'youtube',
  env: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
  scopes: ['https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly'],
  autorisierung(k, redirect, state) {
    const p = new URLSearchParams({
      client_id: k.clientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: this.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${GOOGLE_AUTH}?${p}`;
  },
  async tausche(k, code, redirect, holen, jetzt) {
    const t = await holeJson<{ access_token: string; expires_in?: number; refresh_token?: string; scope?: string }>(
      holen,
      GOOGLE_TOKEN,
      formular({ code, client_id: k.clientId, client_secret: k.clientSecret, redirect_uri: redirect, grant_type: 'authorization_code' }),
      'Google',
    );
    const fehlend = this.scopes.filter((s) => t.scope && !t.scope.split(' ').includes(s));
    if (fehlend.length) throw new ApiFehler('Bitte beim Anmelden alle Häkchen setzen: der Hub braucht Lesezugriff auf YouTube und YouTube Analytics.', 400);
    const tokens: Tokens = { access_token: t.access_token, refresh_token: t.refresh_token, laeuft_ab: ablauf(jetzt, t.expires_in), erneuert_am: jetzt.toISOString(), scope: t.scope };
    const kanaele = await holeJson<{ items?: YtKanal[] }>(holen, `${YT}/channels?part=snippet,statistics,contentDetails&mine=true`, bearer(tokens), 'YouTube');
    const kanal = kanaele.items?.[0];
    if (!kanal) throw new ApiFehler('Dieses Google-Konto hat keinen YouTube-Kanal. Bitte mit dem Konto anmelden, dem der Kanal gehört (bei Brand-Accounts den Kanal in der Auswahl wählen).', 400);
    if (!tokens.refresh_token) throw new ApiFehler('Google hat keinen Refresh-Token geliefert. Bitte den Zugriff unter myaccount.google.com/permissions entfernen und erneut verbinden.', 400);
    return { tokens: { ...tokens, nutzer_id: kanal.id }, profil: ytProfil(kanal) };
  },
  async erneuere(k, t, holen, jetzt, erzwingen) {
    if (!erzwingen && !bald(t.laeuft_ab, jetzt, 5 * 60_000)) return null;
    if (!t.refresh_token) throw new ApiFehler('Kein Refresh-Token gespeichert. Bitte YouTube neu verbinden.', 401);
    const neu = await holeJson<{ access_token: string; expires_in?: number; refresh_token?: string }>(
      holen,
      GOOGLE_TOKEN,
      formular({ client_id: k.clientId, client_secret: k.clientSecret, refresh_token: t.refresh_token, grant_type: 'refresh_token' }),
      'Google',
    );
    return { ...t, access_token: neu.access_token, refresh_token: neu.refresh_token ?? t.refresh_token, laeuft_ab: ablauf(jetzt, neu.expires_in), erneuert_am: jetzt.toISOString() };
  },
  async abruf(_k, t, holen, jetzt, bekannt) {
    const kanaele = await holeJson<{ items?: YtKanal[] }>(holen, `${YT}/channels?part=snippet,statistics,contentDetails&mine=true`, bearer(t), 'YouTube');
    const kanal = kanaele.items?.[0];
    if (!kanal) throw new ApiFehler('Der Kanal ist über dieses Konto nicht mehr erreichbar.', 404);
    const uploads = kanal.contentDetails?.relatedPlaylists?.uploads;
    const videos = uploads ? await ytVideos(holen, uploads, { tokens: t }, 100) : [];
    const heute = tag(jetzt);
    const ab = plusTage(heute, -30);

    // Daily channel values of the last 30 days (Analytics data lag 2–3 days; later runs fill the gaps).
    const tageRoh = ytZeilen(
      await holeJson(
        holen,
        `${YTA}?ids=channel==MINE&startDate=${ab}&endDate=${heute}&dimensions=day&sort=day&metrics=views,estimatedMinutesWatched,likes,comments,shares,subscribersGained,subscribersLost`,
        bearer(t),
        'YouTube Analytics',
      ),
    );
    const tage: TagesWerte[] = tageRoh.map((z) => ({
      datum: String(z.day),
      aufrufe: n(z.views),
      wiedergabezeit_s: n(z.estimatedMinutesWatched) === null ? null : Math.round(Number(z.estimatedMinutesWatched) * 60),
      likes: n(z.likes),
      interaktionen: (n(z.likes) ?? 0) + (n(z.comments) ?? 0) + (n(z.shares) ?? 0),
      follower_neu: (n(z.subscribersGained) ?? 0) - (n(z.subscribersLost) ?? 0),
    }));

    // Lifetime values per video: watch time, average view duration, shares, new subscribers.
    if (videos.length) {
      const fruehestes = videos.reduce((min, v) => (v.veroeffentlicht_am && v.veroeffentlicht_am < min ? v.veroeffentlicht_am : min), `${heute}T00:00:00Z`).slice(0, 10);
      for (let i = 0; i < videos.length; i += 50) {
        const teil = videos.slice(i, i + 50);
        const zeilen = ytZeilen(
          await holeJson(
            holen,
            `${YTA}?ids=channel==MINE&startDate=${fruehestes}&endDate=${heute}&dimensions=video&filters=video==${teil.map((v) => v.extern_id).join(',')}&metrics=views,estimatedMinutesWatched,averageViewDuration,shares,subscribersGained&sort=-views&maxResults=200`,
            bearer(t),
            'YouTube Analytics',
          ),
        );
        for (const z of zeilen) {
          const v = teil.find((x) => x.extern_id === z.video);
          if (!v) continue;
          v.werte.wiedergabezeit_s = n(z.estimatedMinutesWatched) === null ? null : Math.round(Number(z.estimatedMinutesWatched) * 60);
          v.werte.durchschnitt_s = n(z.averageViewDuration);
          v.werte.shares = n(z.shares);
          v.werte.abos_neu = n(z.subscribersGained);
        }
      }
    }

    // Comments of new videos and of the last two weeks (1 quota unit each).
    const kommentare: AbrufErgebnis['kommentare'] = [];
    const grenze = Date.parse(plusTage(heute, -14));
    for (const v of videos.filter((x) => !bekannt.has(x.extern_id) || Date.parse(x.veroeffentlicht_am ?? '') >= grenze).slice(0, 30)) {
      try {
        const daten = await holeJson<{ items?: { id: string; snippet?: { topLevelComment?: { snippet?: { textOriginal?: string; textDisplay?: string; likeCount?: number; publishedAt?: string } } } }[] }>(
          holen,
          `${YT}/commentThreads?part=snippet&videoId=${v.extern_id}&maxResults=50&order=relevance&textFormat=plainText`,
          bearer(t),
          'YouTube',
        );
        for (const c of daten.items ?? []) {
          const s = c.snippet?.topLevelComment?.snippet;
          const textWert = s?.textOriginal ?? s?.textDisplay ?? '';
          if (textWert) kommentare.push({ extern_id: c.id, video_extern_id: v.extern_id, text: textWert, likes: n(s?.likeCount), am: s?.publishedAt ?? null });
        }
      } catch (err) {
        // Comments switched off for a video: 403 commentsDisabled. Nothing to collect then.
        if (!(err instanceof ApiFehler) || err.status !== 403) throw err;
      }
    }

    return {
      profil: ytProfil(kanal),
      heute: { follower: kanal.statistics?.hiddenSubscriberCount ? null : n(kanal.statistics?.subscriberCount), beitraege: n(kanal.statistics?.videoCount) },
      tage,
      videos,
      kommentare,
    };
  },
};

// ---------------------------------------------------------------- Instagram (Instagram Login)

const IG_AUTH = 'https://www.instagram.com/oauth/authorize';
const IG_TOKEN = 'https://api.instagram.com/oauth/access_token';
const IG_GRAPH = 'https://graph.instagram.com';
/** Account types of the Instagram API; only professional accounts have insights. */
const IG_PROFI = ['BUSINESS', 'MEDIA_CREATOR', 'CREATOR'];

interface IgIch {
  user_id?: string;
  id?: string;
  username?: string;
  name?: string;
  account_type?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
}

const igProfil = (ich: IgIch): KanalProfil => ({
  extern_id: String(ich.user_id ?? ich.id ?? ''),
  handle: ich.username ? `@${ich.username}` : '',
  name: ich.name || ich.username || '',
  bild: ich.profile_picture_url,
  url: ich.username ? `https://www.instagram.com/${ich.username}/` : undefined,
});

/** Value of an insights metric, whether it comes as `values` (period) or `total_value`. */
function igWert(daten: { data?: { name: string; values?: { value?: unknown }[]; total_value?: { value?: unknown } }[] }, name: string): number | null {
  const m = daten.data?.find((d) => d.name === name);
  if (!m) return null;
  return n(m.total_value?.value ?? m.values?.[m.values.length - 1]?.value);
}

export const instagram: Adapter = {
  plattform: 'instagram',
  env: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],
  // manage_comments: reading the comments below the own posts (Rohstoff für Recherche und Berichte).
  scopes: ['instagram_business_basic', 'instagram_business_manage_insights', 'instagram_business_manage_comments'],
  autorisierung(k, redirect, state) {
    const p = new URLSearchParams({ client_id: k.clientId, redirect_uri: redirect, response_type: 'code', scope: this.scopes.join(','), state });
    return `${IG_AUTH}?${p}`;
  },
  async tausche(k, code, redirect, holen, jetzt) {
    // Instagram appends "#_" to the code in the redirect.
    const kurz = await holeJson<{ access_token?: string; user_id?: string | number; data?: { access_token: string; user_id: string | number }[] }>(
      holen,
      IG_TOKEN,
      formular({ client_id: k.clientId, client_secret: k.clientSecret, grant_type: 'authorization_code', redirect_uri: redirect, code: code.replace(/#_$/, '') }),
      'Instagram',
    );
    const kurzToken = kurz.access_token ?? kurz.data?.[0]?.access_token;
    if (!kurzToken) throw new ApiFehler('Instagram hat kein Token geliefert.', 502);
    const lang = await holeJson<{ access_token: string; expires_in?: number }>(
      holen,
      `${IG_GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(k.clientSecret)}&access_token=${encodeURIComponent(kurzToken)}`,
      {},
      'Instagram',
    );
    const ich = await holeJson<IgIch>(
      holen,
      `${IG_GRAPH}/${k.graphVersion}/me?fields=user_id,username,name,account_type,profile_picture_url,followers_count,media_count&access_token=${encodeURIComponent(lang.access_token)}`,
      {},
      'Instagram',
    );
    if (ich.account_type && !IG_PROFI.includes(ich.account_type)) {
      throw new ApiFehler('Dieses Instagram-Konto ist kein Business- oder Creator-Konto. Bitte in der Instagram-App unter Einstellungen → Kontoart zu einem professionellen Konto wechseln und dann erneut verbinden.', 400);
    }
    const profil = igProfil(ich);
    return { tokens: { access_token: lang.access_token, laeuft_ab: ablauf(jetzt, lang.expires_in ?? 60 * 86400), erneuert_am: jetzt.toISOString(), nutzer_id: profil.extern_id, scope: this.scopes.join(',') }, profil };
  },
  async erneuere(_k, t, holen, jetzt, erzwingen) {
    // Refresh once the token is older than 24 h and less than 30 of its 60 days are left (or when forced after a 401).
    const alt = !t.erneuert_am || jetzt.getTime() - Date.parse(t.erneuert_am) > 24 * 3600_000;
    if (!alt || (!erzwingen && !bald(t.laeuft_ab, jetzt, 30 * 86400_000))) return null;
    if (t.laeuft_ab && Date.parse(t.laeuft_ab) < jetzt.getTime()) throw new ApiFehler('Der Instagram-Zugang ist abgelaufen. Bitte Instagram neu verbinden.', 401);
    const neu = await holeJson<{ access_token: string; expires_in?: number }>(
      holen,
      `${IG_GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(t.access_token)}`,
      {},
      'Instagram',
    );
    return { ...t, access_token: neu.access_token, laeuft_ab: ablauf(jetzt, neu.expires_in ?? 60 * 86400), erneuert_am: jetzt.toISOString() };
  },
  async abruf(k, t, holen, jetzt, bekannt) {
    const v = k.graphVersion;
    const token = `access_token=${encodeURIComponent(t.access_token)}`;
    const ich = await holeJson<IgIch>(holen, `${IG_GRAPH}/${v}/me?fields=user_id,username,name,account_type,profile_picture_url,followers_count,media_count&${token}`, {}, 'Instagram');
    const id = String(ich.user_id ?? t.nutzer_id ?? 'me');

    type Medium = { id: string; caption?: string; media_type?: string; media_product_type?: string; permalink?: string; timestamp?: string; thumbnail_url?: string; media_url?: string; like_count?: number; comments_count?: number };
    const medien: Medium[] = [];
    let naechste: string | undefined = `${IG_GRAPH}/${v}/${id}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url,like_count,comments_count&limit=50&${token}`;
    while (naechste && medien.length < 100) {
      const seite: { data?: Medium[]; paging?: { next?: string } } = await holeJson(holen, naechste, {}, 'Instagram');
      medien.push(...(seite.data ?? []));
      naechste = seite.paging?.next;
    }

    const heute = tag(jetzt);
    const grenze90 = Date.parse(plusTage(heute, -90));
    const videos: VideoDaten[] = [];
    for (const m of medien) {
      const reel = m.media_product_type === 'REELS';
      const video: VideoDaten = {
        extern_id: m.id,
        url: m.permalink,
        titel: (m.caption ?? '').split('\n')[0].slice(0, 200),
        beschreibung: m.caption,
        veroeffentlicht_am: m.timestamp,
        vorschaubild: m.thumbnail_url ?? (m.media_type === 'IMAGE' || m.media_type === 'CAROUSEL_ALBUM' ? m.media_url : undefined),
        typ: reel ? 'reel' : 'beitrag',
        werte: { likes: n(m.like_count), kommentare: n(m.comments_count) },
      };
      // Insights for new media and the last 90 days (older ones rarely change; saves calls).
      if (!bekannt.has(m.id) || Date.parse(m.timestamp ?? '') >= grenze90) {
        const metriken = ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions', ...(reel ? ['ig_reels_avg_watch_time', 'ig_reels_video_view_total_time'] : [])];
        try {
          const ins = await holeJson<Parameters<typeof igWert>[0]>(holen, `${IG_GRAPH}/${v}/${m.id}/insights?metric=${metriken.join(',')}&${token}`, {}, 'Instagram');
          video.werte = {
            aufrufe: igWert(ins, 'views'),
            reichweite: igWert(ins, 'reach'),
            likes: igWert(ins, 'likes') ?? video.werte.likes,
            kommentare: igWert(ins, 'comments') ?? video.werte.kommentare,
            saves: igWert(ins, 'saved'),
            shares: igWert(ins, 'shares'),
            // Reels report milliseconds.
            durchschnitt_s: reel && igWert(ins, 'ig_reels_avg_watch_time') !== null ? igWert(ins, 'ig_reels_avg_watch_time')! / 1000 : null,
            wiedergabezeit_s: reel && igWert(ins, 'ig_reels_video_view_total_time') !== null ? Math.round(igWert(ins, 'ig_reels_video_view_total_time')! / 1000) : null,
          };
        } catch (err) {
          // Media from before the switch to a professional account have no insights (400). Keep likes and comments.
          if (!(err instanceof ApiFehler) || err.status !== 400) throw err;
        }
      }
      videos.push(video);
    }

    // Account values: yesterday's totals and the daily reach of the last 28 days.
    const gestern = plusTage(heute, -1);
    const sek = (datum: string) => Math.floor(Date.parse(`${datum}T00:00:00Z`) / 1000);
    const tage: TagesWerte[] = [];
    const summen = await holeJson<Parameters<typeof igWert>[0]>(
      holen,
      `${IG_GRAPH}/${v}/${id}/insights?metric=views,reach,total_interactions,likes&period=day&metric_type=total_value&since=${sek(gestern)}&until=${sek(heute)}&${token}`,
      {},
      'Instagram',
    );
    tage.push({ datum: gestern, aufrufe: igWert(summen, 'views'), interaktionen: igWert(summen, 'total_interactions'), likes: igWert(summen, 'likes') });
    const reichweite = await holeJson<{ data?: { name: string; values?: { value?: unknown; end_time?: string }[] }[] }>(
      holen,
      `${IG_GRAPH}/${v}/${id}/insights?metric=reach&period=day&metric_type=time_series&since=${sek(plusTage(heute, -28))}&until=${sek(heute)}&${token}`,
      {},
      'Instagram',
    );
    for (const w of reichweite.data?.find((d) => d.name === 'reach')?.values ?? []) {
      // end_time is the end of the day (next midnight, Pacific time): the value belongs to the day before.
      const datum = w.end_time ? plusTage(w.end_time.slice(0, 10), -1) : null;
      if (!datum) continue;
      const vorhanden = tage.find((x) => x.datum === datum);
      if (vorhanden) vorhanden.reichweite = n(w.value);
      else tage.push({ datum, reichweite: n(w.value) });
    }

    // Comments of the last two weeks' media.
    const kommentare: AbrufErgebnis['kommentare'] = [];
    const grenze14 = Date.parse(plusTage(heute, -14));
    for (const m of medien.filter((x) => Date.parse(x.timestamp ?? '') >= grenze14 && (x.comments_count ?? 0) > 0).slice(0, 30)) {
      try {
        const daten = await holeJson<{ data?: { id: string; text?: string; timestamp?: string; like_count?: number }[] }>(
          holen,
          `${IG_GRAPH}/${v}/${m.id}/comments?fields=id,text,timestamp,like_count&limit=50&${token}`,
          {},
          'Instagram',
        );
        for (const c of daten.data ?? []) if (c.text) kommentare.push({ extern_id: c.id, video_extern_id: m.id, text: c.text, likes: n(c.like_count), am: c.timestamp ?? null });
      } catch (err) {
        // Without instagram_business_manage_comments (older connection) there are no comments: keep the rest.
        if (!(err instanceof ApiFehler) || (err.status !== 400 && err.status !== 403)) throw err;
      }
    }

    return { profil: igProfil(ich), heute: { follower: n(ich.followers_count), beitraege: n(ich.media_count) }, tage, videos, kommentare };
  },
};

// ---------------------------------------------------------------- TikTok (Login Kit + Display API)

const TT_AUTH = 'https://www.tiktok.com/v2/auth/authorize/';
const TT_TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';
const TT_API = 'https://open.tiktokapis.com/v2';
const TT_NUTZER_FELDER = 'open_id,union_id,avatar_url,display_name,follower_count,following_count,likes_count,video_count';
const TT_VIDEO_FELDER = 'id,title,video_description,create_time,cover_image_url,share_url,duration,view_count,like_count,comment_count,share_count';

interface TtNutzer {
  open_id: string;
  display_name?: string;
  avatar_url?: string;
  follower_count?: number;
  likes_count?: number;
  video_count?: number;
}

/** TikTok answers 200 with error.code != "ok" for API errors. */
function ttPruefe<T extends { error?: { code?: string; message?: string } }>(daten: T): T {
  if (daten.error && daten.error.code && daten.error.code !== 'ok') {
    throw new ApiFehler(`TikTok: ${daten.error.message || daten.error.code}`, daten.error.code === 'access_token_invalid' ? 401 : 400);
  }
  return daten;
}

async function ttTokens(holen: Holen, werte: Record<string, string>, jetzt: Date): Promise<Tokens> {
  const t = await holeJson<{ access_token?: string; expires_in?: number; open_id?: string; refresh_token?: string; refresh_expires_in?: number; scope?: string; error?: string; error_description?: string }>(
    holen,
    TT_TOKEN,
    formular(werte),
    'TikTok',
  );
  if (!t.access_token) throw new ApiFehler(`TikTok: ${t.error_description || t.error || 'kein Token'}`, 400);
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    laeuft_ab: ablauf(jetzt, t.expires_in),
    refresh_laeuft_ab: ablauf(jetzt, t.refresh_expires_in),
    erneuert_am: jetzt.toISOString(),
    scope: t.scope,
    nutzer_id: t.open_id,
  };
}

/** The display name is the only name in user.info.basic; the @handle comes from a video's share link. */
const ttHandleAus = (url: string | undefined) => /tiktok\.com\/(@[^/?#]+)/.exec(url ?? '')?.[1] ?? '';

export const tiktok: Adapter = {
  plattform: 'tiktok',
  env: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  scopes: ['user.info.basic', 'user.info.stats', 'video.list'],
  autorisierung(k, redirect, state) {
    const p = new URLSearchParams({ client_key: k.clientId, scope: this.scopes.join(','), response_type: 'code', redirect_uri: redirect, state });
    return `${TT_AUTH}?${p}`;
  },
  async tausche(k, code, redirect, holen, jetzt) {
    const tokens = await ttTokens(holen, { client_key: k.clientId, client_secret: k.clientSecret, code, grant_type: 'authorization_code', redirect_uri: redirect }, jetzt);
    const fehlend = this.scopes.filter((s) => tokens.scope && !tokens.scope.split(',').includes(s));
    if (fehlend.length) throw new ApiFehler(`Bitte beim Anmelden alle Berechtigungen bestätigen (fehlt: ${fehlend.join(', ')}).`, 400);
    const { data } = ttPruefe(await holeJson<{ data?: { user?: TtNutzer }; error?: { code?: string; message?: string } }>(holen, `${TT_API}/user/info/?fields=${TT_NUTZER_FELDER}`, bearer(tokens), 'TikTok'));
    const nutzer = data?.user;
    if (!nutzer) throw new ApiFehler('TikTok hat kein Profil geliefert.', 502);
    return { tokens, profil: { extern_id: nutzer.open_id, handle: nutzer.display_name ?? '', name: nutzer.display_name ?? '', bild: nutzer.avatar_url } };
  },
  async erneuere(k, t, holen, jetzt, erzwingen) {
    if (!erzwingen && !bald(t.laeuft_ab, jetzt, 10 * 60_000)) return null;
    if (!t.refresh_token || (t.refresh_laeuft_ab && Date.parse(t.refresh_laeuft_ab) < jetzt.getTime())) throw new ApiFehler('Der TikTok-Zugang ist abgelaufen. Bitte TikTok neu verbinden.', 401);
    const neu = await ttTokens(holen, { client_key: k.clientId, client_secret: k.clientSecret, grant_type: 'refresh_token', refresh_token: t.refresh_token }, jetzt);
    return { ...t, ...neu, nutzer_id: neu.nutzer_id ?? t.nutzer_id };
  },
  async abruf(_k, t, holen) {
    const { data } = ttPruefe(await holeJson<{ data?: { user?: TtNutzer }; error?: { code?: string; message?: string } }>(holen, `${TT_API}/user/info/?fields=${TT_NUTZER_FELDER}`, bearer(t), 'TikTok'));
    const nutzer = data?.user;
    if (!nutzer) throw new ApiFehler('TikTok hat kein Profil geliefert.', 502);
    type TtVideo = { id: string; title?: string; video_description?: string; create_time?: number; cover_image_url?: string; share_url?: string; duration?: number; view_count?: number; like_count?: number; comment_count?: number; share_count?: number };
    const videos: VideoDaten[] = [];
    let cursor: number | undefined;
    for (let seite = 0; seite < 5; seite++) {
      const antwort = ttPruefe(
        await holeJson<{ data?: { videos?: TtVideo[]; cursor?: number; has_more?: boolean }; error?: { code?: string; message?: string } }>(
          holen,
          `${TT_API}/video/list/?fields=${TT_VIDEO_FELDER}`,
          { method: 'POST', headers: { authorization: `Bearer ${t.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }) },
          'TikTok',
        ),
      );
      for (const v of antwort.data?.videos ?? []) {
        videos.push({
          extern_id: v.id,
          url: v.share_url,
          titel: (v.title || v.video_description || '').split('\n')[0].slice(0, 200),
          beschreibung: v.video_description,
          veroeffentlicht_am: v.create_time ? new Date(v.create_time * 1000).toISOString() : undefined,
          dauer_s: n(v.duration),
          vorschaubild: v.cover_image_url,
          typ: 'video',
          werte: { aufrufe: n(v.view_count), likes: n(v.like_count), kommentare: n(v.comment_count), shares: n(v.share_count) },
        });
      }
      if (!antwort.data?.has_more || !antwort.data.cursor) break;
      cursor = antwort.data.cursor;
    }
    const handle = ttHandleAus(videos.find((v) => v.url)?.url);
    return {
      profil: { extern_id: nutzer.open_id, handle: handle || nutzer.display_name || '', name: nutzer.display_name ?? '', bild: nutzer.avatar_url, url: handle ? `https://www.tiktok.com/${handle}` : undefined },
      heute: { follower: n(nutzer.follower_count), likes: n(nutzer.likes_count), beitraege: n(nutzer.video_count) },
      tage: [],
      videos,
      // The Display API has no comments.
      kommentare: [],
    };
  },
};

// ---------------------------------------------------------------- Twitch (Helix)

const TW_AUTH = 'https://id.twitch.tv/oauth2/authorize';
const TW_TOKEN = 'https://id.twitch.tv/oauth2/token';
const HELIX = 'https://api.twitch.tv/helix';

/** Twitch's VOD duration "3h2m1s" in seconds. */
export function twitchDauer(wert: string | undefined): number | null {
  const t = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(wert ?? '');
  if (!t || !wert) return null;
  return Number(t[1] ?? 0) * 3600 + Number(t[2] ?? 0) * 60 + Number(t[3] ?? 0);
}

async function twTokens(holen: Holen, werte: Record<string, string>, jetzt: Date): Promise<Tokens> {
  const t = await holeJson<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string[] }>(holen, TW_TOKEN, formular(werte), 'Twitch');
  return { access_token: t.access_token, refresh_token: t.refresh_token, laeuft_ab: ablauf(jetzt, t.expires_in), erneuert_am: jetzt.toISOString(), scope: (t.scope ?? []).join(' ') };
}

const helix = (k: Konfig, t: Tokens) => ({ headers: { authorization: `Bearer ${t.access_token}`, 'client-id': k.clientId } });

export const twitch: Adapter = {
  plattform: 'twitch',
  env: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'],
  scopes: ['user:read:broadcast', 'moderator:read:followers'],
  autorisierung(k, redirect, state) {
    const p = new URLSearchParams({ client_id: k.clientId, redirect_uri: redirect, response_type: 'code', scope: this.scopes.join(' '), state, force_verify: 'true' });
    return `${TW_AUTH}?${p}`;
  },
  async tausche(k, code, redirect, holen, jetzt) {
    const tokens = await twTokens(holen, { client_id: k.clientId, client_secret: k.clientSecret, code, grant_type: 'authorization_code', redirect_uri: redirect }, jetzt);
    const { data } = await holeJson<{ data?: { id: string; login: string; display_name?: string; profile_image_url?: string }[] }>(holen, `${HELIX}/users`, helix(k, tokens), 'Twitch');
    const u = data?.[0];
    if (!u) throw new ApiFehler('Twitch hat kein Profil geliefert.', 502);
    return { tokens: { ...tokens, nutzer_id: u.id }, profil: { extern_id: u.id, handle: u.login, name: u.display_name ?? u.login, bild: u.profile_image_url, url: `https://www.twitch.tv/${u.login}` } };
  },
  async erneuere(k, t, holen, jetzt, erzwingen) {
    if (!erzwingen && !bald(t.laeuft_ab, jetzt, 10 * 60_000)) return null;
    if (!t.refresh_token) throw new ApiFehler('Kein Refresh-Token gespeichert. Bitte Twitch neu verbinden.', 401);
    const neu = await twTokens(holen, { client_id: k.clientId, client_secret: k.clientSecret, grant_type: 'refresh_token', refresh_token: t.refresh_token }, jetzt);
    return { ...t, ...neu, refresh_token: neu.refresh_token ?? t.refresh_token };
  },
  async abruf(k, t, holen, jetzt, bekannt) {
    const h = helix(k, t);
    const { data: nutzer } = await holeJson<{ data?: { id: string; login: string; display_name?: string; profile_image_url?: string }[] }>(holen, `${HELIX}/users`, h, 'Twitch');
    const u = nutzer?.[0];
    if (!u) throw new ApiFehler('Twitch hat kein Profil geliefert.', 502);
    const folger = await holeJson<{ total?: number }>(holen, `${HELIX}/channels/followers?broadcaster_id=${u.id}&first=1`, h, 'Twitch');
    const vods = await holeJson<{
      data?: { id: string; stream_id?: string; title?: string; description?: string; created_at?: string; published_at?: string; url?: string; thumbnail_url?: string; view_count?: number; duration?: string }[];
    }>(holen, `${HELIX}/videos?user_id=${u.id}&type=archive&first=20`, h, 'Twitch');

    const videos: VideoDaten[] = (vods.data ?? []).map((v) => ({
      extern_id: v.id,
      url: v.url,
      titel: v.title,
      beschreibung: v.description,
      veroeffentlicht_am: v.created_at,
      dauer_s: twitchDauer(v.duration),
      vorschaubild: v.thumbnail_url ? v.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180') : undefined,
      typ: 'stream',
      werte: { aufrufe: n(v.view_count) },
    }));

    // Markers and viewer clips of new VODs and of the last week (clips keep coming in after the stream).
    const marker: NonNullable<AbrufErgebnis['marker']> = [];
    const clips: NonNullable<AbrufErgebnis['clips']> = [];
    const grenze = jetzt.getTime() - 7 * 86400_000;
    for (const v of videos.filter((x) => !bekannt.has(x.extern_id) || Date.parse(x.veroeffentlicht_am ?? '') >= grenze)) {
      try {
        const m = await holeJson<{ data?: { videos?: { video_id: string; markers?: { id: string; created_at?: string; description?: string; position_seconds: number }[] }[] }[] }>(
          holen,
          `${HELIX}/streams/markers?video_id=${v.extern_id}&first=100`,
          h,
          'Twitch',
        );
        for (const gruppe of m.data ?? [])
          for (const vid of gruppe.videos ?? [])
            for (const mk of vid.markers ?? []) marker.push({ extern_id: mk.id, video_extern_id: vid.video_id, position_s: mk.position_seconds, beschreibung: mk.description ?? '', am: mk.created_at ?? null });
      } catch (err) {
        // VODs without markers answer 404.
        if (!(err instanceof ApiFehler) || err.status !== 404) throw err;
      }
      const start = v.veroeffentlicht_am ? new Date(v.veroeffentlicht_am) : jetzt;
      const ende = new Date(Math.min(start.getTime() + ((v.dauer_s ?? 0) + 7 * 86400) * 1000, jetzt.getTime()));
      let nach = '';
      for (let seite = 0; seite < 5; seite++) {
        const c = await holeJson<{
          data?: { id: string; url: string; video_id?: string; vod_offset?: number | null; duration?: number; title?: string; view_count?: number; creator_name?: string; created_at?: string }[];
          pagination?: { cursor?: string };
        }>(holen, `${HELIX}/clips?broadcaster_id=${u.id}&started_at=${encodeURIComponent(start.toISOString())}&ended_at=${encodeURIComponent(ende.toISOString())}&first=100${nach ? `&after=${nach}` : ''}`, h, 'Twitch');
        for (const cl of c.data ?? []) {
          if (cl.video_id && cl.video_id !== v.extern_id) continue;
          if (clips.some((x) => x.extern_id === cl.id)) continue;
          clips.push({
            extern_id: cl.id,
            video_extern_id: cl.video_id || null,
            vod_offset_s: cl.vod_offset ?? null,
            dauer_s: n(cl.duration),
            titel: cl.title ?? '',
            aufrufe: cl.view_count ?? 0,
            url: cl.url,
            ersteller: cl.creator_name ?? '',
            am: cl.created_at ?? null,
          });
        }
        if (!c.pagination?.cursor) break;
        nach = c.pagination.cursor;
      }
    }

    return {
      profil: { extern_id: u.id, handle: u.login, name: u.display_name ?? u.login, bild: u.profile_image_url, url: `https://www.twitch.tv/${u.login}` },
      heute: { follower: n(folger.total), beitraege: videos.length },
      tage: [],
      videos,
      kommentare: [],
      marker,
      clips,
    };
  },
};

// ---------------------------------------------------------------- Facebook Login (Instagram Business Discovery)

const FB_DIALOG = 'https://www.facebook.com';
const FB_GRAPH = 'https://graph.facebook.com';

export const facebook: Adapter = {
  plattform: 'facebook',
  env: ['META_APP_ID', 'META_APP_SECRET'],
  scopes: ['instagram_basic', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement', 'business_management'],
  autorisierung(k, redirect, state) {
    const p = new URLSearchParams({ client_id: k.clientId, redirect_uri: redirect, state, response_type: 'code', scope: this.scopes.join(',') });
    return `${FB_DIALOG}/${k.graphVersion}/dialog/oauth?${p}`;
  },
  async tausche(k, code, redirect, holen, jetzt) {
    const kurz = await holeJson<{ access_token: string }>(
      holen,
      `${FB_GRAPH}/${k.graphVersion}/oauth/access_token?${new URLSearchParams({ client_id: k.clientId, client_secret: k.clientSecret, redirect_uri: redirect, code })}`,
      {},
      'Facebook',
    );
    const lang = await holeJson<{ access_token: string; expires_in?: number }>(
      holen,
      `${FB_GRAPH}/${k.graphVersion}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: k.clientId, client_secret: k.clientSecret, fb_exchange_token: kurz.access_token })}`,
      {},
      'Facebook',
    );
    const seiten = await holeJson<{ data?: { instagram_business_account?: { id: string; username?: string } }[] }>(
      holen,
      `${FB_GRAPH}/${k.graphVersion}/me/accounts?fields=instagram_business_account{id,username}&limit=100&access_token=${encodeURIComponent(lang.access_token)}`,
      {},
      'Facebook',
    );
    const ig = seiten.data?.find((s) => s.instagram_business_account)?.instagram_business_account;
    if (!ig) throw new ApiFehler('Mit diesem Facebook-Konto ist kein Instagram-Business- oder Creator-Konto über eine Facebook-Seite verknüpft. Business Discovery braucht diese Verknüpfung.', 400);
    return {
      tokens: { access_token: lang.access_token, laeuft_ab: ablauf(jetzt, lang.expires_in ?? 60 * 86400), erneuert_am: jetzt.toISOString(), nutzer_id: ig.id },
      profil: { extern_id: ig.id, handle: ig.username ? `@${ig.username}` : '', name: ig.username ?? '' },
    };
  },
  async erneuere(_k, t, _holen, jetzt) {
    // Long-lived Facebook user tokens cannot be refreshed without the person; after 60 days they connect again.
    if (t.laeuft_ab && Date.parse(t.laeuft_ab) < jetzt.getTime()) throw new ApiFehler('Der Facebook-Zugang fürs Instagram-Benchmarking ist abgelaufen. Bitte neu verbinden.', 401);
    return null;
  },
};

/** Public numbers of another Instagram professional account via Business Discovery. */
export async function igEntdecken(
  holen: Holen,
  k: Pick<Konfig, 'graphVersion'>,
  t: Tokens,
  handle: string,
): Promise<{ id: string; name: string; bild?: string; follower: number | null; beitraege: number | null; aufrufe_schnitt: number | null; interaktionen_schnitt: number | null }> {
  const name = handle.replace(/^@/, '').trim();
  const felder = `business_discovery.username(${name}){id,username,name,profile_picture_url,followers_count,media_count,media.limit(12){timestamp,like_count,comments_count,view_count}}`;
  const d = await holeJson<{
    business_discovery?: { id: string; username?: string; name?: string; profile_picture_url?: string; followers_count?: number; media_count?: number; media?: { data?: { like_count?: number; comments_count?: number; view_count?: number }[] } };
  }>(holen, `${FB_GRAPH}/${k.graphVersion}/${t.nutzer_id}?fields=${encodeURIComponent(felder)}&access_token=${encodeURIComponent(t.access_token)}`, {}, 'Instagram Business Discovery');
  const b = d.business_discovery;
  if (!b) throw new ApiFehler(`@${name} ist kein öffentliches Business- oder Creator-Konto.`, 404);
  const medien = b.media?.data ?? [];
  const mitAufrufen = medien.filter((m) => typeof m.view_count === 'number');
  return {
    id: b.id,
    name: b.name || b.username || name,
    bild: b.profile_picture_url,
    follower: n(b.followers_count),
    beitraege: n(b.media_count),
    aufrufe_schnitt: mitAufrufen.length ? Math.round(mitAufrufen.reduce((s, m) => s + (m.view_count ?? 0), 0) / mitAufrufen.length) : null,
    interaktionen_schnitt: medien.length ? Math.round(medien.reduce((s, m) => s + (m.like_count ?? 0) + (m.comments_count ?? 0), 0) / medien.length) : null,
  };
}

export const ADAPTER: Record<OauthPlattform, Adapter> = { youtube, instagram, tiktok, twitch, facebook };
export const adapterFuer = (p: Plattform | OauthPlattform) => ADAPTER[p];
