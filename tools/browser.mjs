// Shared launcher for the tools: open the built deck in headless Chrome.
//
// By default it asks for the machine's real GPU, which is typically 20–50x faster than software
// rendering and makes frame-by-frame audits and video export practical. Pass { software: true }
// (the tools expose it as --software) for SwiftShader: slower, but identical on every machine,
// which is what you want on CI or a box with no GPU.

import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SOFT = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const GPU = ['--ignore-gpu-blocklist', '--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])];
const NOISE = /GPU stall due to ReadPixels|AudioContext was not allowed/;

export const args = (argv = process.argv.slice(2)) => ({
  has: (name) => argv.includes('--' + name),
  get: (name, def) => { const i = argv.indexOf('--' + name); return i < 0 || i + 1 >= argv.length ? def : argv[i + 1]; },
});

/**
 * Open dist/deck.html and wait until it has drawn its first frame.
 * Returns { browser, page, errors, renderer, software }.
 */
export async function openDeck({ file = 'dist/deck.html', width = 1600, height = 900, query = '?headless&px=1', software = false, extraArgs = [] } = {}) {
  const url = pathToFileURL(path.resolve(file)).href + query;
  const attempts = software
    ? [{ args: SOFT }, { channel: 'chrome', args: SOFT }]
    : [{ args: GPU }, { channel: 'chrome', args: GPU }, { args: SOFT }, { channel: 'chrome', args: SOFT }];
  let lastError = null;
  for (const opts of attempts) {
    let browser = null;
    try {
      browser = await chromium.launch({ ...opts, args: [...opts.args, ...extraArgs] });
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !NOISE.test(m.text())) errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(url);
      await page.waitForFunction('window.ready === true', null, { timeout: 180000 });
      const renderer = await page.evaluate(() => {
        const gl = window.__deck.gfx.gl, ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
      });
      return { browser, page, errors, renderer, software: /SwiftShader|llvmpipe/i.test(renderer) };
    } catch (e) { lastError = e; if (browser) await browser.close().catch(() => {}); }
  }
  throw new Error('Could not open the deck in a headless browser: ' + (lastError && lastError.message));
}

/** Print collected console problems; returns true if there were any. */
export function reportErrors(errors) {
  if (!errors.length) return false;
  console.log('\nConsole problems:\n' + [...new Set(errors)].map((e) => '  ' + e).join('\n'));
  return true;
}
