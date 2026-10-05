import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toasts';
import { ErrorBox, Field, FormError, Loading, PageHeader } from '../components/ui';
import type { CrmService } from '../data/crm';
import { dmLink, dmText, magnetZahlen, RESSOURCEN_BASIS } from '../data/magnete';
import { istAuditMagnet, roastPlaetze } from '../data/roast';
import type { Magnet, MagnetInput, MagnetLead } from '../data/types';
import { errorMessage, fieldOf } from '../lib/errors';
import { useMagnetDaten } from './useMagnetDaten';

type Aendern = <T>(action: (s: CrmService) => Promise<T>) => Promise<T>;

const LEER: MagnetInput = {
  slug: '', titel: '', beschreibung: '', stichwort: '', datei_url: '', mail_betreff: '', mail_text: '', aktiv: false, untertitel: '', inhalt: '', knopf: '',
  typ: 'datei', plaetze: null,
};

const INHALT_BEISPIEL = '## Was drin ist\n- Lieferantendaten rein, fertige Produkttexte raus\n- Matrixify-Import vorher auf Fehler prüfen\n\n## Für wen\nE-Com-Manager in Shopify-Shops.';

function MagnetDialog({ magnet, hatLeads, aendern, onClose }: { magnet?: Magnet; hatLeads: boolean; aendern: Aendern; onClose(): void }) {
  const toast = useToast();
  const [werte, setWerte] = useState<MagnetInput>(() =>
    magnet
      ? {
          slug: magnet.slug, titel: magnet.titel, beschreibung: magnet.beschreibung, stichwort: magnet.stichwort, datei_url: magnet.datei_url,
          mail_betreff: magnet.mail_betreff, mail_text: magnet.mail_text, aktiv: magnet.aktiv, untertitel: magnet.untertitel, inhalt: magnet.inhalt, knopf: magnet.knopf,
          typ: magnet.typ === 'audit' ? 'audit' : 'datei', plaetze: magnet.plaetze,
        }
      : LEER,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const audit = werte.typ === 'audit';
  const feld = (name: Exclude<keyof MagnetInput, 'aktiv' | 'typ' | 'plaetze'>) => ({
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
        <p className="form-abschnitt">Magnet</p>
        <Field label="Titel" hint="Überschrift der Landingpage und Name in der Mail, z. B. „Shopify-Ops-Skillset“" invalid={fieldOf(error) === 'titel'} wide>
          <input {...feld('titel')} autoComplete="off" />
        </Field>
        <Field label="Adresse" hint={`${RESSOURCEN_BASIS}${werte.slug.trim() || '…'}/ – die Seite entsteht automatisch, sobald der Magnet aktiv ist`} invalid={fieldOf(error) === 'slug'}>
          <input {...feld('slug')} placeholder="shopify-skills" autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="Stichwort" hint="Was unter den Post kommentiert wird">
          <input {...feld('stichwort')} placeholder="SKILLS" autoComplete="off" />
        </Field>
        <Field label="Art" hint={audit ? 'Shop-Roast: Die Mail bestätigt nur. Ihr prüft den Shop im Hub und schickt den Report von Hand.' : 'Die Mail enthält den Download.'}>
          <select value={werte.typ} onChange={(e) => setWerte((w) => ({ ...w, typ: e.target.value === 'audit' ? 'audit' : 'datei' }))}>
            <option value="datei">Download</option>
            <option value="audit">Shop-Roast (Audit)</option>
          </select>
        </Field>
        {audit ? (
          <Field label="Plätze" hint="Danach kommt die Wartelisten-Mail; die Landingpage zeigt, wie viele noch frei sind. Leer = unbegrenzt." invalid={fieldOf(error) === 'plaetze'}>
            <input
              type="number"
              min={1}
              max={1000}
              value={werte.plaetze ?? ''}
              onChange={(e) => setWerte((w) => ({ ...w, plaetze: e.target.value === '' ? null : Number(e.target.value) }))}
              placeholder="30"
            />
          </Field>
        ) : (
          <Field label="Datei-Link" hint="Google-Drive-Datei oder -Ordner, freigegeben für „Jeder mit dem Link“ (nur Betrachter)" invalid={fieldOf(error) === 'datei_url'} wide>
            <input {...feld('datei_url')} type="url" placeholder="https://drive.google.com/…" autoComplete="off" />
          </Field>
        )}
        <p className="form-abschnitt">Landingpage</p>
        <Field label="Untertitel" hint="Ein Satz unter der Überschrift. Erscheint auch als Vorschautext, wenn der Link in einer DM geteilt wird." invalid={fieldOf(error) === 'untertitel'} wide>
          <textarea rows={2} {...feld('untertitel')} placeholder="8 Claude-Skills, die wir selbst jeden Tag im Shopify-Alltag nutzen – jeweils mit Anleitung." />
        </Field>
        <Field label="Was drin ist" hint="Text neben dem Formular. „- “ am Zeilenanfang ergibt eine Liste, „## “ eine Zwischenüberschrift, **so** wird fett. Leerzeile = neuer Absatz." wide>
          <textarea rows={8} {...feld('inhalt')} placeholder={INHALT_BEISPIEL} />
        </Field>
        <Field label="Text auf dem Knopf" hint="Leer: „Kostenlos anfordern“" invalid={fieldOf(error) === 'knopf'}>
          <input {...feld('knopf')} maxLength={40} autoComplete="off" />
        </Field>
        <p className="form-abschnitt">Mail</p>
        <Field label="Betreff der Mail" hint={audit ? 'Leer: „<Titel>: wir schauen uns <Shop> an“. Die Wartelisten-Mail hat einen festen Betreff.' : 'Leer: „Dein Download: <Titel>“'} wide>
          <input {...feld('mail_betreff')} autoComplete="off" />
        </Field>
        <Field
          label="Text der Mail"
          hint={audit ? 'Steht nach „Hi <Vorname>,“. Leer: Standardtext („Wir prüfen den Shop in vier Bereichen … innerhalb von zwei Werktagen“).' : 'Steht nach „Hi <Vorname>,“ und vor dem Download-Knopf. Leerzeile = neuer Absatz. Leer: Standardtext.'}
          wide
        >
          <textarea rows={5} {...feld('mail_text')} />
        </Field>
        <p className="form-abschnitt">Intern</p>
        <Field label="Notiz (intern)" hint="Nur hier im Hub sichtbar" wide>
          <textarea rows={2} {...feld('beschreibung')} />
        </Field>
        <Field label="Status" invalid={(fieldOf(error) === 'datei_url' || fieldOf(error) === 'untertitel') && werte.aktiv}>
          <label className="checkbox">
            <input type="checkbox" checked={werte.aktiv} onChange={(e) => setWerte((w) => ({ ...w, aktiv: e.target.checked }))} />
            {audit ? 'Aktiv – Landingpage ist online, Einträge bekommen die Bestätigung' : 'Aktiv – Landingpage ist online, Einträge bekommen die Mail mit dem Download'}
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
          {istAuditMagnet(magnet) ? (
            <>
              {magnet.plaetze !== null ? `${roastPlaetze(magnet, leads).vergeben} von ${magnet.plaetze} Plätzen` : `${zahlen.eintraege} Einträge`}
              {leads.some((l) => l.warteliste) && `, ${leads.filter((l) => l.warteliste).length} auf der Warteliste`}, {leads.filter((l) => l.report_gesendet_am).length} Reports gesendet,{' '}
              {zahlen.uebernommen} im CRM
            </>
          ) : (
            <>
              {zahlen.eintraege} Einträge, {zahlen.geladen} geladen, {zahlen.newsletter} Newsletter, {zahlen.uebernommen} im CRM
            </>
          )}
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
        subtitle="Was es zum Herunterladen gibt. Landingpage, Mail und Datei-Link kommen alle von hier: aktiv schalten genügt, die Seite auf velonify.de entsteht automatisch. Nach einem Kommentar den DM-Link kopieren und von Hand schicken."
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
            Ein Magnet braucht zwei Dinge: die Datei in Google Drive (freigegeben per Link) und einen Eintrag hier mit den Texten für Landingpage und Mail.
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
