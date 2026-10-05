# Lead-Magnete: Einträge von velonify.de/ressourcen ins CRM, Mail mit Download

Jeder aktive Magnet hat automatisch eine Landingpage `velonify.de/ressourcen/<adresse>/`: Die Website baut sie
aus einer Vorlage und den Texten, die im Hub beim Magneten stehen (Titel, Untertitel, „Was drin ist“, Knopf).
Ein Website-Deploy ist dafür nicht nötig. Wer auf einer Landingpage das Formular ausfüllt, bekommt eine Mail mit dem
Download (und, falls angehakt, dem Bestätigungslink für den Newsletter). Im Hub stehen die Einträge unter
**Lead-Magnete → Leads**, die Magnete selbst (Datei-Link, Mailtext, Aktiv-Schalter) unter **Lead-Magnete → Magnete**.

```
Aufruf von velonify.de/ressourcen/<adresse>/
  → netlify/functions/ressourcen-seite.mjs      (Website-Repo)
  → dieses Skript, Aktion „inhalt“                → Titel, Untertitel, Text, Knopf des aktiven Magneten
Formular „magnet“ (Netlify Forms, Spamfilter)
  → netlify/functions/submission-created.mjs   (Website-Repo)
  → dieses Skript, Aktion „eintrag“               → Zeile in magnet_leads + Mail über Gmail
Knöpfe in der Mail
  → netlify/functions/magnet-link.mjs (/m/…)    (Website-Repo)
  → dieses Skript, Aktion „download“ / „newsletter“ / „abmelden“
```

Das Skript läuft als die Person, die es bereitstellt, und schickt die Mails aus deren Gmail. Vorgesehen ist
**lukas@velonify.de** (Absender „Lukas von Velonify“), Antworten landen also direkt bei Lukas.

## Einrichten (einmalig)

1. **Tabs anlegen:** Im Hub unter *Einrichtung* auf *Einrichten* klicken. Das legt `magnete` und
   `magnet_leads` an.
2. **Skript anlegen:** Als lukas@velonify.de auf script.google.com → *Neues Projekt*, Name z. B.
   „Velonify Lead-Magnete“. Den Inhalt von `Code.gs` in die Datei `Code.gs` kopieren und speichern.
3. **Eigenschaften setzen:** *Projekteinstellungen → Skripteigenschaften*:
   - `WEBHOOK_TOKEN`: eine neue, lange Zufallsfolge (Passwort-Manager), nicht die vom Eingang
   - `SPREADSHEET_ID`: die ID aus der URL der CRM-Datenbank
   - optional `ABSENDER_NAME` (Standard „Lukas von Velonify“), `SIGNATUR_NAME` (Standard „Lukas Hanke“),
     `BASIS_URL` (Standard `https://velonify.de`)
4. **Probemail:** Im Hub einen Magneten mit Datei-Link anlegen und auf *Aktiv* stellen (siehe unten). Dann im
   Editor oben die Funktion `testMail` wählen und *Ausführen*. Google fragt einmal nach den Berechtigungen
   (Tabellen lesen, Mails senden). Die Probemail geht an die eigene Adresse und schreibt nichts ins Sheet.
5. **Veröffentlichen:** *Bereitstellen → Neue Bereitstellung → Web-App*, „Ausführen als: Ich“,
   „Zugriff: Jeder“. Die Adresse endet auf `/exec`.
6. **Netlify verbinden:** app.netlify.com → Site → *Site configuration → Environment variables* →
   `CRM_MAGNETE_URL` = `https://script.google.com/macros/s/…/exec?token=DEIN_TOKEN` (Scope: Functions).
   Danach einen Deploy auslösen, sonst sehen die Funktionen die Variable nicht.
7. **Ende-zu-Ende-Test:** `https://velonify.de/ressourcen/test/?utm_source=linkedin&utm_medium=social&utm_campaign=test`
   öffnen (dafür im Hub einen Magneten mit Adresse `test` anlegen), Formular mit der eigenen Adresse
   ausfüllen. Erwartet: Mail kommt an, Knopf führt zur Datei, im Hub steht der Eintrag mit „Download geöffnet“
   und Herkunft „LinkedIn“.

„Zugriff: Jeder“ heißt: Wer die Adresse samt Token kennt, kann Einträge anlegen und Mails auslösen. Das Token
bleibt deshalb geheim, nie ins Repo, ins CRM oder in ein Ticket kopieren.

