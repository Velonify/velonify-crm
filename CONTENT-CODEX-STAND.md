# Content – Codex-Zwischenstand

Stand: 28.10.2026. Alle Änderungen nur in der isolierten Arbeitskopie; keine Git-Mutationen durch den Content-Agent.

## Implementiert, fokussiert getestet; Gesamtabnahme offen

- Backend `functions/crm-api/src/creator/content.ts` plus `content/daten.ts` und `content/recherche.ts`: echte CRUD-Operationen, Upload-Fristen, Link zu echtem Video, Änderungs-Konflikterkennung, Gate für aktuelle Skript-Freigabe vor Dreh/Schnitt, Feature-/Kanal-Prüfung.
- Recherche mit vorhandenen Kommentaren, Top/Flop-Videos und Merkmalen, Benchmarkdaten und offizieller YouTube-Trends-API. Kein Key/API-Fehler sichtbar; keine Quellen führt zu 409. KI-Quellen-IDs werden validiert, 5–10 Vorschläge, Übernahme idempotent. Wöchentlicher Takt mit Unique-Index für `takt` in Migration 017.
- Skriptgenerator und manuelle versionierte Fassungen, Ton-Profil, jeweils 3–5 Titel und Hooks. Gemeinsamer `FreigabeKnopf` im UI.
- Thumbnail-Briefing, editierbar, Referenzen eigener Videos, tatsächliche Aufgaben-Erstellung. Partnerboards gefiltert. Erneuter Klick erstellt keine doppelte Aufgabe.
- Upload-Texte je Plattform mit automatischer Werbekennzeichnung bei Kooperation, Impressum, Checkliste, Generierung, Kopieren. Schneller TikTok-Caption-Vorschlag mit manueller Übernahmebestätigung.
- Frontend: Plan als Liste/Board/Monat/Woche, Filter, Drag-and-drop plus bedienbarer Statusauswahl; Detailform, Drive-Ordner-Button; Recherche/Skripte/Thumbnails/Upload als funktionsfähige Seiten statt ImBau.
- Dateien: `src/creator/content/{typen,gemeinsam,Plan,Assistenten,Upload,Routen,content.css}`; vorhandene `regeln.ts` verwendet.

## Verifikation / nächste Schritte

- Frontend-Typecheck `node_modules/.bin/tsc --noEmit -p .`: grün.
- Content-Integrationstests `../../node_modules/.bin/vitest run src/creator/content.test.ts` aus `functions/crm-api`: **10/10 grün**, Lauf 18:35 UTC, Dauer 4,73 s.
- Backend-Typecheck: keine Fehler in Content. Andere offene Fehler: Analytics `auswertung.ts` Typ `einschaetzung`, Steuerung-Test `DbPool.exec`, bekannter `plattform.test.ts` TS2352.
- Ordner-Hook-Vertrag Organisation: `useAblageDrive()` aus `src/creator/ablage/drive.ts`, `ordnerFuer('content/rohmaterial', id+' '+titel)` → `{url,drive_id}`. Frontend-Typecheck bestätigt den Export; echte Drive-Ausführung noch ausstehend.
- Board-Link auf echte Route `/todo/<id>` korrigiert.
- Upload-Einstellungen: Nach Änderung Impressum ist derzeit Neuladen der Upload-Vorschau nötig; sinnvoll auf gemeinsamen Refresh umstellen.
- API `GET /c/kooperationen/auswahl` muss `{kooperationen:[{id,titel,marke,werbung}]}` liefern (Root zuständig).
- Root-Navigation `src/werkzeuge.ts` ggf. zusätzliche Unterpfade; ContentRouten selbst ist vollständig.
- Keine Browserprüfung und keine Produktions-/OAuth-Prüfung erfolgt. Gesamtabnahme bleibt offen.

## Hinweise

Feature-Prüfung ist serverseitig. Keine Beträge werden im Content-Modul ausgegeben. Task-Board-Prüfung erlaubt Partnern nur freigegebene Boards. Bestehende UI-Komponenten/Klassen werden verwendet; neue CSS-Regeln sind auf Content begrenzt. Gegen echte Kundendaten wurde nichts ausgeführt.
