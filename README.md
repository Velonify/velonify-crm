# Velonify intern

Interne Company Page: Startseite mit Schnellzugriff, dazu das CRM für Leads, Vertrieb, Angebote und Kundenakte, Shop-Audit, Lead-Finder und Social Media. Zwischen den Werkzeugen wechselt man über den Umschalter unter dem Logo; die Seitenleiste zeigt nur die Seiten des geöffneten Werkzeugs. Neue Werkzeuge werden in `src/werkzeuge.ts` eingetragen.

- **Oberfläche:** React-App auf GitHub Pages
- **Daten:** Postgres auf Cloud SQL (Datenbank `crm` auf `velonify-db`), erreichbar über die Cloud Function `crm-api` (`functions/crm-api`). Bis 15.10.2026 lagen die Daten in einem Google Sheet; das ist abgelöst. **Keine Kundendaten in diesem Repo.**
- **Login:** Google-Konto mit `@velonify.de`. `crm-api` prüft das Google-Token der Person; Drive (Kundenordner), Sheets (Kalkulationen zu Angeboten) und Kalender laufen weiter direkt mit dem Konto der angemeldeten Person.

Ohne Google-Client-ID oder ohne `CRM_API_URL` startet die App im **Demo-Modus** mit erfundenen Beispieldaten.

## Funktionen

| Bereich | Was es kann |
|---|---|
| **Startseite** | Unter **Home**: Kacheln für die Werkzeuge (CRM mit heutigen und überfälligen Aufgaben und Pipeline-Wert), „Heute dran“, Kunden und offene Angebote mit Links zu Drive und Slack, firmenweite Links (unter Einrichtung gepflegt) und ein Generator für Dateinamen nach dem Schema `YYYY-MM-DD_KÜRZEL_thema_v01`. Das CRM liegt unter `/#/crm`, alte Adressen wie `/#/firmen/…` leiten weiter. |
| **Suche** | Überall mit `⌘K` / `Strg+K` oder über die Seitenleiste: Firmen, Kontakte und Deals nach Name, Domain, Kürzel, E-Mail, Telefon oder Ort. Umlaute egal („muenchen“ findet „München“), Pfeiltasten + Enter öffnen die Firmenakte. |
| **Mein Tag** | Überfällige und heutige Wiedervorlagen und Deal-Schritte, nächste 7 Tage, Deals ohne nächsten Schritt, Kennzahlen (Pipeline-Wert, gewichtet, Angebote, gewonnen im Monat). Umschaltbar zwischen „Meine“ und „Alle“. |
| **Pipeline** | Kanban nach Phase (Neu → Qualifiziert → Kontaktiert → Gespräch → Angebot → Gewonnen/Verloren), Drag & Drop, Summen je Spalte, Filter nach Zuständigem. |
| **Firmen** | Liste mit Suche (auch nach Kontakten), Filtern, Deal-Phase; Anlegen, Bearbeiten, Archivieren. Doppelte Domains und Kürzel werden abgelehnt. |
| **Firmenakte** | Deals mit Angebotswert und nächstem Schritt, Kontakte, Wiedervorlagen, Verlauf (Notiz/Anruf/Mail/Meeting), Google-Drive-Ordner, Termine. |
| **Automatik beim Phasenwechsel** | *Qualifiziert*: Kürzel vorschlagen und Lead-Ordner in `02_Sales/01_Leads` anlegen · *Angebot*: Ordner nach `01_Clients` verschieben und Unterordner aus der Vorlage ergänzen · *Gewonnen*: Firma wird Kunde · *Verloren*: Grund wird abgefragt. Jeder Wechsel landet im Verlauf. |
| **Termine** | Termin mit Google-Meet-Link direkt beim Kontakt planen, Einladung optional per Mail; Termine mit Kontakten der Firma aus dem eigenen Kalender. |
| **Dubletten-Warnung** | Gleiche USt-ID, Handelsregisternummer (gleiches Amtsgericht), gleicher Name ohne Rechtsform oder gleiche E-Mail-/Web-Domain (ohne Freemailer) gelten als mögliche Dublette: Warnung vor dem Speichern, Hinweis in der Firmenakte, Filter „Mögliche Dubletten“ in der Firmenliste. |
| **Social Media** | Der 90-Tage-Plan im Hub statt im Dokument: **Redaktionsplan** nach Kalenderwochen mit Häkchen je Termin, **Inhalte** (Karussells, Reels, Einzelbilder, Stories mit Hook, Slides, Caption, Hashtags und Alt-Text, direkt auf der Detailseite bearbeitbar), **Aufgaben** aus „Erste Woche“ und „Was fehlt“ zum Abhaken, **Messung** mit eigenem Median und den Schwellen zum Aussortieren oder Verdoppeln, **Strategie** mit den Kapiteln und der Hook-Bibliothek. Dazu ein UTM-Link-Generator und „DM erfassen“, das die Nachricht auf Wunsch gleich in den Anfragen-Eingang legt. Beim ersten Öffnen übernimmt ein Klick den kompletten Startplan. |
| **Import** | CSV aus dem Magento-Lead-Qualifier: Vorschau, Tier-Filter, Dubletten per Domain; mögliche Dubletten unter anderer Domain werden markiert und standardmäßig nicht importiert. Neue Firmen bekommen Kontakt und Deal; vorhandene werden nie überschrieben, nur leere Felder ergänzt. |

