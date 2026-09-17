import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toasts';
import { ErrorBox, Field, FormError, Loading, PageHeader } from '../components/ui';
import { aktiveLeistungen } from '../data/anschreiben';
import type { CrmService } from '../data/crm';
import { OUTREACH_STARTLISTE } from '../data/outreachStart';
import { EMPTY_OUTREACH_LEISTUNG_INPUT, type OutreachLeistung, type OutreachLeistungInput } from '../data/types';
import { errorMessage, fieldOf } from '../lib/errors';
import { useContactDaten } from './useContactDaten';

type Aendern = <T>(action: (s: CrmService) => Promise<T>) => Promise<T>;

function LeistungDialog({ leistung, aendern, onClose }: { leistung?: OutreachLeistung; aendern: Aendern; onClose(): void }) {
  const toast = useToast();
  const [werte, setWerte] = useState<OutreachLeistungInput>(() =>
    leistung ? { titel: leistung.titel, beschreibung: leistung.beschreibung, anlass: leistung.anlass, nutzen: leistung.nutzen, beleg: leistung.beleg } : EMPTY_OUTREACH_LEISTUNG_INPUT,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const feld = (name: keyof OutreachLeistungInput) => ({
    value: werte[name],
    onChange: (e: { target: { value: string } }) => setWerte((w) => ({ ...w, [name]: e.target.value })),
  });

  const run = async (action: (s: CrmService) => Promise<unknown>, meldung: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await aendern(action);
      toast.show(meldung);
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const archivieren = () => {
    if (!leistung || (!leistung.archiviert && !window.confirm(`„${leistung.titel}“ archivieren? Sie verschwindet aus der Auswahl, bleibt aber im Sheet erhalten.`))) return;
    void run((s) => s.setOutreachLeistungArchiviert(leistung.id, !leistung.archiviert, leistung.geaendert_am), leistung.archiviert ? 'Wiederhergestellt' : 'Archiviert');
  };

  return (
    <Dialog
      title={leistung ? 'Leistung bearbeiten' : 'Neue Leistung'}
      onClose={onClose}
      onSubmit={() => run((s) => s.saveOutreachLeistung(werte, leistung && { id: leistung.id, expectedGeaendertAm: leistung.geaendert_am }), leistung ? 'Leistung gespeichert' : 'Leistung angelegt')}
      busy={busy}
      wide
      extraActions={
        leistung && (
          <button type="button" className="button subtle" onClick={archivieren} disabled={busy}>
            {leistung.archiviert ? 'Wiederherstellen' : 'Archivieren'}
          </button>
        )
      }
    >
      <div className="grid">
        <Field label="Titel" invalid={fieldOf(error) === 'titel'} wide>
          <input {...feld('titel')} placeholder="z. B. Shopify Migration" autoComplete="off" />
        </Field>
        <Field label="Beschreibung" hint="Was die Leistung umfasst" wide>
          <textarea rows={3} {...feld('beschreibung')} />
        </Field>
        <Field label="Anlass" hint="Welches Problem oder welcher Anlass passt">
          <textarea rows={3} {...feld('anlass')} />
        </Field>
        <Field label="Nutzen" hint="Was der Kunde davon hat, in 1–2 Sätzen">
          <textarea rows={3} {...feld('nutzen')} />
        </Field>
        <Field label="Beleg" hint="Referenz oder Zahl. Kundennamen nur mit Freigabe – Claude übernimmt, was hier steht." wide>
          <textarea rows={2} {...feld('beleg')} />
        </Field>
      </div>
      <FormError error={error} />
    </Dialog>
  );
}

export function OutreachLeistungenPage() {
  const { data, error, loading, reload, aendern } = useContactDaten();
  const toast = useToast();
  const [offen, setOffen] = useState<{ leistung?: OutreachLeistung } | null>(null);
  const [archivierte, setArchivierte] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!data) {
    return <div className="page narrow">{error ? <ErrorBox error={error} onRetry={reload} /> : loading && <Loading label="Leistungen werden geladen …" />}</div>;
  }

  const aktive = aktiveLeistungen(data.leistungen);
  const liste = archivierte ? [...aktive, ...data.leistungen.filter((l) => l.archiviert)] : aktive;

  const startliste = async () => {
    setBusy(true);
    try {
      await aendern((s) => s.uebernimmOutreachStartliste());
      toast.show('Startliste übernommen');
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <PageHeader
        eyebrow="Contact Generator"
        title="Leistungen"
        subtitle="Was wir in ersten Nachrichten anbieten. Anlass, Nutzen und Beleg gehen an Claude, damit der Text konkret wird. Unabhängig vom Leistungskatalog des Angebots-Rechners."
        actions={
          <button type="button" className="button primary" onClick={() => setOffen({})}>
            Leistung anlegen
          </button>
        }
      />
      {error && <ErrorBox error={error} onRetry={reload} />}

      {data.leistungen.length === 0 ? (
        <section className="card empty">
          <p>Noch keine Leistungen hinterlegt.</p>
          <p className="muted">Die Startliste enthält {OUTREACH_STARTLISTE.map((l) => l.titel).join(', ')} – mit Vorschlägen für Beschreibung, Anlass und Nutzen.</p>
          <div className="empty-actions">
            <button type="button" className="button primary" disabled={busy} onClick={startliste}>
              {busy ? 'Übernimmt …' : 'Startliste übernehmen'}
            </button>
            <button type="button" className="button" onClick={() => setOffen({})}>
              Leer beginnen
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="filters">
            <label className="checkbox">
              <input type="checkbox" checked={archivierte} onChange={(e) => setArchivierte(e.target.checked)} />
              Archivierte zeigen
            </label>
          </div>
          <section className="card">
            <ul className="outreach-liste">
              {liste.map((l) => (
                <li key={l.id} className={l.archiviert ? 'is-archived' : undefined}>
                  <div>
                    <h3>
                      <button type="button" className="link-button strong" onClick={() => setOffen({ leistung: l })}>
                        {l.titel}
                      </button>{' '}
                      {l.archiviert && <span className="badge archived">Archiviert</span>}
                      {!l.anlass && !l.nutzen && !l.beleg && <span className="badge warn">ohne Anlass, Nutzen, Beleg</span>}
                    </h3>
                    {l.beschreibung && <p className="muted small">{l.beschreibung}</p>}
                    <dl>
                      {(['anlass', 'nutzen', 'beleg'] as const).map(
                        (feld) =>
                          l[feld] && (
                            <div key={feld}>
                              <dt>{feld === 'anlass' ? 'Anlass' : feld === 'nutzen' ? 'Nutzen' : 'Beleg'}</dt>
                              <dd>{l[feld]}</dd>
                            </div>
                          ),
                      )}
                    </dl>
                  </div>
                  <button type="button" className="button small" onClick={() => setOffen({ leistung: l })}>
                    Bearbeiten
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {offen && <LeistungDialog leistung={offen.leistung} aendern={aendern} onClose={() => setOffen(null)} />}
    </div>
  );
}
