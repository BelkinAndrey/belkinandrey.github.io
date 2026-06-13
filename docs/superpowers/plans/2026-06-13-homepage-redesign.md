# Homepage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the static portfolio homepage into a compact neural dashboard with a smooth sparse-cell animated background.

**Architecture:** Keep the site static and dependency-free. Move the background behavior into a small `sparse-field.mjs` module so the grid math and reduced-motion branch are testable with Node's built-in test runner. `index.html` owns semantic content, `styles.css` owns the dashboard layout and visual states.

**Tech Stack:** HTML, CSS, vanilla JavaScript ES module, Node `node:test`, local static server for browser verification.

---

## File Structure

- Create `sparse-field.mjs`: exports pure grid helpers plus `createSparseField(container, options)` and auto-initializes `[data-sparse-field]` in the browser.
- Create `tests/sparse-field.test.mjs`: verifies the sparse field math, color picking, and reduced-motion detection.
- Create `tests/homepage-structure.test.mjs`: verifies preserved links and required dashboard/background hooks in `index.html`.
- Create `tests/styles-contract.test.mjs`: verifies the CSS contract for the sparse field, dashboard layout, hover/focus states, and reduced-motion media query.
- Modify `index.html`: replace the centered page with a left identity panel and right project dashboard while preserving all destinations.
- Modify `styles.css`: replace the current card grid styling with the dark neural dashboard visual system.

## Task 1: Sparse Background Module

**Files:**
- Create: `tests/sparse-field.test.mjs`
- Create: `sparse-field.mjs`

- [ ] **Step 1: Write the failing sparse field tests**

Create `tests/sparse-field.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FIELD_OPTIONS,
  getGridMetrics,
  pickCellColor,
  pickSparseCellPosition,
  prefersReducedMotion
} from '../sparse-field.mjs';

test('getGridMetrics calculates tile counts and centered cell offset', () => {
  assert.deepEqual(
    getGridMetrics({ width: 120, height: 90, tileSize: 30, cellSize: 10 }),
    { width: 120, height: 90, tileSize: 30, cellSize: 10, cols: 4, rows: 3, offset: 10 }
  );
});

test('pickSparseCellPosition returns a snapped point inside the field', () => {
  const metrics = getGridMetrics({ width: 120, height: 90, tileSize: 30, cellSize: 10 });
  const values = [0.99, 0.51];
  const position = pickSparseCellPosition(() => values.shift() ?? 0, metrics);

  assert.deepEqual(position, { x: 100, y: 40 });
  assert.equal((position.x - metrics.offset) % metrics.tileSize, 0);
  assert.equal((position.y - metrics.offset) % metrics.tileSize, 0);
  assert.ok(position.x <= metrics.width - metrics.cellSize);
  assert.ok(position.y <= metrics.height - metrics.cellSize);
});

test('pickCellColor chooses a color from the configured palette', () => {
  const color = pickCellColor(() => 0.5, ['34, 211, 238', '45, 212, 191', '96, 165, 250']);

  assert.equal(color, '45, 212, 191');
});

test('prefersReducedMotion follows the provided window matchMedia result', () => {
  const win = {
    matchMedia(query) {
      assert.equal(query, '(prefers-reduced-motion: reduce)');
      return { matches: true };
    }
  };

  assert.equal(prefersReducedMotion(win), true);
});

test('default field options keep the approved sparse burst timing', () => {
  assert.equal(DEFAULT_FIELD_OPTIONS.tileSize, 34);
  assert.equal(DEFAULT_FIELD_OPTIONS.cellSize, 18);
  assert.equal(DEFAULT_FIELD_OPTIONS.poolSize, 42);
  assert.deepEqual(DEFAULT_FIELD_OPTIONS.colors, [
    '34, 211, 238',
    '45, 212, 191',
    '96, 165, 250',
    '125, 211, 252'
  ]);
});
```

- [ ] **Step 2: Run the sparse field tests and verify RED**

Run:

