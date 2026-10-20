import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AGENTUR } from '../../data/demo/agentur';
import { ROLLEN, type DemoRolle } from './demo';

/** First stop of the public demo: whose view to start with. Later the demo bar switches it. */
export function Rollenwahl({ onWahl }: { onWahl(rolle: DemoRolle): void }) {
  const titelId = useId();
  const erste = useRef<HTMLButtonElement>(null);
  useEffect(() => erste.current?.focus(), []);

  return createPortal(
    <div className="overlay demo-willkommen-overlay" role="presentation">
      <div className="demo-willkommen" role="dialog" aria-modal="true" aria-labelledby={titelId}>
        <p className="demo-willkommen-marke">Demo · Velonify Hub</p>
        <h2 id={titelId}>Willkommen bei {AGENTUR.name}</h2>
        <p className="demo-willkommen-text">
          Eine erfundene E-Commerce-Agentur aus {AGENTUR.ort} mit fünf Leuten, vollem Vertrieb und laufenden Kunden. Alles läuft nur in deinem Browser: Du kannst
          klicken, anlegen und verschieben, niemand sonst sieht es. Aus wessen Sicht willst du starten?
        </p>
        <div className="demo-rollen">
          {ROLLEN.map((r, i) => (
            <button key={r.id} ref={i === 0 ? erste : undefined} type="button" className="demo-rolle" onClick={() => onWahl(r)}>
              <span className="demo-rolle-avatar" aria-hidden="true">
                {r.person.name[0]}
                {r.person.nachname[0]}
              </span>
              <span className="demo-rolle-titel">{r.titel}</span>
              <span className="demo-rolle-person">
                {r.person.name} {r.person.nachname}
              </span>
              <span className="demo-rolle-text">{r.text}</span>
            </button>
          ))}
        </div>
        <p className="demo-willkommen-fuss">Die Rolle kannst du jederzeit oben in der Demo-Leiste wechseln.</p>
      </div>
    </div>,
    document.body,
  );
}
