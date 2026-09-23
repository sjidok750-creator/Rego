// Bundle web/ into self-contained single-file pages (three.js inlined):
//   dist/dabotap.html   — standalone page, opens straight from disk
//   dist/artifact.html  — the same page body for publishing as a claude.ai Artifact
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');

const res = await build({
  entryPoints: [path.join(ROOT, 'web/src/main.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  target: 'es2020',
  alias: { 'three/addons': path.join(ROOT, 'node_modules/three/examples/jsm') },
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replaceAll('</script', '<\\/script');

const page = html
  .replace(/<script type="importmap">[\s\S]*?<\/script>\n/, '')
  .replace('<script type="module" src="./src/main.js"></script>', () => `<script type="module">${js}</script>`);

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/dabotap.html'), page);

// Artifact pages get their own document skeleton: keep only title, styles and body content.
const head = page.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\n?/, '')
  .replace(/<meta name="viewport"[^>]*>\n?/, '');
const body = page.match(/<body>([\s\S]*?)<\/body>/)[1];
fs.writeFileSync(path.join(ROOT, 'dist/artifact.html'), `${head.trim()}\n${body.trim()}\n`);
console.log('dist/dabotap.html', (page.length / 1024).toFixed(0), 'KB');
