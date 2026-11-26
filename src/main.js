// Boot: build the deck, warm everything behind a progress bar, start at the URL hash.
//
// URL switches:
//   ?quick      skip the warm-up (faster reloads while authoring)
//   ?headless   no frame loop, no UI; drive it with window.__deck.seek(id, beat) for screenshots
//   ?px=1       force the device-pixel ratio
//   ?q=0.6      pin the quality factor (disables the automatic governor)
//   #scene-2    open on a scene (and optionally a beat, 1-based)

import { createDeck } from './engine/deck.js';
import { attachUI } from './engine/ui.js';
import { makeAudio } from './engine/audio.js';
import iris from './transitions/iris.js';
import shove from './transitions/shove.js';
import title from './scenes/01-title.js';
import beats from './scenes/02-beats.js';
import shader from './scenes/03-shader.js';
import field from './scenes/04-field.js';
import { checkFacts } from './facts.js';

const scenes = [title, beats, shader, field];
const transitions = { iris, shove };

async function boot() {
  checkFacts(); // refuse to present numbers the data does not support
  const qs = new URLSearchParams(location.search);
  const headless = qs.has('headless');
  const canvas = document.getElementById('stage');
  const ui = document.getElementById('ui');
  let deck;
  try {
    deck = await createDeck({ canvas, scenes, transitions, headless, qs, makeAudio: headless ? null : makeAudio });
  } catch (e) {
    console.error(e);
    const d = document.createElement('div'); d.className = 'help';
    d.textContent = 'This presentation needs WebGL 2. Open it in a current Chrome, Edge, Safari or Firefox on a computer.';
    ui.append(d);
    return;
  }
  window.__deck = deck;

  if (!headless && !qs.has('quick')) {
    const load = document.createElement('div'); load.className = 'load';
    load.innerHTML = '<p>Opening presentation</p><div><i></i></div>';
    ui.append(load);
    const bar = load.querySelector('i');
    await new Promise((r) => requestAnimationFrame(r)); // let the bar paint before the heavy work
    await deck.warmAll((f) => { bar.style.width = Math.round(f * 100) + '%'; });
    load.remove();
  }

  const m = /^#([a-z0-9]+)(?:-(\d+))?$/.exec(location.hash || '');
  const id = m && scenes.some((s) => s.id === m[1]) ? m[1] : scenes[0].id;
  await deck.start(id, m && m[2] ? +m[2] - 1 : 0);
  if (!headless) attachUI(deck, scenes);
  window.ready = true; // screenshot tools wait for this
}

boot();
