/* Headless smoke test for the built bundle.

   Runs against `dist/` on http://localhost:8099 and covers the flows a player
   actually uses: title, begin, bloom, release, pause, resume, mode change and
   the Zen ending. Fails on any console error, page error or missing build
   stamp. Uses Playwright only, no test framework. */
import { chromium } from 'playwright';

const BASE = process.env.RF_URL || 'http://localhost:8099/index.html';
const failures = [];
const check = (name, ok, detail = '') => {
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(800);

// Build stamp proves which commit is being served.
const built = await page.evaluate(() => window.__rfBuild || null);
check('build stamp present', !!built && !!built.commit, built ? built.short : 'missing');
check(
  'build stamp visible',
  await page.locator('#buildStamp').isVisible()
);

const state = () =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));

check('starts on title', (await state()).phase === 'menu');

// Gather a few harmonics around the pointer, then bloom.
await page.evaluate(() => {
  window.__rf.start('endless');
  window.__rf.clearEntities();
  const f = window.__rf.field;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    window.__rf.spawn('harmonic', i % 4, f.x + Math.cos(a) * 34, f.y + Math.sin(a) * 34);
  }
});

const box = await page.locator('#stage').boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.waitForTimeout(1400);
const held = await state();
check('bloom expands the field', held.field.r > 60, `r=${Math.round(held.field.r)}`);
await page.mouse.up();
await page.waitForTimeout(500);
const released = await state();
check('release settles the field', released.field.r < held.field.r, `r=${Math.round(released.field.r)}`);

await page.evaluate(() => window.advanceTime(4000));
const scored = await state();
check('harmonics resonate and score', scored.score > 0, `score=${scored.score}`);

// Pause and resume.
await page.locator('#pauseBtn').click();
await page.waitForTimeout(250);
check('pause opens', (await state()).phase === 'paused' && (await page.locator('#pauseScreen').isVisible()));
await page.locator('#resumeBtn').click();
await page.waitForTimeout(250);
check('resume returns to play', (await state()).phase === 'playing');

// Mode cycling.
await page.locator('#modeBtn').click();
await page.locator('#modeBtn').click();
await page.waitForTimeout(200);
check('double tap shifts polarity', (await page.evaluate(() => window.__rf.field.mode)) !== 'attract');

// Zen ending.
await page.evaluate(() => {
  window.__rf.menu();
  window.__rf.start('zen');
  window.advanceTime(1500);
});
await page.locator('#pauseBtn').click();
await page.waitForTimeout(250);
const endBtn = page.locator('#endSessionBtn');
check('zen pause offers end session', await endBtn.isVisible());
if (await endBtn.isVisible()) {
  await endBtn.click();
  await page.waitForTimeout(400);
  const zen = await state();
  check('zen session ends with a result', zen.phase === 'over', zen.phase);
}

check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nall checks passed');
