import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Card, FormError } from '../../components/ui';
import { config } from '../../config';
import { useCrm } from '../../data/CrmContext';
import { sendeTab, zaehle, type Ziel } from '../../data/api/uebernahmeApi';
import { SheetsClient } from '../../data/sheets/sheetsClient';
import { liesSheet, pruefbericht, type Befund, type SheetAbzug } from '../../data/uebernahme';

/**
 * Takes the Google Sheet over into Postgres: read and check first, then a dry run into crm_test, then the real move
 * into crm. Reading uses the signed-in person's Google token; crm-api only lets Lukas and Julian write.
 */
export function UebernahmeKarte() {
  const { getToken } = useAuth();
  const { refresh } = useCrm();
  const [abzug, setAbzug] = useState<SheetAbzug | null>(null);
  const [befunde, setBefunde] = useState<Befund[]>([]);
  const [zahlen, setZahlen] = useState<{ ziel: Ziel; werte: Record<string, number> } | null>(null);
  const [schritt, setSchritt] = useState('');
  const [fehler, setFehler] = useState<unknown>();

  const lauf = async (arbeit: () => Promise<void>) => {
    setFehler(undefined);
    try {
      await arbeit();
    } catch (err) {
      setFehler(err);
    } finally {
      setSchritt('');
    }
  };

  const pruefen = () =>
    lauf(async () => {
      setSchritt('Sheet wird gelesen …');
      const neu = await liesSheet(new SheetsClient(config.spreadsheetId, getToken));
      setAbzug(neu);
      setBefunde(pruefbericht(neu));
      setZahlen(null);
    });

  const uebernehmen = (ziel: Ziel) =>
    lauf(async () => {
      if (!abzug) return;
      if (ziel === 'crm' && !window.confirm('Alle Daten aus dem Sheet jetzt in die Datenbank crm übernehmen? Vorhandene Einträge mit derselben ID werden überschrieben.')) return;
      // Read again right before writing, so nothing changed since the check is missed.
      setSchritt('Sheet wird gelesen …');
      const frisch = await liesSheet(new SheetsClient(config.spreadsheetId, getToken));
      setAbzug(frisch);
      setBefunde(pruefbericht(frisch));
      for (const t of frisch) {
        if (!t.zeilen.length) continue;
        setSchritt(`${t.tab}: ${t.zeilen.length} Zeilen …`);
        await sendeTab(config.crmApiUrl, getToken, ziel, t.tab, t.zeilen);
      }
      setSchritt('Abgleich …');
      setZahlen({ ziel, werte: await zaehle(config.crmApiUrl, getToken, ziel) });
      if (ziel === 'crm') await refresh();
    });

  const abweichungen = zahlen && abzug ? abzug.filter((t) => (zahlen.werte[t.tab] ?? 0) !== t.zeilen.length) : [];

  return (
    <Card title="Übernahme aus dem Sheet">
      <p className="muted">
        Liest das Google Sheet, zeigt, was nicht mitkommt oder schon kaputt ist, und schreibt die Daten mit ihren IDs nach Postgres. Erst den Probelauf in <code>crm_test</code>, dann die echte Übernahme. Beides lässt sich wiederholen.
      </p>
      <div className="form-actions">
        <button type="button" className="button" onClick={pruefen} disabled={!!schritt}>
          Sheet prüfen
        </button>
        <button type="button" className="button" onClick={() => uebernehmen('crm_test')} disabled={!!schritt || !abzug}>
          Probelauf in crm_test
        </button>
        <button type="button" className="button primary" onClick={() => uebernehmen('crm')} disabled={!!schritt || !abzug}>
          In crm übernehmen
        </button>
      </div>
      {schritt && <p className="muted">{schritt}</p>}
      <FormError error={fehler} />
      {abzug && (
        <>
          <h3>Prüfbericht</h3>
          {befunde.length === 0 ? (
            <p>Keine Auffälligkeiten.</p>
          ) : (
            <ul>
              {befunde.map((b, i) => (
                <li key={i}>
                  <code>{b.tab}</code> {b.text}
                </li>
              ))}
            </ul>
          )}
          <table className="table compact">
            <thead>
              <tr>
                <th>Tabelle</th>
                <th>Im Sheet</th>
                {zahlen && <th>In {zahlen.ziel}</th>}
              </tr>
            </thead>
            <tbody>
              {abzug.map((t) => (
                <tr key={t.tab}>
                  <td>
                    <code>{t.tab}</code>
                  </td>
                  <td>{t.vorhanden ? t.zeilen.length : '–'}</td>
                  {zahlen && <td>{(zahlen.werte[t.tab] ?? 0) === t.zeilen.length ? `${zahlen.werte[t.tab] ?? 0} ✓` : <strong>{zahlen.werte[t.tab] ?? 0} ≠</strong>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {zahlen && (
            <p className={abweichungen.length ? 'alert error' : 'muted'}>
              {abweichungen.length
                ? `Abweichung in ${abweichungen.map((t) => t.tab).join(', ')}. Mehr Zeilen in der Datenbank heißt meist: dort liegt schon etwas aus einem früheren Lauf oder aus dem Hub.`
                : `Alle Tabellen stimmen mit dem Sheet überein (${zahlen.ziel}).`}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
