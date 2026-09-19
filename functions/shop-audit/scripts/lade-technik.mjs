// Downloads the technology fingerprints of webappanalyzer (https://github.com/enthec/webappanalyzer, GPL-3.0),
// the maintained fork of the Wappalyzer data, into ./technik. Pinned to one commit so audits stay reproducible;
// to update, change VERSION and redeploy. The files are not part of this repository.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const VERSION = 'eea872af449e207e055398f7369d11ee48c8ea03';
const BASIS = `https://raw.githubusercontent.com/enthec/webappanalyzer/${VERSION}`;
const ZIEL = new URL('../technik/', import.meta.url);
const DATEIEN = ['_', ...'abcdefghijklmnopqrstuvwxyz'].map((b) => `src/technologies/${b}.json`).concat('src/categories.json', 'LICENSE');

const vorhanden = await readFile(new URL('VERSION', ZIEL), 'utf8').catch(() => '');
if (vorhanden.trim() === VERSION) {
  console.log(`webappanalyzer ${VERSION.slice(0, 7)} ist schon da.`);
} else {
  await mkdir(ZIEL, { recursive: true });
  for (const pfad of DATEIEN) {
    const antwort = await fetch(`${BASIS}/${pfad}`);
    if (!antwort.ok) throw new Error(`${pfad}: HTTP ${antwort.status}`);
    await writeFile(new URL(pfad.split('/').pop(), ZIEL), await antwort.text());
  }
  await writeFile(new URL('VERSION', ZIEL), VERSION);
  console.log(`webappanalyzer ${VERSION.slice(0, 7)} geladen (${DATEIEN.length} Dateien).`);
}
