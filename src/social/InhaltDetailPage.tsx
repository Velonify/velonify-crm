import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../components/Toasts';
import { Card, Field, FormError } from '../components/ui';
import {
  INHALT_ARTEN,
  INHALT_STATUS,
  LEERE_SLIDE,
  SAEULEN,
  formatLabel,
  inhaltName,
  kanalLabel,
  parseSlides,
  sortierePlan,
} from '../data/social';
import type { SocialInhalt, SocialInhaltInput, SocialSlide } from '../data/types';
import { errorMessage, fieldOf } from '../lib/errors';
import { formatDate } from '../lib/format';
import { InhaltStatusBadge, SaeuleBadge, SocialSeite } from './SocialTeile';
import type { Aendern } from './useSocial';

const alsEingabe = (inhalt: SocialInhalt): SocialInhaltInput => ({
  kennung: inhalt.kennung,
  art: inhalt.art,
  serie: inhalt.serie,
  saeule: inhalt.saeule,
  titel: inhalt.titel,
  ziel: inhalt.ziel,
  hook: inhalt.hook,
  slides: parseSlides(inhalt.slides),
  caption: inhalt.caption,
  cta: inhalt.cta,
  hashtags: inhalt.hashtags,
  alt_text: inhalt.alt_text,
  ton: inhalt.ton,
  material: inhalt.material,
  hinweis: inhalt.hinweis,
  status: inhalt.status,
});

/** Slides of a carousel, beats of a reel: same table, the reel gets the voice-over column on top. */
function SlideEditor({ art, slides, onChange }: { art: string; slides: SocialSlide[]; onChange(slides: SocialSlide[]): void }) {
  const reel = art === 'reel';
  const setze = (index: number, feld: keyof SocialSlide, wert: string) => onChange(slides.map((slide, i) => (i === index ? { ...slide, [feld]: wert } : slide)));
  const verschiebe = (index: number, richtung: -1 | 1) => {
    const ziel = index + richtung;
    if (ziel < 0 || ziel >= slides.length) return;
    const kopie = [...slides];
    [kopie[index], kopie[ziel]] = [kopie[ziel], kopie[index]];
    onChange(kopie);
  };

  return (
    <div className="social-slides bearbeitbar">
      {slides.map((slide, index) => (
        <div key={index} className="social-slide">
          <div className="social-slide-kopf">
            <input
              className="social-slide-label"
              value={slide.label}
              onChange={(e) => setze(index, 'label', e.target.value)}
              placeholder={reel ? '0–2' : `${index + 1}`}
              aria-label="Nummer oder Zeit"
            />
            <div className="move-buttons">
              <button type="button" className="icon-button small" onClick={() => verschiebe(index, -1)} disabled={index === 0} aria-label="Nach oben">
                ↑
              </button>
              <button type="button" className="icon-button small" onClick={() => verschiebe(index, 1)} disabled={index === slides.length - 1} aria-label="Nach unten">
                ↓
              </button>
              <button type="button" className="icon-button small" onClick={() => onChange(slides.filter((_, i) => i !== index))} aria-label="Entfernen">
                ×
              </button>
            </div>
          </div>
          <label className="field wide">
            <span className="field-label">{reel ? 'On-Screen-Text' : 'Text'}</span>
            <textarea rows={3} value={slide.text} onChange={(e) => setze(index, 'text', e.target.value)} />
          </label>
          <label className="field wide">
            <span className="field-label">{reel ? 'Bild / Shotlist' : 'Gestaltung'}</span>
            <textarea rows={2} value={slide.gestaltung} onChange={(e) => setze(index, 'gestaltung', e.target.value)} />
          </label>
          {reel && (
            <label className="field wide">
              <span className="field-label">Sprechertext</span>
              <textarea rows={2} value={slide.sprecher} onChange={(e) => setze(index, 'sprecher', e.target.value)} />
            </label>
          )}
        </div>
      ))}
      <button type="button" className="button small" onClick={() => onChange([...slides, { ...LEERE_SLIDE }])}>
        {reel ? 'Beat hinzufügen' : 'Slide hinzufügen'}
      </button>
    </div>
  );
}

