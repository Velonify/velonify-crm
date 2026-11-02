import { useEffect, useRef, useState } from 'react';
import { ErrorBox, Loading } from '../../components/ui';
import { useCreatorApi } from '../api';
import { istLink, type Block, type BlockTyp, type RechercheDokument, type TextTeil } from './dokument';
import { useAktion, useLaden } from './gemeinsam';

const TAG: Record<BlockTyp, string> = { p: 'p', h2: 'h2', h3: 'h3', li: 'li', ol: 'li', zitat: 'blockquote' };

/** Builds the editor's DOM from blocks with createElement/textContent only, so stored text never becomes markup. */
function zeichne(ziel: HTMLElement, bloecke: Block[]) {
  ziel.replaceChildren();
  let liste: HTMLElement | null = null;
  for (const b of bloecke) {
    const listenTag = b.typ === 'li' ? 'UL' : b.typ === 'ol' ? 'OL' : null;
    if (!listenTag) liste = null;
    else if (!liste || liste.tagName !== listenTag) ziel.append((liste = document.createElement(listenTag)));
    const el = document.createElement(TAG[b.typ]);
    for (const t of b.teile) {
      let knoten: Node = document.createTextNode(t.text);
      if (t.kursiv) { const i = document.createElement('em'); i.append(knoten); knoten = i; }
      if (t.fett) { const f = document.createElement('strong'); f.append(knoten); knoten = f; }
      if (t.link && istLink(t.link)) { const a = document.createElement('a'); a.href = t.link; a.target = '_blank'; a.rel = 'noreferrer'; a.append(knoten); knoten = a; }
      el.append(knoten);
    }
    if (!el.childNodes.length) el.append(document.createElement('br'));
    (liste ?? ziel).append(el);
  }
}

/** Reads the editor's DOM back into blocks: headings, paragraphs, list items and quotes with bold, italic and links. */
export function lies(quelle: HTMLElement): Block[] {
  const bloecke: Block[] = [];
  const teileVon = (el: Node): TextTeil[] => {
    const teile: TextTeil[] = [];
    const lauf = (n: Node, fett: boolean, kursiv: boolean, link?: string) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const text = n.textContent ?? '';
        if (text) teile.push({ text, ...(fett ? { fett } : {}), ...(kursiv ? { kursiv } : {}), ...(link ? { link } : {}) });
        return;
      }
      if (!(n instanceof HTMLElement)) return;
      if (n.tagName === 'BR') { teile.push({ text: '\n' }); return; }
      const tag = n.tagName;
      const href = tag === 'A' ? n.getAttribute('href') ?? '' : '';
      const s = n.style;
      n.childNodes.forEach((k) =>
        lauf(k, fett || tag === 'B' || tag === 'STRONG' || s.fontWeight === 'bold' || Number(s.fontWeight) >= 600, kursiv || tag === 'I' || tag === 'EM' || s.fontStyle === 'italic', istLink(href) ? href : link),
      );
    };
    el.childNodes.forEach((k) => lauf(k, false, false));
    // Merge neighbours with the same format and drop the trailing line break browsers leave behind.
    const zusammen: TextTeil[] = [];
    for (const t of teile) {
      const v = zusammen[zusammen.length - 1];
      if (v && !!v.fett === !!t.fett && !!v.kursiv === !!t.kursiv && v.link === t.link) v.text += t.text;
      else zusammen.push({ ...t });
    }
    const letzter = zusammen[zusammen.length - 1];
    if (letzter?.text.endsWith('\n')) letzter.text = letzter.text.slice(0, -1);
    return zusammen.filter((t) => t.text);
  };
  quelle.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      if (n.textContent?.trim()) bloecke.push({ typ: 'p', teile: [{ text: n.textContent }] });
      return;
    }
    if (!(n instanceof HTMLElement)) return;
    const tag = n.tagName;
    if (tag === 'UL' || tag === 'OL') {
      n.querySelectorAll(':scope > li').forEach((li) => bloecke.push({ typ: tag === 'OL' ? 'ol' : 'li', teile: teileVon(li) }));
      return;
    }
    const typ: BlockTyp = tag === 'H1' || tag === 'H2' ? 'h2' : tag === 'H3' || tag === 'H4' ? 'h3' : tag === 'BLOCKQUOTE' ? 'zitat' : 'p';
    bloecke.push({ typ, teile: teileVon(n) });
  });
  return bloecke;
}