```bash
node --test tests/sparse-field.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `sparse-field.mjs`.

- [ ] **Step 3: Implement the sparse field module**

Create `sparse-field.mjs`:

```js
export const DEFAULT_FIELD_OPTIONS = Object.freeze({
  tileSize: 34,
  cellSize: 18,
  poolSize: 42,
  staticCellCount: 14,
  minDelay: 80,
  maxDelay: 210,
  batchChance: 0.28,
  colors: Object.freeze([
    '34, 211, 238',
    '45, 212, 191',
    '96, 165, 250',
    '125, 211, 252'
  ])
});

export function getGridMetrics({
  width,
  height,
  tileSize = DEFAULT_FIELD_OPTIONS.tileSize,
  cellSize = DEFAULT_FIELD_OPTIONS.cellSize
}) {
  const safeWidth = Math.max(0, Number(width) || 0);
  const safeHeight = Math.max(0, Number(height) || 0);
  const safeTile = Math.max(1, Number(tileSize) || DEFAULT_FIELD_OPTIONS.tileSize);
  const safeCell = Math.max(1, Math.min(Number(cellSize) || DEFAULT_FIELD_OPTIONS.cellSize, safeTile));

  return {
    width: safeWidth,
    height: safeHeight,
    tileSize: safeTile,
    cellSize: safeCell,
    cols: Math.max(1, Math.floor(safeWidth / safeTile)),
    rows: Math.max(1, Math.floor(safeHeight / safeTile)),
    offset: Math.max(0, Math.round((safeTile - safeCell) / 2))
  };
}

export function pickSparseCellPosition(random = Math.random, metrics) {
  const next = typeof random === 'function' ? random : Math.random;
  const col = Math.min(metrics.cols - 1, Math.floor(next() * metrics.cols));
  const row = Math.min(metrics.rows - 1, Math.floor(next() * metrics.rows));

  return {
    x: Math.min(metrics.width - metrics.cellSize, col * metrics.tileSize + metrics.offset),
    y: Math.min(metrics.height - metrics.cellSize, row * metrics.tileSize + metrics.offset)
  };
}

export function pickCellColor(random = Math.random, colors = DEFAULT_FIELD_OPTIONS.colors) {
  const palette = colors.length ? colors : DEFAULT_FIELD_OPTIONS.colors;
  const index = Math.min(palette.length - 1, Math.floor(random() * palette.length));
  return palette[index];
}

