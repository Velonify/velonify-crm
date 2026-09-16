# Velonify CRM

Internes CRM für Leads, Vertrieb, Angebote und Kundenakte.

- **Oberfläche:** React-App auf GitHub Pages
- **Daten:** ein Google Sheet („CRM-Datenbank“) in der Shared Drive. **Keine Kundendaten in diesem Repo.**
- **Login:** Google-Konto mit `@velonify.de`. Die App liest und schreibt das Sheet mit dem Konto der angemeldeten Person – wer das Sheet nicht sehen darf, sieht auch im CRM nichts.

Ohne Google-Zugangsdaten startet die App im **Demo-Modus** mit erfundenen Beispieldaten.

## Funktionen

| Bereich | Was es kann |
|---|---|
| **Suche** | Überall mit `⌘K` / `Strg+K` oder über die Seitenleiste: Firmen, Kontakte und Deals nach Name, Domain, Kürzel, E-Mail, Telefon oder Ort. Umlaute egal („muenchen“ findet „München“), Pfeiltasten + Enter öffnen die Firmenakte. |
| **Mein Tag** | Überfällige und heutige Wiedervorlagen und Deal-Schritte, nächste 7 Tage, Deals ohne nächsten Schritt, Kennzahlen (Pipeline-Wert, gewichtet, Angebote, gewonnen im Monat). Umschaltbar zwischen „Meine“ und „Alle“. |
| **Pipeline** | Kanban nach Phase (Neu → Qualifiziert → Kontaktiert → Gespräch → Angebot → Gewonnen/Verloren), Drag & Drop, Summen je Spalte, Filter nach Zuständigem. |
| **Firmen** | Liste mit Suche (auch nach Kontakten), Filtern, Deal-Phase; Anlegen, Bearbeiten, Archivieren. Doppelte Domains und Kürzel werden abgelehnt. |
| **Firmenakte** | Deals mit Angebotswert und nächstem Schritt, Kontakte, Wiedervorlagen, Verlauf (Notiz/Anruf/Mail/Meeting), Google-Drive-Ordner, Termine. |
| **Automatik beim Phasenwechsel** | *Qualifiziert*: Kürzel vorschlagen und Lead-Ordner in `02_Sales/01_Leads` anlegen · *Angebot*: Ordner nach `01_Clients` verschieben und Unterordner aus der Vorlage ergänzen · *Gewonnen*: Firma wird Kunde · *Verloren*: Grund wird abgefragt. Jeder Wechsel landet im Verlauf. |
| **Termine** | Termin mit Google-Meet-Link direkt beim Kontakt planen, Einladung optional per Mail; Termine mit Kontakten der Firma aus dem eigenen Kalender. |
| **Dubletten-Warnung** | Gleiche USt-ID, Handelsregisternummer (gleiches Amtsgericht), gleicher Name ohne Rechtsform oder gleiche E-Mail-/Web-Domain (ohne Freemailer) gelten als mögliche Dublette: Warnung vor dem Speichern, Hinweis in der Firmenakte, Filter „Mögliche Dubletten“ in der Firmenliste. |
| **Import** | CSV aus dem Magento-Lead-Qualifier: Vorschau, Tier-Filter, Dubletten per Domain; mögliche Dubletten unter anderer Domain werden markiert und standardmäßig nicht importiert. Neue Firmen bekommen Kontakt und Deal; vorhandene werden nie überschrieben, nur leere Felder ergänzt. |

## Einrichtung (einmalig)

### 1. Google Cloud: OAuth-Client anlegen

