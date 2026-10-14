import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toasts';
import { Field, FormError } from '../components/ui';
import type { CrmService } from '../data/crm';
import { LINK_ART_LABEL, NEWS_ART_LABEL } from '../data/kunden';
import type { Firma, KundenLink, KundenLinkArt, KundenLinkInput, KundenNews, KundenNewsArt, KundenNewsInput } from '../data/types';
import { fieldOf } from '../lib/errors';

export type Aendern = <T>(action: (s: CrmService) => Promise<T>) => Promise<T>;

function useSpeichern(aendern: Aendern, onClose: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
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
  return { busy, error, run };
}

export function LinkDialog({ firma, link, art, aendern, onClose }: { firma: Firma; link?: KundenLink; art: KundenLinkArt; aendern: Aendern; onClose(): void }) {
  const [werte, setWerte] = useState<KundenLinkInput>(() =>
    link
      ? { art: link.art, titel: link.titel, url: link.url, beschreibung: link.beschreibung, angeheftet: link.angeheftet, sichtbar_kunde: link.sichtbar_kunde }
      : { art, titel: '', url: '', beschreibung: '', angeheftet: false, sichtbar_kunde: false },
  );
  const { busy, error, run } = useSpeichern(aendern, onClose);
  const text = (name: 'titel' | 'url' | 'beschreibung') => ({
    value: werte[name],
    onChange: (e: { target: { value: string } }) => setWerte((w) => ({ ...w, [name]: e.target.value })),
  });

  const archivieren = () => {
    if (!link || (!link.archiviert && !window.confirm(`„${link.titel}“ archivieren?`))) return;
    void run((s) => s.setKundenLinkArchiviert(link.id, !link.archiviert, link.geaendert_am), link.archiviert ? 'Wiederhergestellt' : 'Archiviert');
  };

  return (
    <Dialog
      title={link ? 'Link bearbeiten' : `Neuer Link für ${firma.kuerzel || firma.name}`}
      onClose={onClose}
      onSubmit={() => run((s) => s.saveKundenLink(firma.id, werte, link && { id: link.id, expectedGeaendertAm: link.geaendert_am }), link ? 'Link gespeichert' : 'Link angelegt')}
      busy={busy}
      extraActions={
        link && (
          <button type="button" className="button subtle" onClick={archivieren} disabled={busy}>
            {link.archiviert ? 'Wiederherstellen' : 'Archivieren'}
          </button>
        )
      }
    >
      <div className="grid">
        <Field label="Titel" hint={werte.art === 'tool' ? 'z. B. Shopify-Admin, GA4, Klaviyo, Staging' : 'z. B. Brand-Guidelines, Briefing, Roadmap'} invalid={fieldOf(error) === 'titel'}>
          <input {...text('titel')} autoComplete="off" />
        </Field>
        <Field label="Art" invalid={fieldOf(error) === 'art'}>
          <select value={werte.art} onChange={(e) => setWerte((w) => ({ ...w, art: e.target.value as KundenLinkArt }))}>
            {(Object.keys(LINK_ART_LABEL) as KundenLinkArt[]).map((a) => (
              <option key={a} value={a}>
                {LINK_ART_LABEL[a]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Link" hint="Keine Passwörter oder Zugangsdaten – die bleiben im Passwortmanager." invalid={fieldOf(error) === 'url'} wide>
          <input {...text('url')} type="url" placeholder="https://…" autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="Beschreibung" hint="Optional, eine Zeile" wide>
          <input {...text('beschreibung')} autoComplete="off" />
        </Field>
        <Field label="Anzeige" wide>
          <label className="checkbox">
            <input type="checkbox" checked={werte.angeheftet} onChange={(e) => setWerte((w) => ({ ...w, angeheftet: e.target.checked }))} />
            In der Übersicht des Kunden anheften
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={werte.sichtbar_kunde} onChange={(e) => setWerte((w) => ({ ...w, sichtbar_kunde: e.target.checked }))} />
            Für den Kunden sichtbar (später im Kundenportal)
          </label>
        </Field>
      </div>
      <FormError error={error} />
    </Dialog>
  );
}

export function NewsDialog({
  news,
  firmaId,
  kunden,
  aendern,
  onClose,
}: {
  news?: KundenNews;
  /** Preselected client; empty means all clients. */
  firmaId: string;
  kunden: Firma[];
  aendern: Aendern;
  onClose(): void;
}) {
  const [werte, setWerte] = useState<KundenNewsInput>(() =>
    news
      ? { firma_id: news.firma_id, art: news.art, titel: news.titel, text: news.text, datum: news.datum, angeheftet: news.angeheftet, sichtbar_kunde: news.sichtbar_kunde }
      : { firma_id: firmaId, art: 'update', titel: '', text: '', datum: '', angeheftet: false, sichtbar_kunde: false },
  );
  const { busy, error, run } = useSpeichern(aendern, onClose);

  const archivieren = () => {
    if (!news || (!news.archiviert && !window.confirm(`„${news.titel}“ aus dem Ticker nehmen?`))) return;
    void run((s) => s.setKundenNewsArchiviert(news.id, !news.archiviert, news.geaendert_am), news.archiviert ? 'Wiederhergestellt' : 'Aus dem Ticker genommen');
  };

  return (
    <Dialog
      title={news ? 'Meldung bearbeiten' : 'Neue Meldung'}
      onClose={onClose}
      onSubmit={() => run((s) => s.saveKundenNews(werte, news && { id: news.id, expectedGeaendertAm: news.geaendert_am }), news ? 'Meldung gespeichert' : 'Meldung veröffentlicht')}
      busy={busy}
      extraActions={
        news && (
          <button type="button" className="button subtle" onClick={archivieren} disabled={busy}>
            {news.archiviert ? 'Wiederherstellen' : 'Archivieren'}
          </button>
        )
      }
    >
      <div className="grid">
        <Field label="Kunde">
          <select value={werte.firma_id} onChange={(e) => setWerte((w) => ({ ...w, firma_id: e.target.value }))}>
            <option value="">Alle Kunden</option>
            {kunden.map((k) => (
              <option key={k.id} value={k.id}>
                {k.kuerzel ? `${k.kuerzel} · ${k.name}` : k.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Art" invalid={fieldOf(error) === 'art'}>
          <select value={werte.art} onChange={(e) => setWerte((w) => ({ ...w, art: e.target.value as KundenNewsArt }))}>
            {(Object.keys(NEWS_ART_LABEL) as KundenNewsArt[]).map((a) => (
              <option key={a} value={a}>
                {NEWS_ART_LABEL[a]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Überschrift" hint="Läuft so durch den Ticker" invalid={fieldOf(error) === 'titel'} wide>
          <input value={werte.titel} onChange={(e) => setWerte((w) => ({ ...w, titel: e.target.value }))} maxLength={140} autoComplete="off" />
        </Field>
        <Field label="Details" hint="Optional" wide>
          <textarea rows={3} value={werte.text} onChange={(e) => setWerte((w) => ({ ...w, text: e.target.value }))} />
        </Field>
        <Field label="Datum" hint="Leer: heute" invalid={fieldOf(error) === 'datum'}>
          <input type="date" value={werte.datum} onChange={(e) => setWerte((w) => ({ ...w, datum: e.target.value }))} />
        </Field>
        <Field label="Anzeige" wide>
          <label className="checkbox">
            <input type="checkbox" checked={werte.angeheftet} onChange={(e) => setWerte((w) => ({ ...w, angeheftet: e.target.checked }))} />
            Anheften – steht vorne im Ticker
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={werte.sichtbar_kunde} onChange={(e) => setWerte((w) => ({ ...w, sichtbar_kunde: e.target.checked }))} />
            Für den Kunden sichtbar (später im Kundenportal)
          </label>
        </Field>
      </div>
      <FormError error={error} />
    </Dialog>
  );
}
