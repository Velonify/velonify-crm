// Copies Excalidraw's fonts into public/excalidraw, so the whiteboard loads them from the hub instead of a CDN.
// Xiaolai (Chinese/Japanese, 12 MB) is left out; for those characters Excalidraw falls back to its CDN.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';

const quelle = new URL('../node_modules/@excalidraw/excalidraw/dist/prod/fonts/', import.meta.url);
const ziel = new URL('../public/excalidraw/fonts/', import.meta.url);
if (!existsSync(quelle)) process.exit(0);
mkdirSync(ziel, { recursive: true });
for (const schrift of readdirSync(quelle)) {
  if (schrift !== 'Xiaolai') cpSync(new URL(`${schrift}/`, quelle), new URL(`${schrift}/`, ziel), { recursive: true });
}