1. [console.cloud.google.com](https://console.cloud.google.com) mit dem velonify.de-Konto öffnen und ein Projekt **velonify-crm** anlegen (Organisation: velonify.de).
2. **APIs & Dienste → Bibliothek:** **Google Sheets API**, **Google Drive API** und **Google Calendar API** aktivieren.
3. **Google Auth Platform → Branding / Zielgruppe:** App-Name „Velonify CRM“, Zielgruppe **Intern**. Damit können sich nur velonify.de-Konten anmelden, und Google muss die App nicht prüfen.
4. **Google Auth Platform → Clients → Client erstellen:** Typ **Webanwendung**, Name „Velonify CRM“.
   Unter **Autorisierte JavaScript-Quellen** eintragen:
   - `http://localhost:5173`
   - `https://velonify.github.io`
   - `https://crm.velonify.de`

   Weiterleitungs-URIs werden nicht gebraucht.
5. Die **Client-ID** kopieren (endet auf `.apps.googleusercontent.com`). Sie ist nicht geheim, ein Client-Secret wird nicht verwendet.

### 2. Google Sheet anlegen

1. In der Shared Drive „Velonify“ (z. B. unter `00_Company-Hub/04_Operations`) ein leeres Google Sheet **CRM-Datenbank** anlegen.
2. Die **Sheet-ID** aus der Adresse kopieren: `https://docs.google.com/spreadsheets/d/`**`DIESE-ID`**`/edit`.

### 3. Werte im Repo hinterlegen

Repo → **Settings → Secrets and variables → Actions → Variables → New repository variable**:

| Name | Wert |
|---|---|
| `GOOGLE_CLIENT_ID` | Client-ID aus Schritt 1 |
| `SPREADSHEET_ID` | Sheet-ID aus Schritt 2 |
| `ALLOWED_DOMAIN` | `velonify.de` (optional, das ist der Standard) |

Danach unter **Actions → „Tests & Veröffentlichung“ → Run workflow** neu veröffentlichen.

### 4. Im CRM einrichten

CRM öffnen, anmelden (alle Berechtigungen erlauben: Sheets, Drive, Kalender), links unten **Einrichtung**:

1. **Google Sheet → Einrichten.** Legt alle Tabellenblätter und Spalten an, füllt die Auswahllisten und setzt einen Warnhinweis gegen versehentliches Bearbeiten von Hand. Kann gefahrlos mehrfach ausgeführt werden.
2. **Google Drive → Ordner automatisch suchen → Speichern.** Findet `01_Leads`, `01_Clients` und `01_Client-Folder-Template`. Bei mehreren Treffern den Ordner-Link von Hand einfügen.
3. Team und Verlustgründe bei Bedarf im Blatt `listen` anpassen.

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

## Regeln für das Sheet

- Jede Zeile hat eine feste `id`. Die App findet Zeilen nur darüber – Sortieren oder Filtern im Sheet ist unkritisch.
- **Nicht löschen**, sondern im CRM archivieren.
- Spalten nicht umbenennen. Eigene Zusatzspalten sind erlaubt und bleiben erhalten.
- Team und Verlustgründe im Blatt `listen` pflegen. Phasen, Status und Tiers sind fest, weil Automatiken daran hängen.
- Speichern zwei Personen denselben Eintrag, warnt die App die zweite, statt still zu überschreiben.

## Entwicklung

Voraussetzung: Node.js 24.

```bash
npm install
npm run dev      # http://localhost:5173 – ohne .env.local im Demo-Modus
npm test         # Tests der Datenschicht
npm run build
```

Für echte Daten lokal `.env.example` nach `.env.local` kopieren und ausfüllen.

### Aufbau

```
src/
├── auth/                Google-Anmeldung (Token im Browser, kein Server)
├── data/
│   ├── crm.ts           Alle Geschäftsvorgänge: Validierung, Verlauf, Phasenwechsel, Drive, Termine, Import
│   ├── store.ts         Speicher-Schnittstelle – einziger Punkt, der bei einem Datenbank-Wechsel ersetzt wird
│   ├── sheets/          Google Sheets als Speicher (lädt alle Blätter mit einer Anfrage) und Einrichtung
│   ├── google/          Drive- und Kalender-Anbindung
│   ├── demo/            Sheet, Drive und Kalender im Speicher + erfundene Beispieldaten
│   ├── selectors.ts     Auswertungen für „Mein Tag“, Pipeline, Kennzahlen
│   ├── importCsv.ts     CSV lesen und Import-Vorschau berechnen
│   ├── rules.ts         Regeln: Domain, Kürzel, Ordnernamen, Pflichtfelder
│   └── schema.ts        Tabellenblätter und Spalten
├── pages/               Mein Tag, Pipeline, Firmen, Firmenakte, Import, Einrichtung, Login
└── components/          Layout, Dialoge, Karten der Firmenakte
```

Der Demo-Modus nutzt dieselbe Geschäftslogik und Speicherschicht wie der echte Betrieb – nur Sheet, Drive und Kalender liegen als Nachbau im Speicher. Auch die Tests (`src/data/crm.test.ts`) laufen gegen diese Nachbauten. Die eigentlichen Aufrufe an Google (`sheets/sheetsClient.ts`, `google/`) lassen sich erst mit echten Zugangsdaten prüfen.

Ein späterer Umzug auf eine andere Datenbank (z. B. Supabase) bedeutet: eine neue Umsetzung von `Store` schreiben. Geschäftslogik und Oberfläche bleiben unverändert.

**Grenzen:** Termine zeigt die Firmenakte aus dem Kalender der angemeldeten Person – Termine von Kolleg:innen stehen im Verlauf. Das CRM verschickt selbst keine E-Mails außer Google-Kalender-Einladungen.

**Dieses Repo ist öffentlich:** keine echten Firmen, Kontakte, Sheet-IDs oder Zugangsdaten in Code, Tests oder Beispielen.
