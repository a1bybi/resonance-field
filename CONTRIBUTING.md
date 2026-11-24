# Contributing

Thanks for taking a look. Resonance Field is deliberately small: plain HTML, CSS and
JavaScript, no build step, no dependencies, under ~500 KB. Please keep it that way.

## Getting set up

```bash
npx serve .        # or: python3 -m http.server 3000
```

Open `http://localhost:3000`. There is nothing to install or compile. Edit a file, reload
the page.

If you are changing the service worker, either use a private window or unregister the
worker in devtools (Application → Service Workers) so you do not chase a cached build.
Bump the `CACHE` constant in `sw.js` when you change the precache list.

## What is welcome

- Bug fixes, especially input edge cases on iOS Safari and Android Chrome
- Performance work on the render loop (keep the 60 fps target on mid-range phones)
- Accessibility improvements
- New themes, palettes and particle behaviours that fit the minimalist style
- Balance changes backed by a short explanation of what felt wrong

## What to avoid

- Frameworks, bundlers, TypeScript builds or npm dependencies in the runtime
- Audio or image files — visuals are canvas-drawn and audio is synthesised
- Anything that tracks the player, phones home, or requires an account

## Style

- `js/game.js` is organised in numbered sections. Put new code in the matching section.
- Two-space indent, single quotes, semicolons, `var`-free is fine — match the file you are in.
- Comment the *why*, not the *what*, and keep comments in plain English.
- Keep the game readable by someone opening it for the first time: no clever one-liners.

## Testing your change

Before opening a pull request:

1. Load the game at 375×667 and 390×844 in device emulation. Start a run, hold, drag,
   cycle modes with the button and with a double tap, pause, resume, die, restart.
2. Check the console for errors, and the network panel for anything unexpected.
3. Confirm no horizontal scrolling appears on the title, pause or game-over screens.
4. If you touched scoring or coherence, play two or three runs and check that a careful
   player survives longer than a careless one.

The debug hooks (`window.__rf`, `advanceTime`, `render_game_to_text`) make scripted checks
easy if you want to automate any of this.

## Pull requests

Keep them focused, describe the player-visible change, and mention the devices you tested
on. By contributing you agree your work is licensed under the project's MIT licence.
