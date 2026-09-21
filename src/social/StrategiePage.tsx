import { useState } from 'react';
import { useToast } from '../components/Toasts';
import { Card } from '../components/ui';
import { SAEULEN, inhaltById, inhaltName, sortiereHooks, sortiereTexte } from '../data/social';
import type { SocialHook, SocialText } from '../data/types';
import { errorMessage } from '../lib/errors';
import { HookDialog, TextDialog } from './Dialoge';
import { SaeuleBadge, SocialSeite } from './SocialTeile';
import type { Aendern } from './useSocial';

function HookZeile({ hook, inhaltTitel, aendern, onBearbeiten }: { hook: SocialHook; inhaltTitel: string | null; aendern: Aendern; onBearbeiten(): void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const benutzt = hook.status === 'benutzt';

  const umschalten = async () => {
    setBusy(true);
    try {
      await aendern((s) =>
        s.saveHook({ saeule: hook.saeule, text: hook.text, status: benutzt ? 'frei' : 'benutzt', inhalt_id: hook.inhalt_id }, { id: hook.id, expectedGeaendertAm: hook.geaendert_am }),
      );
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={[benutzt ? 'is-erledigt' : '', hook.archiviert ? 'is-archived' : ''].filter(Boolean).join(' ') || undefined}>
      <input type="checkbox" checked={benutzt} disabled={busy} onChange={() => void umschalten()} aria-label={`${hook.text} benutzt`} />
      <div className="task-body">
        <button type="button" className="link-button" onClick={onBearbeiten}>
          {hook.text}
        </button>
        {inhaltTitel && <div className="row-sub">benutzt in {inhaltTitel}</div>}
      </div>
    </li>
  );
}

export function SocialStrategiePage() {
  const [dialog, setDialog] = useState<{ art: 'text'; text?: SocialText } | { art: 'hook'; hook?: SocialHook } | null>(null);
  const [archivierte, setArchivierte] = useState(false);

  return (
    <SocialSeite
      title="Strategie"
      subtitle="Fundament, Kanäle, Säulen, Formate und Rollen. Alles bearbeitbar – wenn sich der Plan ändert, ändert er sich hier."
      actions={
        <button type="button" className="button primary" onClick={() => setDialog({ art: 'text' })}>
          Abschnitt anlegen
        </button>
      }
    >
      {(daten, aendern) => {
        const texte = sortiereTexte(daten.texte, archivierte);
        const hooks = sortiereHooks(daten.hooks, archivierte);

        return (
          <>
            <div className="filters">
              <label className="checkbox">
                <input type="checkbox" checked={archivierte} onChange={(e) => setArchivierte(e.target.checked)} />
                Archivierte zeigen
              </label>
            </div>

            {texte.map((text) => (
              <Card
                key={text.id}
                className={text.archiviert ? 'is-archived' : ''}
                title={
                  <>
                    {text.titel} {text.archiviert && <span className="badge archived">Archiviert</span>}
                  </>
                }
                actions={
                  <button type="button" className="button small" onClick={() => setDialog({ art: 'text', text })}>
                    Bearbeiten
                  </button>
                }
              >
                <p className="notiz">{text.text}</p>
              </Card>
            ))}

            <Card
              title={
                <>
                  Hook-Bibliothek <span className="count">{hooks.filter((h) => h.status !== 'benutzt').length} frei</span>
                </>
              }
              actions={
                <button type="button" className="button small" onClick={() => setDialog({ art: 'hook' })}>
                  Hook anlegen
                </button>
              }
            >
              <p className="muted small">Abhaken, sobald ein Post den Hook trägt. So wiederholt ihr euch nicht.</p>
              {hooks.length === 0 ? (
                <p className="muted">Keine Hooks hinterlegt.</p>
              ) : (
                SAEULEN.map((saeule) => {
                  const eigene = hooks.filter((h) => h.saeule === saeule.nr);
                  if (eigene.length === 0) return null;
                  return (
                    <div key={saeule.nr} className="social-hook-gruppe">
                      <h3 className="subheading">
                        <SaeuleBadge nr={saeule.nr} /> {saeule.name}
                      </h3>
                      <ul className="task-list social-hooks">
                        {eigene.map((hook) => {
                          const inhalt = inhaltById(daten.inhalte, hook.inhalt_id);
                          return (
                            <HookZeile
                              key={hook.id}
                              hook={hook}
                              inhaltTitel={inhalt ? inhaltName(inhalt) : null}
                              aendern={aendern}
                              onBearbeiten={() => setDialog({ art: 'hook', hook })}
                            />
                          );
                        })}
                      </ul>
                    </div>
                  );
                })
              )}
              {hooks.some((h) => h.saeule === null) && (
                <div className="social-hook-gruppe">
                  <h3 className="subheading">Ohne Säule</h3>
                  <ul className="task-list social-hooks">
                    {hooks
                      .filter((h) => h.saeule === null)
                      .map((hook) => (
                        <HookZeile key={hook.id} hook={hook} inhaltTitel={null} aendern={aendern} onBearbeiten={() => setDialog({ art: 'hook', hook })} />
                      ))}
                  </ul>
                </div>
              )}
            </Card>

            {dialog?.art === 'text' && <TextDialog text={dialog.text} aendern={aendern} onClose={() => setDialog(null)} />}
            {dialog?.art === 'hook' && <HookDialog hook={dialog.hook} inhalte={daten.inhalte} aendern={aendern} onClose={() => setDialog(null)} />}
          </>
        );
      }}
    </SocialSeite>
  );
}
