import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toasts';
import { ErrorBox, Field, FormError, Loading, PageHeader } from '../components/ui';
import type { CrmService } from '../data/crm';
import { dmLink, dmText, magnetZahlen, RESSOURCEN_BASIS } from '../data/magnete';
import type { Magnet, MagnetInput, MagnetLead } from '../data/types';
import { errorMessage, fieldOf } from '../lib/errors';
import { useMagnetDaten } from './useMagnetDaten';

type Aendern = <T>(action: (s: CrmService) => Promise<T>) => Promise<T>;

const LEER: MagnetInput = { slug: '', titel: '', beschreibung: '', stichwort: '', datei_url: '', mail_betreff: '', mail_text: '', aktiv: false };

function MagnetDialog({ magnet, hatLeads, aendern, onClose }: { magnet?: Magnet; hatLeads: boolean; aendern: Aendern; onClose(): void }) {
  const toast = useToast();
  const [werte, setWerte] = useState<MagnetInput>(() =>
    magnet
      ? { slug: magnet.slug, titel: magnet.titel, beschreibung: magnet.beschreibung, stichwort: magnet.stichwort, datei_url: magnet.datei_url, mail_betreff: magnet.mail_betreff, mail_text: magnet.mail_text, aktiv: magnet.aktiv }
      : LEER,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const feld = (name: Exclude<keyof MagnetInput, 'aktiv'>) => ({
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

  const speichern = () => {
    if (magnet && hatLeads && werte.slug.trim() !== magnet.slug && !window.confirm('Die Adresse ändern? Links, die schon verschickt sind, führen dann ins Leere, und die bisherigen Einträge hängen nicht mehr an diesem Magneten.')) return;
    void run((s) => s.saveMagnet(werte, magnet && { id: magnet.id, expectedGeaendertAm: magnet.geaendert_am }), magnet ? 'Magnet gespeichert' : 'Magnet angelegt');
  };

  const archivieren = () => {
    if (!magnet || (!magnet.archiviert && !window.confirm(`„${magnet.titel}“ archivieren? Er verschickt dann keine Mails mehr; Einträge bleiben erhalten.`))) return;
    void run((s) => s.setMagnetArchiviert(magnet.id, !magnet.archiviert, magnet.geaendert_am), magnet.archiviert ? 'Wiederhergestellt' : 'Archiviert');
  };

  return (
    <Dialog
      title={magnet ? 'Magnet bearbeiten' : 'Neuer Magnet'}
      onClose={onClose}
      onSubmit={speichern}
      busy={busy}
      wide
      extraActions={
        magnet && (
          <button type="button" className="button subtle" onClick={archivieren} disabled={busy}>
            {magnet.archiviert ? 'Wiederherstellen' : 'Archivieren'}
          </button>
        )
      }
    >
      <div className="grid">
        <Field label="Titel" hint="So heißt der Magnet in der Mail, z. B. „Shopify-Ops-Skillset“" invalid={fieldOf(error) === 'titel'} wide>
          <input {...feld('titel')} autoComplete="off" />
        </Field>
        <Field label="Adresse" hint={`${RESSOURCEN_BASIS}${werte.slug.trim() || '…'}/ – muss zur Datei _ressourcen/<adresse>.md im Website-Repo passen`} invalid={fieldOf(error) === 'slug'}>
          <input {...feld('slug')} placeholder="shopify-skills" autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="Stichwort" hint="Was unter den Post kommentiert wird">
          <input {...feld('stichwort')} placeholder="SKILLS" autoComplete="off" />
        </Field>
        <Field label="Datei-Link" hint="Google-Drive-Datei oder -Ordner, freigegeben für „Jeder mit dem Link“ (nur Betrachter)" invalid={fieldOf(error) === 'datei_url'} wide>
          <input {...feld('datei_url')} type="url" placeholder="https://drive.google.com/…" autoComplete="off" />
        </Field>
        <Field label="Betreff der Mail" hint="Leer: „Dein Download: <Titel>“" wide>
          <input {...feld('mail_betreff')} autoComplete="off" />
        </Field>
        <Field label="Text der Mail" hint="Steht nach „Hi <Vorname>,“ und vor dem Download-Knopf. Leerzeile = neuer Absatz. Leer: Standardtext." wide>
          <textarea rows={5} {...feld('mail_text')} />
        </Field>
        <Field label="Notiz (intern)" hint="Was drin ist, für wen" wide>
          <textarea rows={2} {...feld('beschreibung')} />
        </Field>
        <Field label="Status" invalid={fieldOf(error) === 'datei_url' && werte.aktiv}>
          <label className="checkbox">
            <input type="checkbox" checked={werte.aktiv} onChange={(e) => setWerte((w) => ({ ...w, aktiv: e.target.checked }))} />
            Aktiv – Einträge bekommen die Mail mit dem Download
          </label>
        </Field>
      </div>
      <FormError error={error} />
    </Dialog>
  );
}

function MagnetZeile({ magnet, leads, onBearbeiten }: { magnet: Magnet; leads: MagnetLead[]; onBearbeiten(): void }) {
  const toast = useToast();
  const zahlen = magnetZahlen(leads);
  const kopiere = async (text: string, meldung: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(meldung);
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    }
  };

  return (
    <li className={magnet.archiviert ? 'is-archived' : undefined}>
      <div>
        <h3>
          <button type="button" className="link-button strong" onClick={onBearbeiten}>
            {magnet.titel}
          </button>{' '}
          {magnet.archiviert ? (
            <span className="badge archived">Archiviert</span>
          ) : magnet.aktiv ? (
            <span className="badge ok">Aktiv</span>
          ) : (
            <span className="badge subtle">Inaktiv</span>
          )}
          {magnet.stichwort && <span className="badge subtle">{magnet.stichwort}</span>}
        </h3>
        <p className="muted small">
          <a href={`${RESSOURCEN_BASIS}${magnet.slug}/`} target="_blank" rel="noreferrer">
            velonify.de/ressourcen/{magnet.slug}/
          </a>
          {' · '}
          {zahlen.eintraege} Einträge, {zahlen.geladen} geladen, {zahlen.newsletter} Newsletter, {zahlen.uebernommen} im CRM
        </p>
        {magnet.beschreibung && <p className="muted small">{magnet.beschreibung}</p>}
        {!magnet.archiviert && (
          <div className="magnet-aktionen">
            <button type="button" className="button small" onClick={() => kopiere(dmLink(magnet.slug), 'DM-Link kopiert')}>
              DM-Link kopieren
            </button>
            <button type="button" className="button small" onClick={() => kopiere(dmText(magnet), 'DM-Text kopiert – [Vorname] noch ersetzen')}>
              DM-Text kopieren
            </button>
            {magnet.datei_url && (
              <a className="button small subtle" href={magnet.datei_url} target="_blank" rel="noreferrer">
                Datei öffnen
              </a>
            )}
          </div>
        )}
      </div>
      <button type="button" className="button small" onClick={onBearbeiten}>
        Bearbeiten
      </button>
    </li>
  );
}

export function MagnetePage() {
  const { data, error, loading, reload, aendern } = useMagnetDaten();
  const [offen, setOffen] = useState<{ magnet?: Magnet } | null>(null);
  const [archivierte, setArchivierte] = useState(false);

  if (!data) {
    return <div className="page narrow">{error ? <ErrorBox error={error} onRetry={reload} /> : loading && <Loading label="Magnete werden geladen …" />}</div>;
  }

  const sortiert = [...data.magnete].sort((a, b) => (a.sortierung ?? 0) - (b.sortierung ?? 0));
  const liste = sortiert.filter((m) => archivierte || !m.archiviert);
  const leadsVon = (slug: string) => data.leads.filter((l) => l.magnet === slug);

  return (
    <div className="page narrow">
      <PageHeader
        eyebrow="Lead-Magnete"
        title="Magnete"
        subtitle="Was es zum Herunterladen gibt. Der Hub liefert Datei-Link und Mailtext, die Landingpage kommt aus dem Website-Repo. Nach einem Kommentar den DM-Link kopieren und von Hand schicken."
        actions={
          <button type="button" className="button primary" onClick={() => setOffen({})}>
            Magnet anlegen
          </button>
        }
      />

      {data.magnete.length === 0 ? (
        <section className="card empty">
          <p>Noch kein Magnet angelegt.</p>
          <p className="muted">
            Ein Magnet braucht drei Dinge: die Datei in Google Drive (freigegeben per Link), eine Zeile hier und die Landingpage _ressourcen/&lt;adresse&gt;.md im
            Website-Repo.
          </p>
          <div className="empty-actions">
            <button type="button" className="button primary" onClick={() => setOffen({})}>
              Ersten Magneten anlegen
            </button>
          </div>
        </section>
      ) : (
        <>
          {data.magnete.some((m) => m.archiviert) && (
            <div className="filters">
              <label className="checkbox">
                <input type="checkbox" checked={archivierte} onChange={(e) => setArchivierte(e.target.checked)} />
                Archivierte zeigen
              </label>
            </div>
          )}
          <section className="card">
            <ul className="outreach-liste">
              {liste.map((m) => (
                <MagnetZeile key={m.id} magnet={m} leads={leadsVon(m.slug)} onBearbeiten={() => setOffen({ magnet: m })} />
              ))}
            </ul>
          </section>
        </>
      )}

      {offen && <MagnetDialog magnet={offen.magnet} hatLeads={offen.magnet ? leadsVon(offen.magnet.slug).length > 0 : false} aendern={aendern} onClose={() => setOffen(null)} />}
    </div>
  );
}
