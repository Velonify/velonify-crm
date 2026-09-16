const env = import.meta.env;

export const config = {
  googleClientId: env.VITE_GOOGLE_CLIENT_ID || '',
  spreadsheetId: env.VITE_SPREADSHEET_ID || '',
  allowedDomain: (env.VITE_ALLOWED_DOMAIN || 'velonify.de').toLowerCase(),
};

/** Without a client ID and sheet ID the app runs on in-memory sample data. */
export const isDemo = !config.googleClientId || !config.spreadsheetId;

// Step 1 only needs Sheets. Drive and Calendar scopes are added with the Drive/Meet features.
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/spreadsheets',
];

export const spreadsheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
