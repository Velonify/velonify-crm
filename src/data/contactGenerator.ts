import { AuthExpiredError } from './errors';
import { kanalInfo, type GeneratorAnfrage, type Variante } from './anschreiben';

export interface GeneratorApi {
  generiere(anfrage: GeneratorAnfrage): Promise<Variante[]>;
}

/** Calls the Cloud Function with the Google token the app already holds; the function checks it and asks Claude. */
export class CloudGenerator implements GeneratorApi {
  constructor(
    private readonly url: string,
    private readonly getToken: () => Promise<string>,
  ) {}

  async generiere(anfrage: GeneratorAnfrage): Promise<Variante[]> {
    const token = await this.getToken();
    let antwort: Response;
    try {
      antwort = await fetch(this.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(anfrage),
      });
    } catch {
      throw new Error('Der Contact Generator ist gerade nicht erreichbar. Bitte Internetverbindung prüfen und erneut versuchen.');
    }
    const body = (await antwort.json().catch(() => null)) as { varianten?: Variante[]; fehler?: string } | null;
    if (antwort.status === 401 && /abgelaufen|nicht angemeldet/i.test(body?.fehler ?? '')) throw new AuthExpiredError();
    if (!antwort.ok || !body?.varianten) {
      throw new Error(body?.fehler ?? `Der Contact Generator hat mit Fehler ${antwort.status} geantwortet.`);
    }
    return body.varianten;
  }
}

/** Demo mode: fixed sample texts, no call to Claude. */
export class DemoGenerator implements GeneratorApi {
  async generiere(anfrage: GeneratorAnfrage): Promise<Variante[]> {
    await new Promise((resolve) => setTimeout(resolve, 900));
    const du = anfrage.anrede === 'du';
    const gruss = anfrage.kontakt?.vorname ? `${du ? 'Hi' : 'Hallo'} ${du ? anfrage.kontakt.vorname : `${anfrage.kontakt.vorname} ${anfrage.kontakt.nachname}`.trim()},` : du ? 'Hi zusammen,' : 'Guten Tag,';
    const ihr = du ? 'euer' : 'Ihr';
    const system = [anfrage.firma.plattform, anfrage.firma.version].filter(Boolean).join(' ');
    const kurz = kanalInfo(anfrage.kanal)?.zeichenLimit === 300;
    const texte = [
      `${gruss} ${ihr} Shop ${anfrage.firma.domain || anfrage.firma.name} ist mir aufgefallen${system ? ` – er läuft noch auf ${system}` : ''}. Wir helfen Händlern bei „${anfrage.leistung.titel}“. Passt ein kurzer Austausch?`,
      `${gruss} kurze Frage zu ${anfrage.firma.name}: Ist „${anfrage.leistung.titel}“ bei ${du ? 'euch' : 'Ihnen'} gerade ein Thema? ${anfrage.aufhaenger || 'Wir haben dazu ein paar konkrete Ideen.'}`,
      `${gruss} ich bin ${anfrage.absender.vorname} von Velonify. ${anfrage.leistung.nutzen || `Bei „${anfrage.leistung.titel}“ können wir ${du ? 'euch' : 'Sie'} entlasten.`} Wäre ein 15-minütiges Gespräch interessant?`,
    ];
    return texte.map((text, i) => ({
      betreff: anfrage.kanal === 'email' ? [`${anfrage.leistung.titel} für ${anfrage.firma.name}`, `Frage zu ${anfrage.firma.domain || anfrage.firma.name}`, 'Kurzer Gedanke zu Ihrem Shop'][i] : '',
      text: kurz ? text.slice(0, 300) : `${text}\n\n(Beispieltext aus dem Demo-Modus)`,
    }));
  }
}
