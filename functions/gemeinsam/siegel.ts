import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Sealed values: JSON encrypted with AES-256-GCM, so codes, login links and sessions carry their own state and the
 * server needs no table for them. The kind is bound as additional data, so one kind can never be passed off as another.
 * Each function names its own kinds (`Art`) and the secret the key comes from.
 */
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class Siegel<Art extends string> {
  private readonly schluessel: Buffer;

  constructor(schluesselBase64: string, name: string) {
    this.schluessel = Buffer.from(schluesselBase64, 'base64');
    if (this.schluessel.length !== 32) throw new Error(`${name} muss 32 Byte (base64) lang sein.`);
  }

  versiegle(art: Art, inhalt: object): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.schluessel, iv);
    cipher.setAAD(Buffer.from(art));
    const daten = Buffer.concat([cipher.update(JSON.stringify(inhalt), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), daten]).toString('base64url');
  }

  /** The content, or null when the value is broken, forged or of another kind. */
  oeffne<T>(art: Art, wert: string): T | null {
    try {
      const roh = Buffer.from(wert, 'base64url');
      if (roh.length <= IV_BYTES + TAG_BYTES) return null;
      const decipher = createDecipheriv('aes-256-gcm', this.schluessel, roh.subarray(0, IV_BYTES));
      decipher.setAAD(Buffer.from(art));
      decipher.setAuthTag(roh.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      const klar = Buffer.concat([decipher.update(roh.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
      return JSON.parse(klar.toString('utf8')) as T;
    } catch {
      return null;
    }
  }
}