## Einrichtung (einmalig)

### 1. Google Cloud: OAuth-Client anlegen

1. [console.cloud.google.com](https://console.cloud.google.com) mit dem velonify.de-Konto öffnen und ein Projekt **velonify-crm** anlegen (Organisation: velonify.de).
2. **APIs & Dienste → Bibliothek:** **Google Drive API**, **Google Sheets API** (Kalkulations-Sheets der Angebote) und **Google Calendar API** aktivieren.
3. **Google Auth Platform → Branding / Zielgruppe:** App-Name „Velonify CRM“, Zielgruppe **Intern**. Damit können sich nur velonify.de-Konten anmelden, und Google muss die App nicht prüfen.
4. **Google Auth Platform → Clients → Client erstellen:** Typ **Webanwendung**, Name „Velonify CRM“.
   Unter **Autorisierte JavaScript-Quellen** eintragen:
   - `http://localhost:5173`
   - `https://velonify.github.io`
   - `https://crm.velonify.de`

   Weiterleitungs-URIs werden nicht gebraucht.
5. Die **Client-ID** kopieren (endet auf `.apps.googleusercontent.com`). Sie ist nicht geheim, ein Client-Secret wird nicht verwendet.

### 2. Datenbank und crm-api

Datenbank, Migrationen (`db/migrationen`) und die Cloud Function `crm-api` richtet `functions/crm-api/README.md` ein. Deren Adresse kommt im nächsten Schritt in `CRM_API_URL`.

### 3. Werte im Repo hinterlegen

Repo → **Settings → Secrets and variables → Actions → Variables → New repository variable**:

| Name | Wert |
|---|---|
| `GOOGLE_CLIENT_ID` | Client-ID aus Schritt 1 |
| `CRM_API_URL` | Adresse der Function `crm-api` aus Schritt 2 |
| `CONTACT_GENERATOR_URL`, `SHOP_AUDIT_URL`, `KUNDENPORTAL_API_URL` | Adressen der übrigen Functions (optional, ohne sie sind die Werkzeuge aus) |
| `ALLOWED_DOMAIN` | `velonify.de` (optional, das ist der Standard) |

Danach unter **Actions → „Tests & Veröffentlichung“ → Run workflow** neu veröffentlichen.

### 4. Im CRM einrichten

CRM öffnen, anmelden (alle Berechtigungen erlauben: Drive, Sheets, Kalender), links unten **Einrichtung**:

1. **Datenbank:** nichts zu tun, Tabellen und Spalten kommen aus den Migrationen. Nachsehen und korrigieren unter **Einrichtung → Daten**.
2. **Google Drive → Ordner automatisch suchen → Speichern.** Findet `01_Leads`, `01_Clients` und `01_Client-Folder-Template`. Bei mehreren Treffern den Ordner-Link von Hand einfügen.
3. Team und Verlustgründe bei Bedarf unter **Einrichtung → Daten → listen** anpassen.

Wer Ordner nach `01_Clients` verschieben soll, braucht in der Shared Drive mindestens die Rolle **Content-Manager**.

### 5. Eigene Adresse `crm.velonify.de` (optional)

1. Bei Strato im DNS von velonify.de einen **CNAME**-Eintrag anlegen: `crm` → `velonify.github.io`
2. Repo → **Settings → Pages → Custom domain:** `crm.velonify.de` eintragen, nach der Prüfung **Enforce HTTPS** aktivieren.
3. Empfohlen: Organisation → **Settings → Pages → Add a domain** und `velonify.de` verifizieren, damit niemand sonst die Subdomain auf GitHub nutzen kann.

## Import-Format

Der Import liest genau die flache Ausgabe des Magento-Lead-Qualifiers – CSV direkt hochladen, nichts umbenennen:

`tier, score, domain, firma, plattform, version, eol, register, ust_id, ansprechpartner, email, telefon, ort, katalog_urls, payments, marketing, lauf`

Pflicht ist nur `domain`. Zusätzlich gelesen, wenn vorhanden: `ansprechpartner_rolle`, `letztes_deploy` (→ Technik) und `score_gruende` (→ Notiz). Andere Spalten werden ignoriert, Trennzeichen Komma oder Semikolon. Ältere Exporte mit englischen Spaltennamen (`company`, `platform`, `city` …) funktionieren weiterhin.

| CSV | Im CRM |
|---|---|
| `firma` (leer → Domain) | Firmenname |
| `tier`, `score`, `plattform`, `version`, `eol`, `register`, `ust_id`, `ort` | gleichnamige Felder |
| `email`, `telefon` | allgemeine E-Mail / Telefon der Firma |
| `ansprechpartner` (+ `ansprechpartner_rolle`) | Hauptkontakt |
| `marketing`, `payments`, `katalog_urls`, `letztes_deploy` | Technik |
| `lauf` | Quelle „Magento <lauf>“ |
| `score_gruende` | Notiz „Lead-Scoring: …“ |

Das Format ist in beiden Projekten festgelegt (`IMPORT_SPALTEN` hier, `CRM_COLUMNS` im Qualifier) – Änderungen immer auf beiden Seiten.

## Regeln für die Daten

- Jeder Eintrag hat eine feste `id`. Die App findet Einträge nur darüber.
- **Nicht löschen**, sondern im CRM archivieren. Jede Änderung steht im Änderungsprotokoll (`aenderungen`) und lässt sich unter **Einrichtung → Daten** zurücknehmen.
- Neue Spalten nur über eine Migration in `db/migrationen` (und `src/data/schema.ts`).
- Team und Verlustgründe unter **Einrichtung → Daten → listen** pflegen. Phasen, Status und Tiers sind fest, weil Automatiken daran hängen.
- Speichern zwei Personen denselben Eintrag, warnt die App die zweite, statt still zu überschreiben.
- Ein Lese-Spiegel aller Tabellen wird jede Nacht in ein Google Sheet geschrieben, das das Team nur lesen kann (siehe `functions/crm-api/README.md`).

## Entwicklung

Voraussetzung: Node.js 24.

```bash
npm install
npm run dev      # http://localhost:5173 – ohne .env.local im Demo-Modus
npm test         # Tests der Datenschicht
npm run test:postgres   # dieselben Service-Tests noch einmal gegen Postgres (PGlite)
npm run build
```

Für echte Daten lokal `.env.example` nach `.env.local` kopieren und ausfüllen.

### Aufbau

```
src/
├── auth/                Google-Anmeldung (Token im Browser, kein Server)
├── data/
│   ├── crm.ts           Alle Geschäftsvorgänge: Validierung, Verlauf, Phasenwechsel, Drive, Termine, Import
│   ├── store.ts         Speicher-Schnittstelle
│   ├── api/             ApiStore: der Speicher im echten Betrieb (crm-api → Postgres)
│   ├── postgres/        PostgresStore für crm-api, crm-mcp und kundenportal
│   ├── sheets/          SheetsClient (Kalkulations-Sheets) und SheetStore (nur noch Demo-Modus und Tests)
│   ├── google/          Drive- und Kalender-Anbindung
│   ├── demo/            Sheet, Drive und Kalender im Speicher + erfundene Beispieldaten
│   ├── selectors.ts     Auswertungen für „Mein Tag“, Pipeline, Kennzahlen
│   ├── importCsv.ts     CSV lesen und Import-Vorschau berechnen
│   ├── rules.ts         Regeln: Domain, Kürzel, Ordnernamen, Pflichtfelder
│   └── schema.ts        Tabellenblätter und Spalten
│   ├── social.ts        Säulen, Formate, Median und Schwellen der Messung, UTM-Links
│   ├── socialStart.ts   Der 90-Tage-Plan als Startliste (Inhalte, Termine, Hooks, Aufgaben, Kapitel)
├── pages/               Mein Tag, Pipeline, Firmen, Firmenakte, Import, Einrichtung, Login
├── social/              Übersicht, Redaktionsplan, Inhalte, Aufgaben, Messung, Strategie
└── components/          Layout, Dialoge, Karten der Firmenakte
```

Der Demo-Modus nutzt dieselbe Geschäftslogik wie der echte Betrieb, speichert aber in einem Sheet-Nachbau im Speicher (`SheetStore` auf `demo/memorySheets.ts`); Drive und Kalender liegen ebenfalls als Nachbau im Speicher. Die Tests in `src/data` laufen gegen diese Nachbauten, `npm run test:postgres` dieselben Service-Tests zusätzlich gegen `PostgresStore` (PGlite, `db/test/sheetStoreAlsPostgres.ts`). Die eigentlichen Aufrufe an Google (`sheets/sheetsClient.ts`, `google/`) lassen sich erst mit echten Zugangsdaten prüfen.

**Grenzen:** Termine zeigt die Firmenakte aus dem Kalender der angemeldeten Person – Termine von Kolleg:innen stehen im Verlauf. Das CRM verschickt selbst keine E-Mails außer Google-Kalender-Einladungen.

**Dieses Repo ist öffentlich:** keine echten Firmen, Kontakte, Sheet- oder Ordner-IDs oder Zugangsdaten in Code, Tests oder Beispielen. Deshalb steht im Startplan von Social Media (`src/data/socialStart.ts`) an den Stellen, wo Kundennamen, freigegebene Zahlen oder Zitate hingehören, ein `[IM HUB ERGÄNZEN: …]`. Diese Stellen werden einmal im Hub gefüllt, nicht hier.
