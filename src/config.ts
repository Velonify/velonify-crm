const env = import.meta.env;

export const config = {
  googleClientId: env.VITE_GOOGLE_CLIENT_ID || '',
  spreadsheetId: env.VITE_SPREADSHEET_ID || '',
  allowedDomain: (env.VITE_ALLOWED_DOMAIN || 'velonify.de').toLowerCase(),
  /** Cloud Function of the Contact Generator */
  contactGeneratorUrl: env.VITE_CONTACT_GENERATOR_URL || '',
  /** Cloud Function of the shop audit */
  shopAuditUrl: env.VITE_SHOP_AUDIT_URL || '',
  /** Cloud Function crm-api in front of Postgres; when set, the data no longer comes from the sheet. */
  crmApiUrl: env.VITE_CRM_API_URL || '',
  /** Cloud Function kundenportal; with it the "Portal" tab can open the client's portal as a read-only preview. */
  kundenportalApiUrl: (env.VITE_KUNDENPORTAL_API_URL || '').replace(/\/$/, ''),
  /** The client portal itself */
  kundenportalUrl: (env.VITE_KUNDENPORTAL_URL || 'https://kunden.velonify.de').replace(/\/$/, ''),
};

/** Without a client ID and a data source (crm-api or sheet) the app runs on in-memory sample data. */
export const isDemo = !config.googleClientId || (!config.crmApiUrl && !config.spreadsheetId);

// Sheets for data, Drive for lead/client folders, Calendar for Meet appointments.
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar.events',
];

export const spreadsheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