export function prefersReducedMotion(win = globalThis.window) {
  return Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

export function createSparseField(container, options = {}) {
  if (!container) {
    return { stop() {} };
  }

  const settings = { ...DEFAULT_FIELD_OPTIONS, ...options };
  const doc = container.ownerDocument;
  const win = doc.defaultView ?? globalThis.window;
  const random = typeof settings.random === 'function' ? settings.random : Math.random;
  const reduceMotion = settings.reducedMotion ?? prefersReducedMotion(win);
  const timers = new Set();

  container.textContent = '';
  container.dataset.motion = reduceMotion ? 'reduced' : 'animated';

  function metrics() {
    const rect = container.getBoundingClientRect();
    return getGridMetrics({
      width: rect.width,
      height: rect.height,
      tileSize: settings.tileSize,
      cellSize: settings.cellSize
    });
  }

  function makeCell(className = 'sparse-cell') {
    const cell = doc.createElement('span');
    cell.className = className;
    cell.style.width = `${settings.cellSize}px`;
    cell.style.height = `${settings.cellSize}px`;
    container.append(cell);
    return cell;
  }

  function place(cell) {
    const position = pickSparseCellPosition(random, metrics());
    cell.style.setProperty('--x', `${position.x}px`);
    cell.style.setProperty('--y', `${position.y}px`);
    cell.style.setProperty('--rgb', pickCellColor(random, settings.colors));
  }

  if (reduceMotion) {
    const count = Math.min(settings.staticCellCount, settings.poolSize);
    for (let index = 0; index < count; index += 1) {
      const cell = makeCell('sparse-cell sparse-cell-static');
      place(cell);
    }

    return { stop() {} };
  }

  const cells = Array.from({ length: settings.poolSize }, () => makeCell());
  let index = 0;
  let stopped = false;

  function activate(cell) {
    cell.classList.remove('is-live');
    place(cell);
    void cell.offsetWidth;
    cell.classList.add('is-live');
  }

  function schedule() {
    if (stopped) return;

    const batchSize = random() > 1 - settings.batchChance ? 2 : 1;
    for (let count = 0; count < batchSize; count += 1) {
      activate(cells[index % cells.length]);
      index += 1;
    }

    const delay = settings.minDelay + random() * (settings.maxDelay - settings.minDelay);
    const timer = win.setTimeout(() => {
      timers.delete(timer);
      schedule();
    }, delay);
    timers.add(timer);
  }

  schedule();

  return {
    stop() {
      stopped = true;
      for (const timer of timers) {
        win.clearTimeout(timer);
      }
      timers.clear();
    }
  };
}

function initSparseField() {
  const container = document.querySelector('[data-sparse-field]');
  if (container) {
    createSparseField(container);
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSparseField, { once: true });
  } else {
    initSparseField();
  }
}
```

- [ ] **Step 4: Run the sparse field tests and verify GREEN**

Run:

```bash
node --test tests/sparse-field.test.mjs
```

Expected: PASS with 5 passing tests.

- [ ] **Step 5: Commit the sparse field module**

Run:

```bash
git add sparse-field.mjs tests/sparse-field.test.mjs
git commit -m "feat: add sparse background field"
```

## Task 2: Dashboard HTML Structure

**Files:**
- Create: `tests/homepage-structure.test.mjs`
- Modify: `index.html`

- [ ] **Step 1: Write the failing homepage structure tests**

Create `tests/homepage-structure.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('homepage contains the sparse field hook and module script', () => {
  assert.match(html, /data-sparse-field/);
  assert.match(html, /type="module"\s+src="sparse-field\.mjs"/);
});

test('homepage uses the neural dashboard composition hooks', () => {
  assert.match(html, /class="dashboard-shell"/);
  assert.match(html, /class="identity-panel"/);
  assert.match(html, /class="projects-panel"/);
  assert.match(html, /class="projects-grid"/);
});

test('homepage preserves project destinations', () => {
  assert.match(html, /href="bug_web\/index\.html"/);
  assert.match(html, /href="tonic\/index\.html"/);
  assert.match(html, /href="spike\/index\.html"/);
});

