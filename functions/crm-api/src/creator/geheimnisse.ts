/**
 * Secrets of the instance that change at runtime, above all the OAuth tokens of the connected channels. They never go into
 * the database: kanal_konten only keeps the secret's name. In production Secret Manager of the instance's own project.
 */
export interface Geheimnisse {
  lesen(name: string): Promise<string | null>;
  /** Creates the secret if needed and adds a new version. */
  schreiben(name: string, wert: string): Promise<void>;
}

/** In memory: tests and the local preview. */
export function speicherGeheimnisse(start: Record<string, string> = {}): Geheimnisse {
  const werte = new Map(Object.entries(start));
  return {
    lesen: async (name) => werte.get(name) ?? null,
    schreiben: async (name, wert) => void werte.set(name, wert),
  };
}

/**
 * Secret Manager of the given project, signed in as the function's service account (metadata server).
 * TODO(Modul Analytics): implement with the REST API (secrets.create, secrets.addVersion, versions/latest:access);
 * the service account needs roles/secretmanager.admin on secrets with the prefix "kanal-" only (see INSTANZ.md).
 */
export function secretManagerGeheimnisse(projekt: string): Geheimnisse {
  const fehlt = () => Promise.reject(new Error(`Secret Manager für ${projekt} ist noch nicht angebunden.`));
  return { lesen: fehlt, schreiben: fehlt };
}
