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