test('homepage preserves social destinations', () => {
  assert.match(html, /href="https:\/\/telegram\.me\/neuro_cyber"/);
  assert.match(html, /href="https:\/\/youtube\.com\/@it\.belkin\/videos"/);
  assert.match(html, /href="https:\/\/medium\.com\/@it\.belkin"/);
  assert.match(html, /href="https:\/\/habr\.com\/ru\/users\/aigame\/articles\/"/);
  assert.match(html, /href="https:\/\/twitter\.com\/it_belkin"/);
});
```

- [ ] **Step 2: Run the homepage structure tests and verify RED**

Run:

```bash
node --test tests/homepage-structure.test.mjs
```

Expected: FAIL because `index.html` does not yet contain `dashboard-shell`, `identity-panel`, `projects-panel`, or the `sparse-field.mjs` module script.

- [ ] **Step 3: Replace `index.html` with the dashboard composition**

Use the existing inline SVG paths for the social icons and this structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Andrey Belkin - Projects</title>
    <link rel="stylesheet" href="styles.css">
    <script type="module" src="sparse-field.mjs"></script>
</head>
<body>
    <div class="sparse-background" data-sparse-field aria-hidden="true"></div>

    <main class="dashboard-shell" aria-label="Andrey Belkin portfolio">
        <aside class="identity-panel">
            <div class="identity-content">
                <p class="eyebrow">Neural systems lab</p>
                <h1>Andrey Belkin</h1>
                <p class="tagline">Neural networks, spiking agents and experiments</p>
            </div>

            <nav class="social-links" aria-label="Social links">
                <a class="social-link telegram" href="https://telegram.me/neuro_cyber" target="_blank" rel="noopener" aria-label="Telegram">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>
                </a>
                <a class="social-link youtube" href="https://youtube.com/@it.belkin/videos" target="_blank" rel="noopener" aria-label="YouTube">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M23.5 6.2c-.3-1-1-1.8-2-2.1C19.7 3.6 12 3.6 12 3.6s-7.7 0-9.5.5c-1 .3-1.7 1.1-2 2.1C0 8 0 12 0 12s0 4 .5 5.8c.3 1 1 1.8 2 2.1 1.8.5 9.5.5 9.5.5s7.7 0 9.5-.5c1-.3 1.7-1.1 2-2.1.5-1.8.5-5.8.5-5.8s0-4-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>
                </a>
                <a class="social-link medium" href="https://medium.com/@it.belkin" target="_blank" rel="noopener" aria-label="Medium">
                    <svg viewBox="0 -55 256 256" width="28" height="28" preserveAspectRatio="xMidYMid" fill="currentColor"><path d="M72.2 0c39.88 0 72.2 32.55 72.2 72.7s-32.32 72.7-72.2 72.7S0 112.84 0 72.7 32.33 0 72.2 0zm115.3 4.26c19.94 0 36.1 30.64 36.1 68.44s-16.16 68.44-36.1 68.44-36.1-30.65-36.1-68.44 16.16-68.44 36.1-68.44zm55.8 7.13c7.01 0 12.7 27.45 12.7 61.31s-5.68 61.32-12.7 61.32-12.69-27.46-12.69-61.32 5.68-61.31 12.7-61.31z"/></svg>
                </a>
                <a class="social-link habr" href="https://habr.com/ru/users/aigame/articles/" target="_blank" rel="noopener" aria-label="Habr">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M0 0v24h24V0H0zm7.025 4h1.633c1.219 0 1.64.029 1.668.113.019.066.028 1.369.028 2.897l-.008 2.783.476-.422c.657-.581 1.212-.787 2.262-.824.694-.019.973.009 1.46.178 1.06.356 1.81 1.087 2.204 2.166.15.421.17.863.197 4.285l.03 3.824h-3.338v-3.121c0-3.075-.01-3.113-.217-3.488-.29-.497-.609-.722-1.106-.778-.853-.093-1.443.197-1.78.89-.16.32-.179.656-.188 3.356-.01 1.65-.03 3.03-.03 3.067-.008.047-.75.074-1.65.074h-1.64v-7.5z"/></svg>
                </a>
                <a class="social-link x" href="https://twitter.com/it_belkin" target="_blank" rel="noopener" aria-label="X">
                    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
            </nav>

            <p class="copy">&copy; Andrey Belkin</p>
        </aside>

        <section class="projects-panel" aria-labelledby="projects-title">
            <div class="projects-heading">
                <p class="eyebrow">Projects</p>
                <h2 id="projects-title">Live experiments</h2>
            </div>

            <div class="projects-grid">
                <a class="project-card" href="bug_web/index.html">
                    <div class="preview">
                        <img src="previews/bug_web.gif" onerror="this.onerror=null;this.src='previews/bug_web.svg';" alt="Spiking Bug preview">
                    </div>
                    <div class="project-info">
                        <h3>Spiking Bug</h3>
                        <p>Spiking neural network agent in a live arena</p>
                    </div>
                </a>

                <a class="project-card" href="tonic/index.html">
                    <div class="preview">
                        <img src="previews/tonic.gif" onerror="this.onerror=null;this.src='previews/tonic.svg';" alt="cogFlux preview">
                    </div>
                    <div class="project-info">
                        <h3>cogFlux</h3>
                        <p>Neural network editor with body simulations</p>
                    </div>
                </a>

                <a class="project-card" href="spike/index.html">
                    <div class="preview">
                        <img src="previews/spike.gif" onerror="this.onerror=null;this.src='previews/spike.svg';" alt="cogFlux - Spike preview">
                    </div>
                    <div class="project-info">
                        <h3>cogFlux - Spike</h3>
                        <p>Spike-based neural network editor and visualizer</p>
                    </div>
                </a>
            </div>
        </section>
    </main>
</body>
</html>
```

