/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_SPREADSHEET_ID?: string;
  readonly VITE_ALLOWED_DOMAIN?: string;
  readonly VITE_CONTACT_GENERATOR_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