## Datei in Google Drive

Pro Magnet eine Datei oder einen Ordner unter *Velonify → Lead-Magnete* ablegen, *Freigeben → Allgemeiner
Zugriff → Jeder mit dem Link → Betrachter* und den Link im Hub beim Magneten eintragen. Lässt Drive die Freigabe
nach außen nicht zu, ist sie in der Admin-Konsole von Google Workspace abgeschaltet
(*Apps → Google Workspace → Drive und Docs → Freigabeoptionen*).

## Was das Skript sonst noch tut

- **Doppelte Einträge:** Dieselbe Adresse für denselben Magneten ergibt keine zweite Zeile. Die Mail geht
  höchstens alle 10 Minuten erneut raus, an eine Adresse insgesamt höchstens 5-mal am Tag.
- **„Download geöffnet“** ist ein starkes, aber kein sicheres Signal: Virenscanner in Firmen-Postfächern (etwa
  Microsoft Defender) öffnen Links manchmal vorab, das zählt dann mit. Der Newsletter ist davor geschützt, weil er
  erst per Knopf auf der Seite bestätigt wird.
- **Inaktiver Magnet:** Der Eintrag wird gespeichert, aber es geht keine Mail raus.
- **Newsletter:** Nur wer die Box angehakt hat, kann bestätigen. Gespeichert werden der Wortlaut der Box
  (`newsletter_text`), der Zeitpunkt der Bestätigung und gegebenenfalls der Abmeldung. Abmelden gilt für die
  Adresse in allen Einträgen. Die bestätigten Adressen exportiert der Hub als CSV (*Leads → Newsletter-Liste*).
- **Kontingent:** Google Workspace erlaubt Skripten rund 1.500 Empfänger am Tag. Das Skript bremst selbst schon bei 300 Download-Mails am Tag, falls doch Spam durchkommt.

## Shop-Roast (Magnete vom Typ „audit“)

Im Hub beim Magneten *Art: Shop-Roast (Audit)* wählen und die Zahl der Plätze eintragen. Ein Datei-Link ist dann
nicht nötig.

- **Mail nach dem Formular:** Statt des Downloads eine Bestätigung („Wir prüfen den Shop in vier Bereichen …
  innerhalb von zwei Werktagen“). Sind alle Plätze vergeben (alle Einträge außer Warteliste und Verworfenen),
  bekommt der Eintrag `warteliste = TRUE` und die Wartelisten-Mail. Das Formular bleibt offen.
- **Aktion „inhalt“** liefert zusätzlich `typ`, `plaetze` und `frei` für die Anzeige „noch X Plätze“.
- **Aktion „report“** (`token`, optional `zaehlen: false`): liefert für die Seite `velonify.de/roast/<token>/`
  Vorname, Shop, den Report (JSON aus `magnet_leads.report`) und wer geprüft hat, aber nur, wenn der Report im
  Hub freigegeben ist. Jeder Aufruf zählt `report_aufrufe` hoch, der erste setzt `report_geoeffnet_am`.
- Prüfen, Report schreiben, Freigeben und Senden laufen im Hub (*Leads → Shop prüfen*), nicht hier.

Reihenfolge beim Einführen: erst im Hub *Einrichten* (neue Spalten in `magnete` und `magnet_leads`), dann die
neue Version des Skripts bereitstellen. Andersherum bricht das Skript mit „Im Tab magnet_leads fehlen Spalten“ ab.

## Änderungen am Code

Nach jeder Änderung an `Code.gs`: *Bereitstellen → Bereitstellungen verwalten → Bearbeiten → Version: Neue
Version*. So bleibt die `/exec`-Adresse gleich und Netlify muss nichts ändern.

Die Spalten von `magnet_leads` sind der Vertrag mit dem Hub (`src/data/schema.ts`), die Formularfelder
(`magnet`, `vorname`, `email`, `shop`, `shopsystem`, `newsletter`, `newsletter_text`, `utm_*`, `bot-field`) der
Vertrag mit `_ressourcen/build.py` im Website-Repo. Der Aufbau des Reports (`src/data/roast.ts`, Typ `Report`)
ist der Vertrag mit der Report-Seite der Website. Ändert sich eine Seite, die andere mitändern.
