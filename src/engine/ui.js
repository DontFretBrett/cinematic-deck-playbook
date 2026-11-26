// Presenter chrome. The picture is one canvas; everything a presenter needs is summoned
// by a key and drawn as plain DOM on top: notes, slide overview, help, toasts.

const KEYS = [
  ['Next', '→  Space  click'], ['Back', '←  right-click'], ['First / last', 'Home  End'], ['Full screen', 'F'],
  ['Play by itself', 'A'], ['Sound on / off', 'M'], ['Speaker notes', 'N'], ['Notes in a second window', 'P'],
  ['All slides', 'O'], ['Black screen', '.'], ['This help', '?'],
];

export function attachUI(deck, scenes) {
  const ui = document.getElementById('ui');
  const el = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };
  let notes = null, over = null, help = null, popup = null, toastEl = null, t0 = 0;

  const clock = () => { const s = t0 ? Math.floor((performance.now() - t0) / 1000) : 0; return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const meta = () => { const i = deck.info(); return `${clock()}   ·   slide ${i.index + 1}/${i.count}   ·   step ${i.beat + 1}/${i.beats}`; };

  function refresh() {
    const i = deck.info();
    if (notes) { notes.querySelector('p').textContent = i.notes; notes.querySelector('.meta').textContent = meta(); }
    if (popup && !popup.closed) {
      const d = popup.document;
      d.getElementById('s').textContent = i.title; d.getElementById('n').textContent = i.notes; d.getElementById('m').textContent = meta();
    }
    // Deep link: #scene or #scene-3 (third beat). replaceState keeps the Back button clean.
    try { history.replaceState(null, '', '#' + i.scene + (i.beat ? '-' + (i.beat + 1) : '')); } catch {}
  }
  deck.on('move', () => { if (!t0) t0 = performance.now(); refresh(); });
  setInterval(refresh, 1000);

  function toast(msg) {
    if (toastEl) toastEl.remove();
    const t = (toastEl = el('toast', msg)); ui.append(t);
    setTimeout(() => (t.style.opacity = 0), 1300); setTimeout(() => t.remove(), 1800);
  }

  const toggleNotes = () => { if (notes) { notes.remove(); notes = null; } else { notes = el('notes', '<p></p><div class="meta"></div>'); ui.append(notes); refresh(); } };

  function toggleOver() {
    if (over) { over.remove(); over = null; return; }
    over = el('over');
    scenes.forEach((sc, i) => {
      const b = document.createElement('button');
      b.innerHTML = '<div class="th"></div><span></span>';
      b.querySelector('span').textContent = `${i + 1}. ${sc.title}`;
      if (deck.thumbs[i]) b.querySelector('.th').style.backgroundImage = `url(${deck.thumbs[i]})`;
      b.setAttribute('aria-current', deck.info().index === i);
      b.onclick = () => { toggleOver(); deck.jump(sc.id); };
      over.append(b);
    });
    ui.append(over);
    over.querySelector('[aria-current=true]')?.focus();
  }

  const toggleHelp = () => { if (help) { help.remove(); help = null; } else { help = el('help', KEYS.map(([a, b]) => `<b>${a}</b><span>${b}</span>`).join('')); ui.append(help); } };

  // The second window has no script of its own: the opener writes into its DOM directly.
  function openPopup() {
    try {
      popup = window.open('', 'deck-notes', 'width=900,height=600');
      if (!popup) throw 0;
      popup.document.title = 'Speaker notes';
      popup.document.body.innerHTML = '<style>body{margin:0;background:#101218;color:#f2f4f8;font:28px/1.45 system-ui;padding:40px;display:grid;gap:24px;align-content:start}#n{white-space:pre-line}#m,#s{color:#a4abb8;font-size:20px;font-variant-numeric:tabular-nums}</style><div id="s"></div><div id="n"></div><div id="m"></div>';
      popup.document.onkeydown = onKey; // drive the deck from either window
      refresh();
    } catch { popup = null; if (!notes) toggleNotes(); toast('Pop-ups are blocked, so the notes are shown here'); }
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    deck.audio.unlock();
    const k = e.key;
    if (over) { if (k === 'Escape' || k === 'o' || k === 'O') { toggleOver(); e.preventDefault(); } return; } // let the buttons handle focus + Enter
    const nav = { ArrowRight: 1, ArrowDown: 1, ' ': 1, PageDown: 1, Enter: 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1, Backspace: -1 }[k];
    if (nav) { if (!e.repeat) (nav > 0 ? deck.advance : deck.back)(); e.preventDefault(); return; }
    const act = {
      Home: () => deck.jump(0), End: () => deck.jump(scenes.length - 1),
      f: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => toast('Full screen is not available here')),
      a: () => { deck.setAuto(!deck.auto); toast(deck.auto ? 'Playing by itself' : 'Stopped'); },
      m: () => { deck.mute(); toast(deck.muted ? 'Sound off' : 'Sound on'); },
      n: toggleNotes, p: openPopup, o: toggleOver, '?': toggleHelp, h: toggleHelp, '.': deck.toggleBlack, b: deck.toggleBlack,
      Escape: () => { if (help) toggleHelp(); },
    }[k.length === 1 ? k.toLowerCase() : k];
    if (act) { act(); e.preventDefault(); }
  }
  window.addEventListener('keydown', onKey);

  // Pointer: tap = next, horizontal swipe = next / back, right-click = back.
  const canvas = deck.gfx.r.domElement;
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { deck.audio.unlock(); down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || e.button !== 0) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y, quick = performance.now() - down.t < 600;
    if (Math.hypot(dx, dy) < 12 && quick) deck.advance();
    else if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? deck.advance : deck.back)();
    down = null;
  });
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); deck.back(); });

  // Hide the cursor when it has been still for a moment.
  let idle = 0;
  window.addEventListener('pointermove', () => { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('idle'), 2200); });

  window.addEventListener('hashchange', () => { const m = /^#([a-z0-9]+)(?:-(\d+))?$/.exec(location.hash); if (m && m[1] !== deck.info().scene) deck.jump(m[1], m[2] ? +m[2] - 1 : 0); });
  return { toast };
}