- [ ] **Step 4: Run the homepage structure tests and verify GREEN**

Run:

```bash
node --test tests/homepage-structure.test.mjs
```

Expected: PASS with 4 passing tests.

- [ ] **Step 5: Commit the dashboard HTML**

Run:

```bash
git add index.html tests/homepage-structure.test.mjs
git commit -m "feat: add neural dashboard markup"
```

## Task 3: Dashboard Styling and Reduced-Motion CSS

**Files:**
- Create: `tests/styles-contract.test.mjs`
- Modify: `styles.css`

- [ ] **Step 1: Write the failing CSS contract tests**

Create `tests/styles-contract.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('styles define the sparse field animation contract', () => {
  assert.match(css, /\.sparse-background/);
  assert.match(css, /\.sparse-cell/);
  assert.match(css, /@keyframes sparse-bloom/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('styles define the neural dashboard layout contract', () => {
  assert.match(css, /\.dashboard-shell/);
  assert.match(css, /\.identity-panel/);
  assert.match(css, /\.projects-panel/);
  assert.match(css, /\.projects-grid/);
});

test('styles define interactive card and social states', () => {
  assert.match(css, /\.project-card:hover/);
  assert.match(css, /\.project-card:focus-visible/);
  assert.match(css, /\.social-link:focus-visible/);
});

test('styles do not draw a visible line grid background', () => {
  assert.doesNotMatch(css, /1px,\s*transparent\s+1px/);
});
```

- [ ] **Step 2: Run the CSS contract tests and verify RED**

Run:

```bash
node --test tests/styles-contract.test.mjs
```

Expected: FAIL because the current CSS has no `.sparse-background`, `.sparse-cell`, `.dashboard-shell`, or reduced-motion sparse field contract.

- [ ] **Step 3: Replace `styles.css` with the dashboard visual system**

Replace `styles.css` with CSS that includes these complete sections:

