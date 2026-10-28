import { useEffect, useState, type ReactNode } from 'react';
import { Card, Field, FormError, Loading } from '../../components/ui';
import { useToast } from '../../components/Toasts';
import { oeffentlich, useCreatorApi } from '../api';
import { RECHT_FELDER, type RechtDaten, type RechtFeld } from './typen';

/**
 * Legal pages of the instance, public under #/oeffentlich/datenschutz|impressum|nutzungsbedingungen (needed for the app
 * reviews of Google, Meta and TikTok). The details come from the Einrichtung (RechtKarte); the fixed parts describe what
 * the hub actually does. These are templates: they need a legal review before going live.
 */

function useRecht() {
  const [daten, setDaten] = useState<RechtDaten | null>(null);
  const [fehler, setFehler] = useState(false);
  useEffect(() => {
    oeffentlich<RechtDaten>('/oeffentlich/start/recht')
      .then(setDaten)
      .catch(() => setFehler(true));
  }, []);
  return { daten, fehler };
}

function Rahmen({ titel, children }: { titel: string; children: (d: RechtDaten) => ReactNode }) {
  const { daten, fehler } = useRecht();
  const hub = daten?.name ? `${daten.name} HUB` : 'Hub';
  useEffect(() => {
    document.title = `${titel} · ${hub}`;
  }, [titel, hub]);
  return (
    <div className="page narrow recht-seite">
      <p className="eyebrow-mark">{hub} · by Velonify</p>
      <h1>{titel}</h1>
      {fehler && <p className="alert error">Die Seite ist gerade nicht erreichbar.</p>}
      {!daten && !fehler && <Loading />}
      {daten && (
        <>
          {children(daten)}
          <p className="muted small">
            {daten.angaben.verantwortlicher ? '' : 'Die Angaben des Betreibers werden gerade ergänzt. '}
            {daten.stand && `Stand: ${new Date(`${daten.stand}T12:00:00Z`).toLocaleDateString('de-DE')}`}
          </p>
          <nav className="filters small" aria-label="Rechtliches">
            <a href="#/oeffentlich/impressum">Impressum</a>
            <a href="#/oeffentlich/datenschutz">Datenschutz</a>
            <a href="#/oeffentlich/nutzungsbedingungen">Nutzungsbedingungen</a>
          </nav>
        </>
      )}
    </div>
  );
}

const Mehrzeilig = ({ text }: { text: string }) => (
  <>
    {text.split('\n').map((z, i) => (
      <span key={i}>
        {z}
        <br />
      </span>
    ))}
  </>
);

function Betreiber({ a }: { a: RechtDaten['angaben'] }) {
  return (
    <p>
      {a.verantwortlicher || '–'}
      <br />
      {a.anschrift && <Mehrzeilig text={a.anschrift} />}
      {a.vertreten_durch && (
        <>
          Vertreten durch: {a.vertreten_durch}
          <br />
        </>
      )}
      {a.email && (
        <>
          E-Mail: <a href={`mailto:${a.email}`}>{a.email}</a>
          <br />
        </>
      )}
      {a.telefon && (
        <>
          Telefon: {a.telefon}
          <br />
        </>
      )}
    </p>
  );
}

const extern = (href: string, text: string) => (
  <a href={href} target="_blank" rel="noreferrer">
    {text}
  </a>
);

export function ImpressumSeite() {
  return (
    <Rahmen titel="Impressum">
      {({ angaben: a }) => (
        <>
          <h2>Angaben gemäß § 5 DDG</h2>
          <Betreiber a={a} />
          {a.register && <p>{a.register}</p>}
          {a.ust_id && <p>Umsatzsteuer-Identifikationsnummer: {a.ust_id}</p>}
          {a.inhaltlich && (
            <>
              <h2>Inhaltlich verantwortlich</h2>
              <p>
                <Mehrzeilig text={a.inhaltlich} />
              </p>
            </>
          )}
          <h2>Technische Umsetzung</h2>
          <p>Dieser Hub wird von Velonify im Auftrag des oben genannten Betreibers technisch bereitgestellt und betrieben.</p>
        </>
      )}
    </Rahmen>
  );
}

