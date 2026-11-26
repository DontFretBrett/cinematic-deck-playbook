// Build the whole presentation into ONE html file: dist/deck.html
//
//   node build.mjs             minified single file
//   node build.mjs --watch     rebuild on change (unminified, faster)
//   node build.mjs --fragment  also write dist/deck.fragment.html without <!doctype>/<html>/<head>
//                              wrappers, for hosts that supply their own page skeleton
//
// Everything in assets/ is inlined as a data: URI into window.__ASSETS, keyed by its path
// relative to assets/ (e.g. "fonts/Inter-700.woff2", "earth.jpg"). At runtime ctx.asset(name)
// returns the data URI, or falls back to "assets/<name>" when running un-bundled.
// Fonts named  fonts/<Family>[-<weight>][-italic].woff2  are registered automatically.

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const watch = args.has('--watch');
const MIME = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };

function collectAssets(dir = 'assets', base = dir, out = {}) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) { collectAssets(p, base, out); continue; }
    const mime = MIME[path.extname(name).toLowerCase()];
    if (!mime) continue;
    out[path.relative(base, p).split(path.sep).join('/')] = `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
  }
  return out;
}

async function build() {
  const t0 = Date.now();
  const result = await esbuild.build({
    entryPoints: ['src/main.js'], bundle: true, format: 'iife', target: 'es2022',
    minify: !watch, legalComments: 'inline', write: false, logLevel: 'warning',
  });
  // A literal "</script" inside the bundle would end the tag early.
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const assets = collectAssets();
  const tpl = fs.readFileSync('src/index.html', 'utf8');
  // Function replacers: a plain string replacement would interpret "$&" sequences inside the bundle.
  const body = tpl
    .replace('/*__ASSETS__*/', () => 'window.__ASSETS=' + JSON.stringify(assets).replace(/<\/script/gi, '<\\/script'))
    .replace('/*__BUNDLE__*/', () => js);
  const [, head, rest] = /<!--HEAD-->([\s\S]*?)<!--BODY-->([\s\S]*?)<!--END-->/.exec(body);
  fs.mkdirSync('dist', { recursive: true });
  const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">${head}</head>\n<body>${rest}</body>\n</html>\n`;
  fs.writeFileSync('dist/deck.html', full);
  if (args.has('--fragment')) fs.writeFileSync('dist/deck.fragment.html', head + rest);
  const kb = (n) => (n / 1024).toFixed(0) + ' KB';
  console.log(`dist/deck.html  ${kb(full.length)}  (code ${kb(js.length)}, ${Object.keys(assets).length} assets)  ${Date.now() - t0} ms`);
}

await build();
if (watch) {
  let timer = null;
  const again = () => { clearTimeout(timer); timer = setTimeout(() => build().catch((e) => console.error(e.message)), 80); };
  for (const dir of ['src', 'assets']) if (fs.existsSync(dir)) fs.watch(dir, { recursive: true }, again);
  console.log('watching src/ and assets/ …');
}