```css
* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

:root {
    --bg: #05070d;
    --panel: rgba(9, 14, 24, 0.78);
    --panel-strong: rgba(13, 21, 34, 0.88);
    --line: rgba(148, 163, 184, 0.2);
    --line-strong: rgba(45, 212, 191, 0.48);
    --text: #eef6ff;
    --muted: #95a3b8;
    --dim: #64748b;
    --cyan: #22d3ee;
    --teal: #2dd4bf;
    --blue: #60a5fa;
    --shadow: rgba(1, 8, 18, 0.42);
}

html,
body {
    min-height: 100%;
}

body {
    min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    color: var(--text);
    background: var(--bg);
    line-height: 1.5;
    overflow-x: hidden;
}

a {
    color: inherit;
}

.sparse-background {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    background:
        linear-gradient(145deg, rgba(3, 7, 18, 0.98), rgba(6, 13, 24, 0.96) 42%, rgba(3, 7, 18, 0.99)),
        #05070d;
}

.sparse-background::before {
    content: "";
    position: absolute;
    inset: 0;
    background:
        linear-gradient(90deg, rgba(5, 7, 13, 0.96), transparent 18%, transparent 82%, rgba(5, 7, 13, 0.96)),
        linear-gradient(180deg, rgba(5, 7, 13, 0.1), rgba(5, 7, 13, 0.72));
}

.sparse-cell {
    position: absolute;
    left: var(--x);
    top: var(--y);
    border-radius: 4px;
    background: rgb(var(--rgb));
    opacity: 0;
    transform: scale(0.72);
    box-shadow: 0 0 18px rgba(var(--rgb), 0.62), 0 0 42px rgba(var(--rgb), 0.2);
    will-change: opacity, transform, filter;
}

.sparse-cell.is-live {
    animation: sparse-bloom 980ms cubic-bezier(0.16, 0.92, 0.18, 1) both;
}

.sparse-cell-static {
    opacity: 0.22;
    transform: scale(0.92);
}

@keyframes sparse-bloom {
    0% {
        opacity: 0;
        transform: scale(0.7);
        filter: brightness(0.7) saturate(0.8);
    }
    10% {
        opacity: 0.98;
        transform: scale(1.06);
        filter: brightness(1.5) saturate(1.18);
    }
    28% {
        opacity: 0.72;
        transform: scale(1);
        filter: brightness(1.15) saturate(1.08);
    }
    100% {
        opacity: 0;
        transform: scale(0.9);
        filter: brightness(0.68) saturate(0.88);
    }
}

.dashboard-shell {
    position: relative;
    z-index: 1;
    width: min(1180px, 100%);
    min-height: 100vh;
    margin: 0 auto;
    padding: 48px 24px;
    display: grid;
    grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
    gap: 34px;
    align-items: stretch;
}

.identity-panel {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 28px;
    padding: 28px 28px 24px 0;
    border-right: 1px solid var(--line);
}

.eyebrow {
    color: var(--cyan);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
    margin-bottom: 12px;
}

.identity-panel h1 {
    font-size: 48px;
    line-height: 1.04;
    font-weight: 750;
    letter-spacing: 0;
    color: var(--text);
    margin-bottom: 16px;
}

.tagline {
    max-width: 260px;
    color: var(--muted);
    font-size: 16px;
}

.social-links {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
}

.social-link {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #d8e4f2;
    background: rgba(13, 21, 34, 0.74);
    border: 1px solid var(--line);
    text-decoration: none;
    transition: color 180ms ease, background 180ms ease, border-color 180ms ease, transform 180ms ease;
}

.social-link:hover,
.social-link:focus-visible {
    transform: translateY(-2px);
    outline: none;
}

.social-link:focus-visible {
    border-color: var(--cyan);
    box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.18);
}

.social-link.telegram:hover { color: #fff; background: #229ed9; border-color: #229ed9; }
.social-link.youtube:hover { color: #fff; background: #ff0000; border-color: #ff0000; }
.social-link.medium:hover { color: #fff; background: #00ab6c; border-color: #00ab6c; }
.social-link.habr:hover { color: #fff; background: #65a3be; border-color: #65a3be; }
.social-link.x:hover { color: #fff; background: #000; border-color: #fff; }

.copy {
    color: var(--dim);
    font-size: 13px;
}

.projects-panel {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 18px;
}

.projects-heading h2 {
    font-size: 30px;
    line-height: 1.1;
    font-weight: 720;
    letter-spacing: 0;
}

.projects-grid {
    display: grid;
    gap: 16px;
}

.project-card {
    display: grid;
    grid-template-columns: minmax(140px, 220px) minmax(0, 1fr);
    gap: 0;
    min-height: 148px;
    color: inherit;
    text-decoration: none;
    background: linear-gradient(135deg, rgba(13, 21, 34, 0.9), rgba(7, 28, 43, 0.72));
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 18px 42px var(--shadow);
    transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
}

.project-card:hover,
.project-card:focus-visible {
    transform: translateY(-3px);
    border-color: var(--line-strong);
    box-shadow: 0 22px 48px rgba(14, 165, 233, 0.22);
    outline: none;
}

.preview {
    min-height: 148px;
    background: rgba(3, 7, 18, 0.8);
    border-right: 1px solid var(--line);
    overflow: hidden;
}

.preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.project-info {
    padding: 22px 24px;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.project-info h3 {
    color: var(--text);
    font-size: 22px;
    line-height: 1.18;
    font-weight: 700;
    letter-spacing: 0;
    margin-bottom: 8px;
}

.project-info p {
    color: var(--muted);
    font-size: 15px;
    max-width: 420px;
}

@media (max-width: 860px) {
    .dashboard-shell {
        min-height: 100vh;
        grid-template-columns: 1fr;
        gap: 28px;
        padding: 34px 18px 42px;
    }

    .identity-panel {
        padding: 0 0 26px;
        border-right: 0;
        border-bottom: 1px solid var(--line);
    }

    .identity-panel h1 {
        font-size: 38px;
    }

    .tagline {
        max-width: 420px;
    }

    .projects-panel {
        justify-content: flex-start;
    }
}

@media (max-width: 620px) {
    .project-card {
        grid-template-columns: 1fr;
    }

    .preview {
        aspect-ratio: 16 / 9;
        min-height: 0;
        border-right: 0;
        border-bottom: 1px solid var(--line);
    }

    .project-info {
        padding: 18px;
    }

    .projects-heading h2 {
        font-size: 26px;
    }
}

@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-duration: 0.001ms !important;
    }

    .sparse-cell.is-live {
        animation: none;
    }
}
```