export function DatenschutzSeite() {
  return (
    <Rahmen titel="Datenschutzerklärung">
      {({ angaben: a, name }) => (
        <>
          <h2>1. Verantwortlicher</h2>
          <Betreiber a={a} />
          {a.datenschutz_kontakt && (
            <p>
              Kontakt für Datenschutzfragen: <Mehrzeilig text={a.datenschutz_kontakt} />
            </p>
          )}

          <h2>2. Wofür dieser Hub da ist</h2>
          <p>
            Der {name ? `${name} HUB` : 'Hub'} ist ein internes Arbeitswerkzeug des Teams: Aufgaben, Kalender, Content-Planung, Kooperationen und Auswertungen der eigenen Social-Media-Kanäle.
            Er ist nur für eingeladene Personen zugänglich. Öffentlich sind nur diese Rechtstexte und, wenn eingeschaltet, das Anfrageformular für Kooperationen, das Mediakit und
            freigegebene Kampagnenberichte für Partner.
          </p>

          <h2>3. Hosting und Auftragsverarbeitung</h2>
          <p>
            Der Hub läuft in einem eigenen Projekt bei Google Cloud (Rechenzentrum in Frankfurt am Main) mit eigener Datenbank. Velonify betreibt den Hub als Auftragsverarbeiter des
            Betreibers. Die Weboberfläche wird über GitHub Pages ausgeliefert. Dabei werden technisch notwendige Verbindungsdaten (z. B. IP-Adresse, Zeitpunkt) verarbeitet.
          </p>

          <h2>4. Anmeldung mit Google</h2>
          <p>
            Die Anmeldung erfolgt mit einem Google-Konto. Der Hub erhält dabei Name, E-Mail-Adresse und Profilbild und prüft, ob die Adresse eingeladen wurde. Für die Ablage in Google Drive
            fragt der Hub nur die Berechtigung „drive.file“ an: Er sieht ausschließlich Ordner und Dateien, die er selbst angelegt hat oder die ihm über die Google-Auswahl ausdrücklich
            freigegeben werden.
          </p>

          <h2>5. Anbindung der Social-Media-Kanäle</h2>
          <p>
            Wenn ein Admin einen Kanal verbindet, meldet er sich selbst bei der Plattform an und bestätigt den Zugriff. Der Hub erhält dafür einen Zugangsschlüssel, nie das Passwort. Die
            Schlüssel liegen im Secret Manager des Projekts, nicht in der Datenbank. Abgerufen werden Kennzahlen der eigenen Kanäle und Videos (z. B. Aufrufe, Likes, Kommentare, Shares,
            Wiedergabezeit) sowie, wo die Schnittstelle sie liefert, Kommentare unter den eigenen Videos. Beim Trennen eines Kanals löscht der Hub die Zugangsschlüssel sofort; bereits
            abgerufene Kennzahlen werden auf Anfrage gelöscht.
          </p>
          <ul>
            <li>
              <strong>YouTube:</strong> Der Hub nutzt die YouTube API Services. Es gelten die {extern('https://www.youtube.com/t/terms', 'Nutzungsbedingungen von YouTube')} und die{' '}
              {extern('https://policies.google.com/privacy', 'Datenschutzerklärung von Google')}. Den Zugriff könnt ihr jederzeit in den{' '}
              {extern('https://security.google.com/settings/security/permissions', 'Google-Sicherheitseinstellungen')} widerrufen.
            </li>
            <li>
              <strong>Instagram und Facebook (Meta):</strong> Zugriff über die Instagram API und, für Vergleiche mit anderen Creatorn, über Facebook Login.{' '}
              {extern('https://privacycenter.instagram.com/policy', 'Datenschutzrichtlinie von Meta')}.
            </li>
            <li>
              <strong>TikTok:</strong> Zugriff über Login Kit und Display API. {extern('https://www.tiktok.com/legal/page/eea/privacy-policy/de', 'Datenschutzrichtlinie von TikTok')}.
            </li>
            <li>
              <strong>Twitch:</strong> Zugriff über die Twitch API. {extern('https://www.twitch.tv/p/de-de/legal/privacy-notice/', 'Datenschutzhinweis von Twitch')}.
            </li>
          </ul>
          <p>Für Vergleiche mit anderen Creatorn nutzt der Hub nur öffentlich verfügbare Zahlen über offizielle Schnittstellen oder von Hand eingetragene Werte.</p>

          <h2>6. KI-Funktionen</h2>
          <p>
            Für Merkmale je Video, Berichte, Themenvorschläge und Textentwürfe sendet der Hub die dafür nötigen Inhalte (z. B. Titel, Beschreibungen, Kennzahlen, Kommentare) an Claude von
            Anthropic (Anthropic PBC, USA). Die Übermittlung in die USA erfolgt auf Grundlage der EU-Standardvertragsklauseln.
          </p>

          <h2>7. Anfrageformular, Mediakit und Partnerberichte</h2>
          <p>
            Wer das Anfrageformular nutzt, übermittelt die eingegebenen Angaben (Firma, Ansprechperson, E-Mail, Anfrage) an das Team; sie werden zur Bearbeitung der Anfrage gespeichert.
            Das Mediakit zeigt nur Kennzahlen der eigenen Kanäle. Partnerberichte sind nur über einen geheimen Link erreichbar.
          </p>

          <h2>8. Speicherdauer und eure Rechte</h2>
          <p>
            Daten werden gespeichert, solange sie für die Zusammenarbeit nötig sind, und danach gelöscht. Ihr habt das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
            Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das Recht, euch bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Wendet euch dafür an den oben genannten
            Verantwortlichen.
          </p>
        </>
      )}
    </Rahmen>
  );
}

