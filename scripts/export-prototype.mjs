// Package this deliberately small, known module graph as a portable HTML study.
// This is an artifact export; the maintained source remains in public/prototype/.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = new URL('../public/prototype/', import.meta.url);
const files = ['context.mjs', 'scenes/room.mjs', 'scenes/city.mjs', 'scenes/cosmos.mjs', 'scenes/meadow.mjs', 'scenes/lake.mjs', 'scenes/coast.mjs', 'artwork.mjs', 'player.mjs'];
const modules = await Promise.all(files.map(file => readFile(new URL(file, base), 'utf8')));
const script = modules.map(source => source.replace(/^import .* from .*;\r?$/gm, '').replace(/^export (?=(?:function|const) )/gm, '')).join('\n\n').replace(/<\/script/gi, '<\\/script');
const css = await readFile(new URL('style.css', base), 'utf8');
let html = await readFile(new URL('index.html', base), 'utf8');
html = html.replace('<link rel="icon" href="/favicon.svg" type="image/svg+xml">', '')
  .replace('<link rel="stylesheet" href="./style.css">', `<style>${css}</style>`)
  .replace('href="./"', 'href=""')
  .replace('<script type="module" src="./player.mjs"></script>', `<script type="module">\n${script}\n</script>`);
const destination = new URL('../outputs/heartbeat-study.html', import.meta.url);
await mkdir(new URL('../outputs/', import.meta.url), { recursive: true });
await writeFile(destination, html);
console.log(`Standalone study: ${fileURLToPath(destination)}`);
