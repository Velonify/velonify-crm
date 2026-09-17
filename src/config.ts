const env = import.meta.env;

export const config = {
  googleClientId: env.VITE_GOOGLE_CLIENT_ID || '',
  spreadsheetId: env.VITE_SPREADSHEET_ID || '',
  allowedDomain: (env.VITE_ALLOWED_DOMAIN || 'velonify.de').toLowerCase(),
  /** Cloud Function of the Contact Generator */
  contactGeneratorUrl: env.VITE_CONTACT_GENERATOR_URL || '',
};

/** Without a client ID and sheet ID the app runs on in-memory sample data. */
export const isDemo = !config.googleClientId || !config.spreadsheetId;

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