export function NutzungsbedingungenSeite() {
  return (
    <Rahmen titel="Nutzungsbedingungen">
      {({ angaben: a, name }) => (
        <>
          <p>
            Diese Bedingungen gelten für die Nutzung des {name ? `${name} HUB` : 'Hubs'} von {a.verantwortlicher || 'dem Betreiber'}.
          </p>
          <h2>1. Zugang</h2>
          <p>Der Hub ist ein internes Werkzeug. Zugang haben nur Personen, die ein Admin eingeladen hat. Zugänge sind persönlich und dürfen nicht weitergegeben werden.</p>
          <h2>2. Verbundene Plattformen</h2>
          <p>
            Wer Kanäle von YouTube, Instagram, TikTok oder Twitch verbindet, muss dazu berechtigt sein. Für die Plattformen gelten zusätzlich deren eigene Bedingungen, bei YouTube die{' '}
            {extern('https://www.youtube.com/t/terms', 'Nutzungsbedingungen von YouTube')}. Die Verbindung lässt sich im Hub und in den Einstellungen der jeweiligen Plattform jederzeit
            trennen.
          </p>
          <h2>3. Inhalte und KI-Entwürfe</h2>
          <p>Entwürfe der KI-Funktionen sind Vorschläge. Das Team prüft sie vor jeder Veröffentlichung und ist für veröffentlichte Inhalte selbst verantwortlich.</p>
          <h2>4. Öffentliche Seiten</h2>
          <p>Anfrageformular und Mediakit dürfen nur für ernst gemeinte Kooperationsanfragen genutzt werden. Automatisierte Abfragen und Massenanfragen sind nicht erlaubt.</p>
          <h2>5. Verfügbarkeit und Änderungen</h2>
          <p>Der Betreiber kann Funktionen ändern, ergänzen oder abschalten. Es besteht kein Anspruch auf ununterbrochene Verfügbarkeit.</p>
        </>
      )}
    </Rahmen>
  );
}

/** Einrichtung: the operator's details for the legal pages (admins). */
export function RechtKarte() {
  const api = useCreatorApi();
  const { show } = useToast();
  const [angaben, setAngaben] = useState<Record<RechtFeld, string> | null>(null);
  const [fehler, setFehler] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .get<RechtDaten>('/c/start/recht')
      .then((d) => setAngaben(d.angaben))
      .catch(setFehler);
  }, [api]);

  const speichern = async () => {
    setBusy(true);
    setFehler(undefined);
    try {
      setAngaben((await api.post<RechtDaten>('/c/start/recht', { angaben })).angaben);
      show('Angaben gespeichert');
    } catch (err) {
      setFehler(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Impressum und Datenschutz">
      <p className="muted">
        Diese Angaben erscheinen auf den öffentlichen Seiten <a href="#/oeffentlich/impressum">Impressum</a>, <a href="#/oeffentlich/datenschutz">Datenschutz</a> und{' '}
        <a href="#/oeffentlich/nutzungsbedingungen">Nutzungsbedingungen</a>. Google, Meta und TikTok verlangen diese Links für die Freigabe der Kanal-Anbindung. Die Texte sind eine Vorlage
        und müssen vor dem Livegang juristisch geprüft werden.
      </p>
      {!angaben && !fehler && <Loading />}
      {angaben &&
        RECHT_FELDER.map((f) => (
          <Field key={f.id} label={f.label}>
            {f.mehrzeilig ? (
              <textarea rows={3} maxLength={f.max} value={angaben[f.id]} onChange={(e) => setAngaben((a) => a && { ...a, [f.id]: e.target.value })} />
            ) : (
              <input maxLength={f.max} value={angaben[f.id]} onChange={(e) => setAngaben((a) => a && { ...a, [f.id]: e.target.value })} />
            )}
          </Field>
        ))}
      <FormError error={fehler} />
      <div className="form-actions">
        <button type="button" className="button primary" disabled={busy || !angaben} onClick={() => void speichern()}>
          {busy ? 'Speichert …' : 'Speichern'}
        </button>
      </div>
    </Card>
  );
}
