# 07 — Presenter UI

The picture is one canvas. Everything else is summoned by a key and drawn as plain DOM in a `#ui` layer with `pointer-events: none` (children re-enable it).

## Keys

| Key | Action |
|---|---|
| → ↓ Space PageDown Enter | Next beat |
| ← ↑ PageUp Backspace | Back |
| Home / End | First / last scene |
| F | Full screen |
| A | Play by itself (toast confirms) |
| M | Sound on/off (toast confirms) |
| N | Speaker notes panel |
| P | Notes in a second window |
| O | Overview of all slides |
| ? or H | Help |
| . or B | Black screen |
| Esc | Close overview / help |

Details that matter:

- Ignore keys with Ctrl/Cmd/Alt held, so browser shortcuts still work.
- Ignore auto-repeat for navigation. A held key must not skip five beats.
- Every key and pointer-down calls `audio.unlock()`.
- While the overview is open, handle only Esc and O; let native button focus and Enter do the rest.
- PageDown/PageUp are what presentation clickers send.

## Visible controls

Keys are for presenters. A phone has none, and a viewer who opens a shared link doesn't know them. So the starter also shows four buttons top right: sound, play by itself, full screen, keys. They are real `<button>`s with `aria-pressed`, quiet (55% opacity) until used, never hover-only, and they hide with the idle cursor. Full screen is only offered where the browser supports it. A hairline under them fills over each beat while autoplay runs.

A first-run hint ("Tap or press → to advance · A plays it by itself · ? for keys") appears after 1.4 s and leaves after nine seconds or on the first move.

`?clean` hides both, for recording or presenting from a laptop.

## Captions for screen readers

The picture is a canvas, so a screen reader hears nothing unless the page says it. Give each beat a `caption` (one plain sentence describing what changes); when a beat arrives, the scene title (on arrival) and caption go to a visually hidden `aria-live="polite"` region.

## Pointer

- Tap (under 12 px of movement, under 600 ms) → next. Taps on the control buttons don't count.
- Horizontal swipe over 50 px → next / back.
- Right-click → back.
- A scene can claim a drag (the reference's draggable divider) by returning truthy from a `pointer('down', x, y, s)` hook; the engine then captures the pointer for it.
- `touch-action: none` on the canvas; no wheel handling.
- Hide the cursor after 2.2 s without movement (`body.idle { cursor: none }`).

## Speaker notes

- One string per beat, shown in a bottom panel with `white-space: pre-line`.
- A meta line: elapsed time, slide n/N, step n/N. The timer starts at the first navigation, not at load.
- Set with `textContent`, never `innerHTML`.
- Padding respects `env(safe-area-inset-*)`.

**Second window** (P): `window.open('', name, …)`, then the opener writes the popup's DOM directly and assigns the same key handler to `popup.document.onkeydown`. No messaging, no second script, and the deck can be driven from either window. If the popup is blocked (it will be inside most sandboxed iframes), fall back to the inline panel and say so in a toast.

## Overview

A grid of real `<button>` elements with a 16:9 thumbnail and title; `aria-current` on the current slide, which gets focus on open. Clicking jumps with a plain fade.

Thumbnails: the reference bakes JPEGs at build time. The starter kit captures them during warm-up (render the scene's last beat, read the target back, `toDataURL`), which needs no build step.

## Other chrome

- **Black screen** is a smoothed uniform in the present pass, not a DOM overlay, so it fades.
- **Toasts** fade at 1.3 s and are removed at 1.8 s.
- **Loading**: a bar that fills as scenes warm. Await one animation frame before the heavy work, or it never paints.
- **Page number** is drawn in the canvas by the text system (bottom right, anchored to the visible edge, not the 16:9 frame). It switches to the incoming scene's style at the transition's half-way point.

## Deep links

- `#scene` or `#scene-N` (1-based beat), written with `history.replaceState` on every move so the browser's Back button is not polluted.
- Read at boot and on `hashchange`.
- Reload during rehearsal and you are where you were.

## Autoplay

A advances automatically when the current beat has been complete for its `hold` (default 3 s), and switches itself off at the end. Good for a lobby screen or for recording a video of the deck.

## Accessibility touches

`aria-label` on the canvas, `tabindex="0"` so it takes focus, real buttons in the overview, visible focus outlines, notes as text. A canvas deck is not accessible to a screen reader on its own; if that matters, publish the notes as a transcript alongside.
