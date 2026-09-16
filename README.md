# Velonify CRM

Internes CRM für Leads, Vertrieb, Angebote und Kundenakte.

- **Oberfläche:** React-App auf GitHub Pages
- **Daten:** ein Google Sheet („CRM-Datenbank“) in der Shared Drive. **Keine Kundendaten in diesem Repo.**
- **Login:** Google-Konto mit `@velonify.de`. Die App liest und schreibt das Sheet mit dem Konto der angemeldeten Person – wer das Sheet nicht sehen darf, sieht auch im CRM nichts.

Ohne Google-Zugangsdaten startet die App im **Demo-Modus** mit erfundenen Beispieldaten.

## Stand

| Schritt | Inhalt | Status |
|---|---|---|
| 1 | Login, Datenzugriff aufs Sheet, Firmenliste, Firmenakte, Einrichtung | ✅ |
| 2 | Kontakte, Deals, Pipeline | offen |
| 3 | Aktivitäten, Wiedervorlagen, „Mein Tag“ | offen |
| 4 | CSV-Import aus dem Lead-Qualifier | offen |
| 5 | Google Drive (Lead-/Kundenordner) und Meet | offen |

## Einrichtung (einmalig)

### 1. Google Cloud: OAuth-Client anlegen

1. [console.cloud.google.com](https://console.cloud.google.com) mit dem velonify.de-Konto öffnen und ein Projekt **velonify-crm** anlegen (Organisation: velonify.de).
2. **APIs & Dienste → Bibliothek:** „Google Sheets API“ aktivieren.
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

### 4. Sheet einrichten

CRM öffnen, anmelden, links unten **Einrichtung → Einrichten**. Das legt alle Tabellenblätter und Spalten an, füllt die Auswahllisten und setzt einen Warnhinweis gegen versehentliches Bearbeiten von Hand. Kann gefahrlos mehrfach ausgeführt werden.

### 5. Eigene Adresse `crm.velonify.de` (optional)

1. Bei Strato im DNS von velonify.de einen **CNAME**-Eintrag anlegen: `crm` → `velonify.github.io`
2. Repo → **Settings → Pages → Custom domain:** `crm.velonify.de` eintragen, nach der Prüfung **Enforce HTTPS** aktivieren.
3. Empfohlen: Organisation → **Settings → Pages → Add a domain** und `velonify.de` verifizieren, damit niemand sonst die Subdomain auf GitHub nutzen kann.

## Regeln für das Sheet

- Jede Zeile hat eine feste `id`. Die App findet Zeilen nur darüber – Sortieren oder Filtern im Sheet ist unkritisch.
- **Nicht löschen**, sondern im CRM archivieren.
- Spalten nicht umbenennen. Eigene Zusatzspalten sind erlaubt und bleiben erhalten.
- Auswahlwerte (Team, Phasen, Verlustgründe …) im Blatt `listen` pflegen.
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
├── auth/             Google-Anmeldung (Token im Browser, kein Server)
├── data/
│   ├── repository.ts Schnittstelle – der einzige Weg, wie die Oberfläche an Daten kommt
│   ├── schema.ts     Tabellenblätter, Spalten, Standard-Auswahllisten
│   ├── firmen.ts     Regeln für Firmen (Domain normalisieren, Dubletten, Kürzel)
│   ├── sheets/       Google-Sheets-Umsetzung inkl. Einrichtung
│   └── demo/         Beispieldaten für den Demo-Modus
├── pages/            Firmenliste, Firmenakte, Neue Firma, Einrichtung, Login
└── components/       Layout, Formular, Bausteine
```

Ein späterer Umzug auf eine andere Datenbank (z. B. Supabase) bedeutet: eine neue Umsetzung von `Repository` schreiben, die Oberfläche bleibt unverändert.

**Dieses Repo ist öffentlich:** keine echten Firmen, Kontakte, Sheet-IDs oder Zugangsdaten in Code, Tests oder Beispielen.
