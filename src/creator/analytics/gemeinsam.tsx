import { useState } from 'react';
import { Field } from '../../components/ui';
import { useAktion, useLaden } from '../content/gemeinsam';
import { useCreatorApi } from '../api';
import { prozent, zahlText, type Vergleich } from './typen';

export { useAktion, useLaden };

/** Shown above every Analytics page while (some of) the numbers are invented sample data. */
export function BeispielBand({ an }: { an: boolean }) {
  if (!an) return null;
  return (
    <p className="alert" role="note">
      <strong>Beispielzahlen.</strong> Diese Zahlen sind erfunden und zeigen nur, wie der Hub aussieht. Sobald ein Kanal verbunden und zum ersten Mal abgerufen ist, ersetzen seine echten
      Zahlen die Beispiele.
    </p>
  );
}

/** Hands the browser a text file to save (CSV templates). */
export function herunterladen(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A CSV from a file or pasted text (e.g. prepared externally with an AI), at most 2 MB. */
export function CsvFeld({ wert, setze }: { wert: string; setze(text: string): void }) {
  const [fehler, setFehler] = useState('');
  return (
    <>
      <Field label="CSV-Datei">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const datei = e.target.files?.[0];
            if (!datei) return;
            if (datei.size > 2_000_000) return setFehler('Die Datei darf höchstens 2 MB groß sein.');
            setFehler('');
            setze(await datei.text());
          }}
        />
      </Field>
      <Field label="oder CSV-Inhalt einfügen">
        <textarea rows={5} value={wert} onChange={(e) => setze(e.target.value)} />
      </Field>
      {fehler && <p className="alert error">{fehler}</p>}
    </>
  );
}

/** Median views and interaction rate per feature value, as a simple bar list. */
export function MerkmalVergleich({ vergleich }: { vergleich: Vergleich[] }) {
  const arten: { art: Vergleich['art']; label: string }[] = [
    { art: 'thema', label: 'Thema' },
    { art: 'format', label: 'Format' },
    { art: 'hook', label: 'Hook' },
  ];
  const max = Math.max(1, ...vergleich.map((v) => v.median_aufrufe ?? 0));
  if (vergleich.length === 0) return <p className="muted">Noch keine Videos mit Merkmalen.</p>;
  return (
    <div className="analytics-vergleich">
      {arten.map(({ art, label }) => (
        <section key={art}>
          <h3 className="small">{label}</h3>
          <table className="table compact">
            <thead>
              <tr>
                <th>{label}</th>
                <th>Videos</th>
                <th>Median Aufrufe</th>
                <th>Interaktionsrate</th>
              </tr>
            </thead>
            <tbody>
              {vergleich
                .filter((v) => v.art === art)
                .sort((a, b) => (b.median_aufrufe ?? 0) - (a.median_aufrufe ?? 0))
                .map((v) => (
                  <tr key={v.wert}>
                    <td>{v.wert}</td>
                    <td>{v.anzahl}</td>
                    <td>
                      <span className="analytics-balken" style={{ width: `${Math.round(((v.median_aufrufe ?? 0) / max) * 100)}%` }} aria-hidden="true" /> {zahlText(v.median_aufrufe)}
                    </td>
                    <td>{prozent(v.interaktionsrate)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

export { useCreatorApi };
