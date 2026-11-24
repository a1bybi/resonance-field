# Build log

## Original request

> Create this game and push it into new repository
>
> **Resonance Field — Game Design Document (GDD)**
> **Version 1.0 – Ready for Development**
>
> One-thumb, physics-driven mobile browser game where the player controls a living energy
> field. By expanding, contracting and moving the field, the player attracts, repels and
> resonates with floating particles and shapes to create chains, combos and high scores.
> Should feel like *a musical instrument made of light and gravity*. Instantly playable in
> any modern browser, fully offline-capable PWA, designed for mobile touch. Target feel:
> Flappy Bird "just one more try" + physics-toy feedback + generative music instrument.
>
> (Full GDD supplied in the task: core mechanics, object types, resonance, soft failure,
> controls, modes, scoring, progression, art/audio direction, tech constraints — pure
> HTML/CSS/JS, Canvas 2D, lightweight physics, Web Audio, <500 KB, service worker + manifest,
> 60 fps on mid-range 2022+ phones, <2 s load, MIT licence, README, contribution guidelines,
> easy theming. MVP must-haves and nice-to-haves listed separately.)

## Status — MVP complete

Playable build, deployed and verified. Everything in the GDD's must-have list is in:

- [x] Endless Resonance mode, fully playable, escalating coherence drain
- [x] Attract / Repel / Neutral field modes (button, double tap, `m`)
- [x] Harmonic, Neutral, Dissonant, Core Echo and Hazard object types
- [x] Resonance linking, chaining and multipliers; group blooms; sustained-resonance bonus
- [x] Local best score and cosmetics saved (cookie adapter, silent memory fallback)
- [x] Polished touch controls: hold to bloom, drag to carry, release to contract
- [x] Generative Web Audio score — pad, shimmer, bloom chimes, UI tones, game-over cadence
- [x] Minimalist ethereal visual language: bloom, trails, ripples, nebula, gentle shake
- [x] PWA: manifest, icons, service worker, offline shell
- [x] Soft failure: coherence fades, the field settles, big *Again*
- [x] Zen Field (no drain, no failure)

Nice-to-haves addressed: Zen mode, three themes (Aurora / Ember / Abyss).
Still open: Daily Pulse, Resonance Trials, share cards, unlock flow, save export/import —
see the Roadmap section of the README.

## Verified in testing

- Boot with no console or page errors; no 404s; service worker registers and activates.
- Start → play → pause → resume → game over → Again → play, at desktop and 390×844 touch.
- Field radius blooms 58 → 215 and collapses; dragging moves the field centre.
- Mode cycling by button, by double tap and by `m`; HUD label and button state agree.
- Three harmonics in the field produce a bloom (78 points), chain counter rises.
- Core Echo pickup awards 180 and returns coherence.
- Hazard in the core drains coherence hard; dissonant crowding drains more slowly.
- Zen mode holds coherence at 100 through three simulated seconds.
- Score, longest chain, resonances and duration populate the game-over card.
- Best score and theme survive a reload (cookie `rf_v1`).
- No document overflow at 320×568, 375×667, 390×844, 844×390, 1440×900.
- Text legible (OCR) and colour present on title, play, pause and game-over at both sizes.

## Additions after the first push

- Screenshots and a 1200×630 link-preview card captured from the real build (`media/`), wired into
  the README and into Open Graph / Twitter meta tags.
- Auto-pause when the page is hidden, so a call or a tab switch no longer costs a run.
- Optional haptics: bloom tap, hazard buzz, three-beat pulse at the end of a run.

## Known limitations

- Fonts load from Google Fonts and Fontshare; first paint uses system fallbacks, and full
  offline typography depends on the first visit having cached them. Self-hosting the fonts
  would remove this dependency at the cost of ~60 KB.
- Persistence uses a cookie rather than `localStorage` so it also works in embedded
  previews; blocked-cookie contexts degrade to in-memory best scores.
- Daily Pulse and Resonance Trials are designed but not implemented.
- Performance measured in headless Chromium only (~43 fps in software rendering);
  real-device 60 fps still wants a check on a low-end Android.

## History

1. Scaffolded the project, wrote markup, design tokens, audio engine and game engine.
2. Fixed two blocking bugs found in QA: pause/game-over overlays capturing the first tap,
   and a stale service worker serving old HTML and JS.
3. Fixed a missing canvas variable that blanked the nebula layer on mobile.
4. Replaced per-frame full-screen nebula gradients with a cached half-resolution layer
   after the first performance pass; measured ~1.2 ms per frame of update+render.
5. Rebalanced: weaker resonance healing, milder dissonant/hazard drain, gentler hazard
   homing, fewer entities at spawn — early runs now last 60–120 s.
6. Layout and contrast pass: no overflow on small screens; secondary text raised to
   ≥5.3:1 against panels.
7. Moved persistence to a cookie adapter and switched the service worker to network-first
   so new builds are never masked by the cache.
