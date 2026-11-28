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
  deck.on('move', () => { if (!t0) t0 = performance.now(); refresh(); announce(); hideHint(); });
  setInterval(refresh, 1000);

  // ── what a phone viewer and a screen reader need ─────────────────────────────
  // The picture is a canvas, so a screen reader hears nothing unless we say it. Each beat's
  // `caption` (and the scene title on arrival) goes to a polite live region.
  const live = el('sr'); live.setAttribute('aria-live', 'polite'); ui.append(live);
  let lastScene = '';
  function announce() {
    const i = deck.info();
    const cap = i.caption || '', fresh = i.scene !== lastScene && !cap.toLowerCase().startsWith(i.title.toLowerCase());
    const text = (fresh ? `${i.title}. ` : '') + cap;
    lastScene = i.scene;
    if (text.trim()) live.textContent = text;
  }

  // Controls you can see. Keys are for presenters; a phone has none. Never hover-only.
  const clean = new URLSearchParams(location.search).has('clean');
  const bar = el('ctrl');
  const ICON = {
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path class="on" d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/><path class="off" d="M16 9.5l4 5M20 9.5l-4 5"/></svg>',
    auto: '<svg viewBox="0 0 24 24" fill="currentColor"><path class="off" d="M8 5.5v13l10.5-6.5z"/><g class="on"><rect x="7" y="6" width="3.6" height="12" rx="1"/><rect x="13.4" y="6" width="3.6" height="12" rx="1"/></g></svg>',
    full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.2"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.4"/><circle cx="12" cy="16.6" r=".6" fill="currentColor"/></svg>',
  };
  const btn = (key, label, fn) => {
    const b = document.createElement('button'); b.className = 'cb'; b.dataset.k = key; b.innerHTML = ICON[key];
    b.setAttribute('aria-label', label); b.title = label;
    b.addEventListener('click', (e) => { e.stopPropagation(); deck.audio.unlock(); fn(); syncBar(); });
    bar.append(b); return b;
  };
  const fsOK = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const bSound = btn('sound', 'Sound (M)', () => deck.mute());
  const bAuto = btn('auto', 'Play by itself (A)', () => deck.setAuto(!deck.auto));
  const bFull = btn('full', 'Full screen (F)', () => toggleFull());
  btn('help', 'Keys (?)', () => toggleHelp());
  if (!fsOK) bFull.hidden = true;
  const prog = document.createElement('i'); prog.className = 'prog'; bar.append(prog);
  function syncBar() {
    bSound.setAttribute('aria-pressed', String(!deck.muted));
    bAuto.setAttribute('aria-pressed', String(deck.auto));
    bFull.setAttribute('aria-pressed', String(!!document.fullscreenElement));
  }
  if (!clean) ui.append(bar);
  deck.on('auto', syncBar); deck.on('mute', syncBar); document.addEventListener('fullscreenchange', syncBar); syncBar();
  // Autoplay progress: a hairline that fills over the current beat.
  (function tick() { const i = deck.info(); prog.style.transform = `scaleX(${i.autoProgress.toFixed(3)})`; prog.style.opacity = i.auto ? 1 : 0; requestAnimationFrame(tick); })();

  // A first-run hint that leaves on its own, or on the first move.
  const hint = el('hint'); hint.textContent = 'Tap or press → to advance · A plays it by itself · ? for keys';
  let hintTimer = 0;
  function hideHint() { hint.classList.remove('on'); clearTimeout(hintTimer); }
  if (!clean) { ui.append(hint); setTimeout(() => { hint.classList.add('on'); hintTimer = setTimeout(hideHint, 9000); }, 1400); }

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
      f: () => toggleFull(),
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
  function toggleFull() {
    const d = document, el2 = d.documentElement;
    try {
      const r = d.fullscreenElement || d.webkitFullscreenElement
        ? (d.exitFullscreen || d.webkitExitFullscreen).call(d)
        : (el2.requestFullscreen || el2.webkitRequestFullscreen).call(el2);
      if (r && r.catch) r.catch(() => toast('Full screen is not available here'));
    } catch { toast('Full screen is not available here'); }
  }

  announce();
  return { toast };
}
