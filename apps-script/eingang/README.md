# Eingang: Anfragen von velonify.de ins CRM

Das Formular auf der Website ist ein Netlify-Formular (`anfrage`). Netlify ruft nach jeder Einsendung
diese Apps-Script-Web-App auf, die die Anfrage in den Tab `eingang` der CRM-Datenbank schreibt. Im CRM
stehen die Anfragen unter **Home → Anfragen**; von dort wird pro Anfrage entschieden, ob daraus eine
Firma mit Kontakt (und Deal) wird oder ob sie verworfen wird.

Warum Apps Script und nicht das Frontend: Die Website hat keinen Google-Login, und das CRM-Frontend ist
öffentlich – ein Schlüssel hätte dort nichts zu suchen. Das Skript läuft als Eigentümer der Tabelle,
darum darf der Tab geschützt bleiben.

## Einrichten (einmalig)

1. **Tab anlegen:** Im CRM unter *Einrichtung* auf *Einrichten* klicken – das legt `eingang` mit allen
   Spalten an.
2. **Skript anlegen:** CRM-Datenbank in Google Sheets öffnen → *Erweiterungen → Apps Script*.
   Den Inhalt von `Code.gs` in die Datei `Code.gs` kopieren und speichern.
3. **Token setzen:** Im Apps-Script-Editor *Projekteinstellungen → Skripteigenschaften → Eigenschaft
   hinzufügen*: `WEBHOOK_TOKEN` mit einer langen zufälligen Zeichenfolge (z. B. aus einem
   Passwort-Manager). Liegt das Skript nicht in der CRM-Tabelle selbst, zusätzlich `SPREADSHEET_ID`
   mit der ID aus der Tabellen-URL.
4. **Veröffentlichen:** *Bereitstellen → Neue Bereitstellung → Web-App*, „Ausführen als: Ich“,
   „Zugriff: Jeder“. Beim ersten Mal fragt Google nach der Freigabe. Die Adresse endet auf `/exec`.
5. **Netlify verbinden:** app.netlify.com → Site → *Forms → Notifications → Add notification →
   Outgoing webhook*, Event „New form submission“, Formular `anfrage`, URL:
   `https://script.google.com/macros/s/…/exec?token=DEIN_TOKEN`
6. **Testen:** Formular auf velonify.de ausfüllen. Die Anfrage muss im Tab `eingang` und unter
   *Home → Anfragen* auftauchen.

„Zugriff: Jeder“ heißt: Wer die Adresse kennt, kann Zeilen anlegen. Deshalb steht das Token in der URL
und bleibt geheim – niemals ins Repo, ins CRM oder in ein Ticket kopieren. Kommt Spam durch, in Netlify
unter *Forms* die Spam-Filter (Honeypot ist schon im Formular, reCAPTCHA optional) nachziehen.

## Was ankommt

Netlify schickt die Einsendung als JSON. Gelesen werden `data.name`, `data.email`, `data.shop`,
`data.themen`, `data.sprache`, `data.nachricht` und `created_at`; `data.bot-field` ist der Honeypot –
ist er gefüllt, wird die Einsendung verworfen. `site_url` wird zur Quelle („velonify.de“).

Die Feldnamen sind der Vertrag mit dem Formular im Repo `Velonify/velonify-website`
(`index.html`, `en/index.html`) – ändert sich dort ein Feld, muss es hier mitgeändert werden.
