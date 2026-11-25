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

## Audio fix after first release

Reported as "music doesn't seem to work". Measured the graph by tapping the master with an
analyser: the context was running and producing signal, but 93% of the energy sat below
300 Hz — a bass-heavy pad that a phone speaker barely reproduces. The pad was re-voiced into
the 220–660 Hz range, given a 140 Hz high-pass, and joined by a slow arpeggio in the
400–1300 Hz octave; bloom, echo and bell levels came up. A 400 Hz high-passed measurement
now reads RMS ≈ 0.08 (previously near silence), which is the check worth repeating after any
mix change. Toggling sound on now plays a two-note confirmation so players can verify audio
in one tap.

## Polarity fix

Reported: "It doesn't repel the pieces that end the game." Correct — hazards were excluded
from field forces entirely, and dissonants reversed polarity, so Repel pulled them *in*. Both
are lethal, so the defensive mode did not defend.

- Hazards now feel the field when it is set to Repel, at reduced strength against their mass;
  measured 34 → 113 px in one second, ~208 px in two, versus holding station under Attract.
- Dissonants resist Attract (weak push out) and are shoved hard by Repel.
- Hazards gained a real mass; they had 0, which only stayed harmless while they ignored the
  field. Mass division is now floored so a zero mass can never produce NaN positions.

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
8. Publish-readiness QA pass. Found and fixed a physics regression introduced in `741a0ed`:
   the swirl force was rewritten so harmonics were pushed out of the field and scoring
   stalled (a seeded comparison run ended on 637 points versus 3324 on the previous
   commit). `applyForces` now keeps the original polarity and swirl behaviour with a
   gentler 0.05 swirl plus a soft recall beyond `maxR * 1.9`, and the seeded run matches
   the older build again.
9. Fixed hazard damage stacking: two overlapping hazards drained coherence from 59 to 0
   in 0.86 s. Damage per tick is now capped (`min(30, 17 + (hazards - 1) * 6)`) and the
   same cap applies to dissonants (`min(18, dissonants * 6)`), bringing the drain to
   roughly 24 per second with two hazards on screen.
10. Made the Zen ending reachable: the pause card now shows an End session button that
    ends the run, records `bestZen`, and persists it; leaving a paused Zen run to the
    title also records the session.
11. Fixed a bloom that stuck open after restarting from the pause card (pointer and field
    state were not cleared in `startRun`).
12. HUD BEST now shows the high score for the current mode (`max(best, bestZen)`), and
    `endRun` also accepts the paused phase.
13. The field is clamped inside the viewport on resize and rotation instead of drifting
    off-screen.
14. Muted audio no longer schedules voices every frame; `update()` returns early when the
    engine is disabled.
15. Accessibility and input: the viewport no longer blocks pinch zoom, and the status line
    is a real button with an aria-label and a visible focus style instead of a tappable div.
16. Removed a duplicate Zen entity spawn and a redundant branch in the render loop; GRAZE
    now pays 8 points so its on-screen label means something.
17. Bumped the service worker cache to `resonance-field-v4` so the new build is not served
    from a stale cache.
18. Verified after the fixes: seeded run 3324 points with all 9 harmonics in field, two-hazard
    drain 59 to 0 in about 2.5 s, Zen end session records a best, restart from pause starts
    clean, HUD best switches per mode, no horizontal overflow or clipped pause card across
    seven viewports down to 320x568 and 844x390 landscape, offline play from cache v4,
    audio RMS 0.13, 60.3 fps mobile / 53.1 fps desktop headless.
19. Found during the final pass that the distance recall beacons were applying their force
    away from the field instead of toward it, so harmonics drifted to the corners and
    became stranded off-screen — dozens of them piling outside the frame, invisible and
    unreachable, and crowding the entity budget. The recall is now an elliptical pull
    toward the middle of the stage, so a drifted harmonic never ends up more than about
    30 px outside the viewport and always comes back into play.

20. Made the live site traceable to the repository. `tools/build-dist.sh` now assembles the
    publishable `dist/` folder from tracked files and writes `dist/version.json` with the
    exact commit, branch and build time; `js/build-stamp.js` shows the short SHA under the
    title card. Added a Verify workflow that runs a syntax check, asserts the bundle is
    stamped with the pushed commit and built from a clean tree, and runs `tests/smoke.mjs`
    headlessly. Added a daily "Live matches master" workflow that compares the live build
    stamp and asset hashes against master and opens an issue when the live page drifts.

21. Published the QA build to `resonancefield.pplx.app`, a permanent address tied to a site
    record this workspace can update on every release. The old `resonancegame.pplx.app`
    publication is orphaned — no app in the library owns it — so its address could not be
    reused; every canonical, Open Graph, README, package and workflow URL now points at the
    new address. The daily drift check reads the new domain.
