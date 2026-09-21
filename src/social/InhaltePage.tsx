import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui';
import { INHALT_ARTEN, INHALT_STATUS, SAEULEN, parseSlides, sortiereInhalte } from '../data/social';
import { InhaltNeuDialog } from './Dialoge';
import { InhaltStatusBadge, SaeuleBadge, SocialSeite } from './SocialTeile';

export function SocialInhaltePage() {
  const navigate = useNavigate();
  const [neu, setNeu] = useState(false);
  const [art, setArt] = useState('');
  const [saeule, setSaeule] = useState('');
  const [status, setStatus] = useState('');
  const [archivierte, setArchivierte] = useState(false);

  return (
    <SocialSeite
      title="Inhalte"
      subtitle="Die fertigen Posts und Stories: Hook, Slides, Caption, Hashtags und Alt-Text. Was hier steht, geht so raus."
      actions={
        <button type="button" className="button primary" onClick={() => setNeu(true)}>
          Inhalt anlegen
        </button>
      }
    >
      {(daten, aendern) => {
        const liste = sortiereInhalte(daten.inhalte, archivierte).filter(
          (i) => (!art || i.art === art) && (!saeule || String(i.saeule ?? '') === saeule) && (!status || i.status === status),
        );

        return (
          <>
            <div className="filters">
              <select value={art} onChange={(e) => setArt(e.target.value)} aria-label="Art">
                <option value="">Alle Arten</option>
                {INHALT_ARTEN.map((a) => (
                  <option key={a.wert} value={a.wert}>
                    {a.label}
                  </option>
                ))}
              </select>
              <select value={saeule} onChange={(e) => setSaeule(e.target.value)} aria-label="Säule">
                <option value="">Alle Säulen</option>
                {SAEULEN.map((s) => (
                  <option key={s.nr} value={s.nr}>
                    {s.nr} · {s.name}
                  </option>
                ))}
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                <option value="">Jeder Status</option>
                {INHALT_STATUS.map((s) => (
                  <option key={s.wert} value={s.wert}>
                    {s.label}
                  </option>
                ))}
              </select>
              <label className="checkbox">
                <input type="checkbox" checked={archivierte} onChange={(e) => setArchivierte(e.target.checked)} />
                Archivierte zeigen
              </label>
            </div>

            {liste.length === 0 ? (
              <Card title="Nichts gefunden">
                <p className="muted">Mit diesen Filtern gibt es keinen Inhalt.</p>
              </Card>
            ) : (
              <ul className="social-inhalte">
                {liste.map((inhalt) => {
                  const slides = parseSlides(inhalt.slides);
                  return (
                    <li key={inhalt.id} className={inhalt.archiviert ? 'is-archived' : undefined}>
                      <Link to={`/social/inhalte/${inhalt.id}`} className="social-inhalt-karte">
                        <div className="social-inhalt-kopf">
                          <span className="social-kennung">{inhalt.kennung || '–'}</span>
                          <SaeuleBadge nr={inhalt.saeule} />
                          <InhaltStatusBadge status={inhalt.status} />
                          {inhalt.archiviert && <span className="badge archived">Archiviert</span>}
                        </div>
                        <h3>{inhalt.titel}</h3>
                        {inhalt.hook && <p className="social-hook">{inhalt.hook}</p>}
                        <p className="row-sub">
                          {INHALT_ARTEN.find((a) => a.wert === inhalt.art)?.label ?? inhalt.art}
                          {inhalt.serie && ` · ${inhalt.serie}`}
                          {slides.length > 0 && ` · ${slides.length} ${inhalt.art === 'reel' ? 'Beats' : 'Slides'}`}
                        </p>
                        {inhalt.hinweis && <p className="muted small">{inhalt.hinweis}</p>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {neu && <InhaltNeuDialog aendern={aendern} onClose={() => setNeu(false)} onAngelegt={(id) => navigate(`/social/inhalte/${id}`)} />}
          </>
        );
      }}
    </SocialSeite>
  );
}
