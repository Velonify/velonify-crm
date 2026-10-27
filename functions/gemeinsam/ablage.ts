/** Images of the whiteboards in Cloud Storage, shared by crm-api (writes and reads) and kundenportal (reads). */

/** Where the images of the boards live: a private Cloud Storage bucket, in the tests a Map. */
export interface Ablage {
  schreibe(pfad: string, typ: string, inhalt: Buffer): Promise<void>;
  /** null when there is no such object. */
  lies(pfad: string): Promise<{ typ: string; inhalt: Buffer } | null>;
}

/** Cloud Storage over its JSON API with the function's own token (scope devstorage.read_write). */
export function cloudStorage(bucket: string, token: () => Promise<string>, fetchFn: typeof fetch = fetch): Ablage {
  const basis = 'https://storage.googleapis.com';
  return {
    async schreibe(pfad, typ, inhalt) {
      const antwort = await fetchFn(`${basis}/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(pfad)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': typ },
        body: new Uint8Array(inhalt),
      });
      if (!antwort.ok) throw new Error(`Cloud Storage hat das Bild abgelehnt (${antwort.status}).`);
    },
    async lies(pfad) {
      const antwort = await fetchFn(`${basis}/storage/v1/b/${bucket}/o/${encodeURIComponent(pfad)}?alt=media`, {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      if (antwort.status === 404) return null;
      if (!antwort.ok) throw new Error(`Cloud Storage hat mit ${antwort.status} geantwortet.`);
      return { typ: antwort.headers.get('content-type') ?? 'application/octet-stream', inhalt: Buffer.from(await antwort.arrayBuffer()) };
    },
  };
}

/** For local runs without a bucket: images only in memory. */
export function speicherAblage(): Ablage & { objekte: Map<string, { typ: string; inhalt: Buffer }> } {
  const objekte = new Map<string, { typ: string; inhalt: Buffer }>();
  return {
    objekte,
    async schreibe(pfad, typ, inhalt) {
      objekte.set(pfad, { typ, inhalt });
    },
    async lies(pfad) {
      return objekte.get(pfad) ?? null;
    },
  };
}
