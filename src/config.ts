import { istProfil, type Profil } from './data/instanz';

const env = import.meta.env;

/**
 * The hub for tenants (app.velonify.de): the same app, built with VITE_MANDANTEN=1 and the tenants' own OAuth client.
 * Login with any whitelisted Google account, data in the tenant's own database, no Drive/Sheets/Calendar.
 */
export const mandantenModus = env.VITE_MANDANTEN === '1';
/**
 * An own instance (<kennung>.velonify.de): own project, database and crm-api, built with VITE_PROFIL. Login with any Google
 * account the instance's admins invited; tools and roles come from crm-api (/instanz/ich). See src/data/instanz.ts.
 */
export const profil: Profil | null = istProfil(env.VITE_PROFIL) ? env.VITE_PROFIL : null;
export const instanzModus = profil !== null;
/** Name of the instance for the login page, before crm-api can tell it (repo variable of the instance, never in this repo). */
export const instanzName = (env.VITE_INSTANZ_NAME || '').trim();
/** Sign-in with any Google account, without Drive, Sheets and Calendar: tenants and own instances. */
export const offenerLogin = mandantenModus || instanzModus;
const crmApi = (env.VITE_CRM_API_URL || '').replace(/\/$/, '');

export const config = {
  googleClientId: env.VITE_GOOGLE_CLIENT_ID || '',
  allowedDomain: (env.VITE_ALLOWED_DOMAIN || 'velonify.de').toLowerCase(),
  /** Cloud Function of the Contact Generator */
  // Tenants reach Claude only through crm-api, which checks their tool switches and counts the KI quota.
  contactGeneratorUrl: mandantenModus ? (crmApi ? `${crmApi}/ki/contact` : '') : env.VITE_CONTACT_GENERATOR_URL || '',
  /** Cloud Function of the shop audit */
  shopAuditUrl: mandantenModus ? (crmApi ? `${crmApi}/ki/audit` : '') : env.VITE_SHOP_AUDIT_URL || '',
  /** Cloud Function crm-api in front of Postgres: all hub data goes through it. */
  crmApiUrl: env.VITE_CRM_API_URL || '',
  /** Who sees the admin tool "Plattform" (crm-api checks again with its own ADMINS). */
  admins: (env.VITE_ADMINS || 'lukas@velonify.de,julian@velonify.de').split(',').map((a: string) => a.trim().toLowerCase()),
  /** Cloud Function kundenportal; with it the "Portal" tab can open the client's portal as a read-only preview. */
  kundenportalApiUrl: (env.VITE_KUNDENPORTAL_API_URL || '').replace(/\/$/, ''),
  /** The client portal itself */
  kundenportalUrl: (env.VITE_KUNDENPORTAL_URL || 'https://kunden.velonify.de').replace(/\/$/, ''),
};

/** Without a client ID and crm-api the app runs on in-memory sample data. */
export const isDemo = !config.googleClientId || !config.crmApiUrl;

// The data lives in Postgres behind crm-api; Google is still needed for:
// - Sheets: the calculation sheet of an offer (CrmService.legeKalkulationAn writes it with the Sheets API).
// - Drive (full): lead/client folders in the shared drive – search by name, list, move, upload. These folders were not
//   created by the app, so drive.file would not see them. Full drive would also cover the Sheets API; the spreadsheets
//   scope stays anyway until that has been tried live.
// - Calendar: Meet appointments.
export const GOOGLE_SCOPES = offenerLogin ? ['openid', 'email', 'profile', ...(instanzModus ? ['https://www.googleapis.com/auth/drive.file'] : [])] : [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar.events',
];