/** Content → Recherche: a list of documents and a simple word-processor editor for the selected one. */
export function RechercheDokumente() {
  const liste = useLaden<{ dokumente: RechercheDokument[] }>('/c/content/dokumente');
  const api = useCreatorApi();
  const ak = useAktion();
  const [id, setId] = useState('');
  const dokumente = liste.daten?.dokumente ?? [];
  const aktiv = id || dokumente[0]?.id || '';

  const neu = () =>
    ak.run(async () => {
      const r = await api.post<{ dokument: RechercheDokument }>('/c/content/dokumente/speichern', { titel: `Neues Dokument ${dokumente.length + 1}` });
      await liste.laden();
      setId(r.dokument.id);
    }, 'Dokument angelegt');

  if (liste.fehler) return <ErrorBox error={liste.fehler} onRetry={() => void liste.laden()} />;
  if (!liste.daten) return <Loading />;
  return (
    <div className="recherche-dokumente">
      <nav className="recherche-liste" aria-label="Dokumente">
        {dokumente.map((d) => (
          <button key={d.id} type="button" className={`recherche-eintrag${d.id === aktiv ? ' is-aktiv' : ''}`} aria-current={d.id === aktiv} onClick={() => setId(d.id)}>
            {d.titel}
          </button>
        ))}
        <button type="button" className="button small" disabled={ak.busy} onClick={() => void neu()}>
          Neues Dokument
        </button>
        {ak.feedback}
      </nav>
      {aktiv ? (
        <Editor key={aktiv} id={aktiv} geaendert={() => void liste.laden()} weg={() => { setId(''); void liste.laden(); }} />
      ) : (
        <p className="muted">Noch keine Dokumente. Lege das erste an, zum Beispiel für Themen, Quellen oder Notizen zu Gästen.</p>
      )}
    </div>
  );
}

function Editor({ id, geaendert, weg }: { id: string; geaendert(): void; weg(): void }) {
  const r = useLaden<{ dokument: RechercheDokument }>(`/c/content/dokumente/${encodeURIComponent(id)}`);
  const api = useCreatorApi();
  const ak = useAktion();
  const feld = useRef<HTMLDivElement>(null);
  const [titel, setTitel] = useState('');
  const [offen, setOffen] = useState(false);
  const dok = r.daten?.dokument;

  useEffect(() => {
    if (!dok || !feld.current) return;
    setTitel(dok.titel);
    zeichne(feld.current, dok.bloecke);
    setOffen(false);
  }, [dok]);

  const befehl = (name: string, wert?: string) => {
    feld.current?.focus();
    document.execCommand(name, false, wert);
    setOffen(true);
  };
  const link = () => {
    const adresse = window.prompt('Link-Adresse (https://…)');
    if (adresse && istLink(adresse)) befehl('createLink', adresse);
  };
  const speichern = () =>
    ak.run(async () => {
      if (!feld.current) return;
      await api.post('/c/content/dokumente/speichern', { id, titel: titel.trim() || 'Ohne Titel', bloecke: lies(feld.current) });
      setOffen(false);
      geaendert();
    }, 'Gespeichert');
  const knopf = (label: React.ReactNode, aktion: () => void) => (
    <button type="button" className="button small" onMouseDown={(e) => e.preventDefault()} onClick={aktion}>
      {label}
    </button>
  );

  if (r.fehler) return <ErrorBox error={r.fehler} onRetry={() => void r.laden()} />;
  return (
    <section className="recherche-editor">
      {!dok && <Loading />}
      <input className="recherche-titel" aria-label="Titel des Dokuments" maxLength={200} value={titel} onChange={(e) => { setTitel(e.target.value); setOffen(true); }} hidden={!dok} />
      <div className="recherche-werkzeuge" role="toolbar" aria-label="Formatierung" hidden={!dok}>
        {knopf('Überschrift', () => befehl('formatBlock', 'H2'))}
        {knopf('Zwischenüberschrift', () => befehl('formatBlock', 'H3'))}
        {knopf('Text', () => befehl('formatBlock', 'P'))}
        {knopf(<strong>F</strong>, () => befehl('bold'))}
        {knopf(<em>K</em>, () => befehl('italic'))}
        {knopf('Liste', () => befehl('insertUnorderedList'))}
        {knopf('Nummeriert', () => befehl('insertOrderedList'))}
        {knopf('Zitat', () => befehl('formatBlock', 'BLOCKQUOTE'))}
        {knopf('Link', link)}
      </div>
      <div
        ref={feld}
        className="recherche-text"
        contentEditable={!!dok}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Text des Dokuments"
        hidden={!dok}
        onInput={() => setOffen(true)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); void speichern(); } }}
        onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }}
      />
      {dok && (
        <div className="form-actions">
          <button type="button" className="button primary" disabled={ak.busy || !offen} onClick={() => void speichern()}>{ak.busy ? 'Speichert …' : offen ? 'Speichern' : 'Gespeichert'}</button>
          <button type="button" className="button" disabled={ak.busy} onClick={() => { if (window.confirm(`„${titel}“ archivieren?`)) void ak.run(async () => { await api.post('/c/content/dokumente/archivieren', { id }); weg(); }, 'Archiviert'); }}>Archivieren</button>
          <span className="small muted">{dok.geaendert_von ? `Zuletzt bearbeitet von ${dok.geaendert_von}` : ''}</span>
        </div>
      )}
      {ak.feedback}
    </section>
  );
}
