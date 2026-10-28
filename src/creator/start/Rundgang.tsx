import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useCreatorApi, useInstanz } from '../api';

/** The tour of the creator hub: one step per tool the person has, page by page. */
const SCHRITTE: { werkzeug: string; pfad: string; titel: string; text: string }[] = [
  { werkzeug: 'home', pfad: '/', titel: 'Willkommen', text: 'Hier siehst du jeden Tag, was in dieser Woche ansteht: Uploads, Fristen, Kooperationen, Freigaben und die letzten Zahlen.' },
  { werkzeug: 'content', pfad: '/content', titel: 'Content-Plan', text: 'Alle Kanäle in einem Plan, von der Idee bis zum Upload. Ein Klick auf einen Eintrag öffnet Skript, Thumbnail und Upload-Texte.' },
  { werkzeug: 'analytics', pfad: '/analytics', titel: 'Analytics', text: 'Die Zahlen aller Kanäle an einem Ort, Merkmale je Video und der Wochen- und Monatsbericht.' },
  { werkzeug: 'kooperationen', pfad: '/kooperationen', titel: 'Kooperationen', text: 'Partner, Stand, Betrag und Zahlung auf einen Blick.' },
  { werkzeug: 'todo', pfad: '/todo', titel: 'To-Dos', text: 'Projekte und Aufgaben als Liste oder Board, mit Zuständigkeit und Kommentaren.' },
  { werkzeug: 'kalender', pfad: '/fristen', titel: 'Kalender', text: 'Uploads, Drehtage, Kampagnen und Abgaben. Über „Abo“ kommt der Kalender in Google, Apple oder Outlook.' },
  { werkzeug: 'ablage', pfad: '/ablage', titel: 'Ablage', text: 'Die feste Ordnerstruktur in Google Drive, damit jede Datei ihren Platz hat.' },
];

/**
 * The tour on a person's first login (state per person in crm-api, restartable from the settings). Mounted in the layout,
 * so it stays while it walks from page to page.
 */
export function CreatorRundgang() {
  const api = useCreatorApi();
  const [an, setAn] = useState(false);
  useEffect(() => {
    api
      .get<{ rundgang: boolean }>('/c/start')
      .then((d) => setAn(d.rundgang))
      .catch(() => setAn(false));
  }, [api]);
  if (!an) return null;
  return (
    <Schritte
      fertig={() => {
        setAn(false);
        void api.post('/c/start/rundgang', { gesehen: true });
      }}
    />
  );
}

function Schritte({ fertig }: { fertig(): void }) {
  const instanz = useInstanz();
  const navigate = useNavigate();
  const titelId = useId();
  const schritte = SCHRITTE.filter((s) => instanz.werkzeuge.includes(s.werkzeug));
  const [index, setIndex] = useState(0);
  const schritt = schritte[index];
  const geheZu = (i: number) => {
    setIndex(i);
    navigate(schritte[i].pfad);
  };
  if (!schritt) return null;
  return createPortal(
    <aside className="demo-tour glass" aria-labelledby={titelId}>
      <header className="demo-tour-kopf">
        <span className="demo-tour-marke">
          Rundgang · {index + 1} von {schritte.length}
        </span>
        <button type="button" className="demo-tour-zu" onClick={fertig} aria-label="Rundgang beenden">
          ×
        </button>
      </header>
      <ol className="demo-tour-punkte" aria-hidden="true">
        {schritte.map((s, i) => (
          <li key={s.pfad} className={i < index ? 'is-fertig' : i === index ? 'is-jetzt' : ''} />
        ))}
      </ol>
      <h2 id={titelId}>{schritt.titel}</h2>
      <p>{schritt.text}</p>
      <footer className="demo-tour-fuss">
        {index > 0 && (
          <button type="button" className="button small" onClick={() => geheZu(index - 1)}>
            Zurück
          </button>
        )}
        <span className="demo-tour-luecke" />
        {index < schritte.length - 1 ? (
          <button type="button" className="button small primary demo-tour-weiter" onClick={() => geheZu(index + 1)}>
            Weiter: {schritte[index + 1].titel}
          </button>
        ) : (
          <button
            type="button"
            className="button small primary demo-tour-weiter"
            onClick={() => {
              navigate('/');
              fertig();
            }}
          >
            Fertig
          </button>
        )}
      </footer>
    </aside>,
    document.body,
  );
}