function Formular({ inhalt, aendern, onFertig }: { inhalt: SocialInhalt; aendern: Aendern; onFertig(): void }) {
  const toast = useToast();
  const [werte, setWerte] = useState<SocialInhaltInput>(() => alsEingabe(inhalt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const setze = <K extends keyof SocialInhaltInput>(feld: K, wert: SocialInhaltInput[K]) => setWerte((w) => ({ ...w, [feld]: wert }));
  const reel = werte.art === 'reel';

  const speichern = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await aendern((s) => s.saveInhalt(werte, { id: inhalt.id, expectedGeaendertAm: inhalt.geaendert_am }));
      toast.show('Inhalt gespeichert');
      onFertig();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form
      className="social-inhalt-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void speichern();
      }}
      noValidate
    >
      <Card title="Grunddaten">
        <div className="grid">
          <Field label="Kennung">
            <input value={werte.kennung} onChange={(e) => setze('kennung', e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Art">
            <select value={werte.art} onChange={(e) => setze('art', e.target.value)}>
              {INHALT_ARTEN.map((a) => (
                <option key={a.wert} value={a.wert}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Titel" invalid={fieldOf(error) === 'titel'} wide>
            <input value={werte.titel} onChange={(e) => setze('titel', e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Serie">
            <input value={werte.serie} onChange={(e) => setze('serie', e.target.value)} autoComplete="off" placeholder="UMZUGSPLAN #2" />
          </Field>
          <Field label="Säule">
            <select value={werte.saeule ?? ''} onChange={(e) => setze('saeule', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Keine</option>
              {SAEULEN.map((s) => (
                <option key={s.nr} value={s.nr}>
                  {s.nr} · {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select value={werte.status} onChange={(e) => setze('status', e.target.value)}>
              {INHALT_STATUS.map((s) => (
                <option key={s.wert} value={s.wert}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ziel" hint="Wofür dieser Post da ist" wide>
            <input value={werte.ziel} onChange={(e) => setze('ziel', e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Hook" hint={reel ? 'Die ersten zwei Sekunden' : 'Die Überschrift auf Slide 1'} wide>
            <textarea rows={2} value={werte.hook} onChange={(e) => setze('hook', e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title={reel ? 'Beats' : werte.art === 'story' ? 'Frames' : 'Slides'}>
        <SlideEditor art={werte.art} slides={werte.slides} onChange={(slides) => setze('slides', slides)} />
      </Card>

      <Card title="Text und Ausspielung">
        <div className="grid">
          <Field label="Caption" wide>
            <textarea rows={12} value={werte.caption} onChange={(e) => setze('caption', e.target.value)} />
          </Field>
          <Field label="CTA">
            <input value={werte.cta} onChange={(e) => setze('cta', e.target.value)} autoComplete="off" />
          </Field>
          <Field label={reel ? 'Ton' : werte.art === 'story' ? 'Interaktion' : 'Ton'}>
            <input value={werte.ton} onChange={(e) => setze('ton', e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Hashtags" wide>
            <textarea rows={2} value={werte.hashtags} onChange={(e) => setze('hashtags', e.target.value)} />
          </Field>
          <Field label="Alt-Text" hint="Beschreibt, was zu sehen ist – Pflicht bei jedem Post" wide>
            <textarea rows={3} value={werte.alt_text} onChange={(e) => setze('alt_text', e.target.value)} />
          </Field>
          <Field label="Material" hint="Was aufgenommen oder freigegeben sein muss" wide>
            <textarea rows={2} value={werte.material} onChange={(e) => setze('material', e.target.value)} />
          </Field>
          <Field label="Hinweis" wide>
            <textarea rows={2} value={werte.hinweis} onChange={(e) => setze('hinweis', e.target.value)} />
          </Field>
        </div>
      </Card>

      <FormError error={error} />
      <div className="social-form-aktionen">
        <button type="button" className="button" onClick={onFertig} disabled={busy}>
          Abbrechen
        </button>
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'Speichert …' : 'Speichern'}
        </button>
      </div>
    </form>
  );
}

function Ansicht({ inhalt }: { inhalt: SocialInhalt }) {
  const slides = parseSlides(inhalt.slides);
  const reel = inhalt.art === 'reel';

  return (
    <>
      {(inhalt.ziel || inhalt.hinweis || inhalt.material) && (
        <Card title="Worum es geht">
          <dl className="items">
            {inhalt.ziel && (
              <div className="item">
                <dt>Ziel</dt>
                <dd>{inhalt.ziel}</dd>
              </div>
            )}
            {inhalt.material && (
              <div className="item">
                <dt>Material</dt>
                <dd>{inhalt.material}</dd>
              </div>
            )}
            {inhalt.hinweis && (
              <div className="item">
                <dt>Hinweis</dt>
                <dd>{inhalt.hinweis}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      {slides.length > 0 && (
        <Card
          title={
            <>
              {reel ? 'Beats' : inhalt.art === 'story' ? 'Frames' : 'Slides'} <span className="count">{slides.length}</span>
            </>
          }
        >
          <ol className="social-slides">
            {slides.map((slide, index) => (
              <li key={index} className="social-slide">
                <div className="social-slide-kopf">
                  <span className="social-slide-nummer">{slide.label || index + 1}</span>
                </div>
                {slide.text && <p className="social-slide-text">{slide.text}</p>}
                {slide.gestaltung && (
                  <p className="muted small">
                    <strong className="label-text">{reel ? 'Bild' : 'Gestaltung'}</strong> {slide.gestaltung}
                  </p>
                )}
                {slide.sprecher && (
                  <p className="muted small">
                    <strong className="label-text">Sprecher</strong> {slide.sprecher}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {inhalt.caption && (
        <Card title="Caption">
          <p className="notiz">{inhalt.caption}</p>
        </Card>
      )}

      <Card title="Ausspielung">
        <dl className="items">
          {inhalt.cta && (
            <div className="item">
              <dt>CTA</dt>
              <dd>{inhalt.cta}</dd>
            </div>
          )}
          {inhalt.ton && (
            <div className="item">
              <dt>{reel ? 'Ton' : inhalt.art === 'story' ? 'Interaktion' : 'Ton'}</dt>
              <dd>{inhalt.ton}</dd>
            </div>
          )}
          {inhalt.hashtags && (
            <div className="item">
              <dt>Hashtags</dt>
              <dd>{inhalt.hashtags}</dd>
            </div>
          )}
          {inhalt.alt_text ? (
            <div className="item">
              <dt>Alt-Text</dt>
              <dd>{inhalt.alt_text}</dd>
            </div>
          ) : (
            <div className="item">
              <dt>Alt-Text</dt>
              <dd className="muted">Fehlt noch – ohne Alt-Text geht kein Post raus.</dd>
            </div>
          )}
        </dl>
      </Card>
    </>
  );
}

export function SocialInhaltDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const [bearbeiten, setBearbeiten] = useState(false);

  return (
    <SocialSeite title="Inhalt">
      {(daten, aendern) => {
        const inhalt = daten.inhalte.find((i) => i.id === id);
        if (!inhalt) {
          return (
            <Card title="Nicht gefunden">
              <p className="muted">Diesen Inhalt gibt es nicht mehr.</p>
              <div className="empty-actions">
                <Link to="/social/inhalte" className="button">
                  Zur Übersicht
                </Link>
              </div>
            </Card>
          );
        }

        const termine = sortierePlan(daten.plan).filter((e) => e.inhalt_id === inhalt.id);
        const archivieren = async () => {
          if (!inhalt.archiviert && !window.confirm(`„${inhaltName(inhalt)}“ archivieren? Er verschwindet aus der Liste, bleibt aber im Sheet.`)) return;
          try {
            await aendern((s) => s.setInhaltArchiviert(inhalt.id, !inhalt.archiviert, inhalt.geaendert_am));
            toast.show(inhalt.archiviert ? 'Wiederhergestellt' : 'Archiviert');
          } catch (err) {
            toast.show(errorMessage(err), 'error');
          }
        };

        return (
          <>
            <div className="social-detail-kopf">
              <div>
                <div className="social-inhalt-kopf">
                  <span className="social-kennung">{inhalt.kennung || '–'}</span>
                  <SaeuleBadge nr={inhalt.saeule} />
                  <InhaltStatusBadge status={inhalt.status} />
                  {inhalt.archiviert && <span className="badge archived">Archiviert</span>}
                </div>
                <h2>{inhalt.titel}</h2>
                <p className="row-sub">
                  {INHALT_ARTEN.find((a) => a.wert === inhalt.art)?.label ?? inhalt.art}
                  {inhalt.serie && ` · ${inhalt.serie}`}
                </p>
                {inhalt.hook && <p className="social-hook gross">{inhalt.hook}</p>}
              </div>
              {!bearbeiten && (
                <div className="page-actions">
                  <button type="button" className="button subtle" onClick={() => void archivieren()}>
                    {inhalt.archiviert ? 'Wiederherstellen' : 'Archivieren'}
                  </button>
                  <button type="button" className="button primary" onClick={() => setBearbeiten(true)}>
                    Bearbeiten
                  </button>
                </div>
              )}
            </div>

            {bearbeiten ? (
              <Formular key={inhalt.geaendert_am} inhalt={inhalt} aendern={aendern} onFertig={() => setBearbeiten(false)} />
            ) : (
              <>
                <Ansicht inhalt={inhalt} />
                <Card title="Steht im Plan">
                  {termine.length === 0 ? (
                    <p className="muted">
                      Noch kein Termin. Im <Link to="/social/plan">Redaktionsplan</Link> lässt sich einer anlegen und auf diesen Inhalt zeigen.
                    </p>
                  ) : (
                    <ul className="social-termine">
                      {termine.map((termin) => (
                        <li key={termin.id}>
                          <span className="row-title">{formatDate(termin.datum)}</span>
                          <span className="row-sub">
                            {kanalLabel(termin.kanal)} · {formatLabel(termin.format)} · {termin.thema}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </>
            )}
          </>
        );
      }}
    </SocialSeite>
  );
}