- [ ] **Step 4: Run the CSS contract tests and verify GREEN**

Run:

```bash
node --test tests/styles-contract.test.mjs
```

Expected: PASS with 4 passing tests.

- [ ] **Step 5: Run the full Node test suite**

Run:

```bash
node --test tests/*.test.mjs
```

Expected: PASS with all tests from `sparse-field.test.mjs`, `homepage-structure.test.mjs`, and `styles-contract.test.mjs`.

- [ ] **Step 6: Commit the dashboard CSS**

Run:

```bash
git add styles.css tests/styles-contract.test.mjs
git commit -m "feat: style neural dashboard homepage"
```

## Task 4: Browser Verification and Final Cleanup

**Files:**
- Verify: `index.html`
- Verify: `styles.css`
- Verify: `sparse-field.mjs`

- [ ] **Step 1: Run whitespace and test verification**

Run:

```bash
git diff --check
node --test tests/*.test.mjs
```

Expected: `git diff --check` exits 0, then Node reports all tests passing.

- [ ] **Step 2: Start a local static server**

Run:

```bash
python -m http.server 8000
```

Expected: server prints `Serving HTTP on :: port 8000` or `Serving HTTP on 0.0.0.0 port 8000`. If port 8000 is occupied, use `python -m http.server 8001`.

- [ ] **Step 3: Verify desktop layout in the in-app browser**

Open `http://localhost:8000` or `http://localhost:8001`.

Check:

- Left identity panel is visible.
- Right project area has three project cards.
- Sparse square activations appear across the full background.
- No visible line grid appears.
- Hovering or focusing a project card shows the cyan/teal border and lift.
- Project and social links are clickable targets.

- [ ] **Step 4: Verify mobile layout in the in-app browser**

Set viewport to a narrow mobile size such as 390 by 844 and reload.

Check:

- Identity panel stacks above projects.
- Social icons wrap cleanly.
- Project cards stack without text overlap.
- Preview images preserve their aspect ratio.

- [ ] **Step 5: Verify runtime hooks from the browser**

In the browser context, read these facts:

```js
({
  cells: document.querySelectorAll('.sparse-cell').length,
  motion: document.querySelector('[data-sparse-field]')?.dataset.motion,
  projectLinks: Array.from(document.querySelectorAll('.project-card')).map((link) => link.getAttribute('href')),
  socialLinks: Array.from(document.querySelectorAll('.social-link')).map((link) => link.getAttribute('href'))
})
```

Expected:

```js
{
  cells: 42,
  motion: 'animated',
  projectLinks: ['bug_web/index.html', 'tonic/index.html', 'spike/index.html'],
  socialLinks: [
    'https://telegram.me/neuro_cyber',
    'https://youtube.com/@it.belkin/videos',
    'https://medium.com/@it.belkin',
    'https://habr.com/ru/users/aigame/articles/',
    'https://twitter.com/it_belkin'
  ]
}
```

- [ ] **Step 6: Commit final verification adjustments if any files changed**

If browser verification requires changes, run tests again, then commit:

```bash
git add index.html styles.css sparse-field.mjs tests
git commit -m "fix: polish homepage verification details"
```

If no files changed during verification, skip this commit.
