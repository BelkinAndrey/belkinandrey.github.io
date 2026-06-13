import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSparseField,
  DEFAULT_FIELD_OPTIONS,
  getGridMetrics,
  pickCellColor,
  pickSparseCellPosition,
  prefersReducedMotion
} from '../sparse-field.mjs';

function createFakeWindow() {
  const scheduledTimers = new Set();
  let nextTimerId = 1;

  return {
    scheduledTimers,
    matchMedia() {
      return { matches: false };
    },
    setTimeout(callback, delay) {
      const id = nextTimerId;
      nextTimerId += 1;
      scheduledTimers.add({ id, callback, delay });
      return id;
    },
    clearTimeout(id) {
      for (const timer of scheduledTimers) {
        if (timer.id === id) {
          scheduledTimers.delete(timer);
        }
      }
    }
  };
}

function createFakeStyle() {
  const properties = new Map();

  return {
    properties,
    setProperty(name, value) {
      properties.set(name, value);
    }
  };
}

class FakeElement {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.style = createFakeStyle();
    this.className = '';
    this.rect = { width: 120, height: 90 };
    this.classList = {
      add: (className) => {
        const classes = new Set(this.className.split(' ').filter(Boolean));
        classes.add(className);
        this.className = [...classes].join(' ');
      },
      remove: (className) => {
        const classes = this.className.split(' ').filter((name) => name && name !== className);
        this.className = classes.join(' ');
      }
    };
  }

  set textContent(value) {
    this._textContent = value;
    if (value === '') {
      this.children = [];
    }
  }

  get textContent() {
    return this._textContent ?? '';
  }

  append(child) {
    this.children.push(child);
  }

  getBoundingClientRect() {
    return this.rect;
  }

  querySelectorAll(selector) {
    const className = selector.startsWith('.') ? selector.slice(1) : selector;
    return this.children.filter((child) => child.className.split(' ').includes(className));
  }
}

function createFakeDocument(win) {
  return {
    defaultView: win,
    createElement() {
      return new FakeElement(this);
    }
  };
}

function createFakeContainer({ width = 120, height = 90 } = {}) {
  const win = createFakeWindow();
  const doc = createFakeDocument(win);
  const container = new FakeElement(doc);
  container.rect = { width, height };

  return { container, win };
}

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

test('pickSparseCellPosition clamps zero-sized fields to non-negative coordinates', () => {
  const metrics = getGridMetrics({ width: 0, height: 0, tileSize: 30, cellSize: 10 });
  const position = pickSparseCellPosition(() => 0, metrics);

  assert.deepEqual(position, { x: 0, y: 0 });
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

test('createSparseField creates animated cells and marks animated motion', () => {
  const { container } = createFakeContainer();

  createSparseField(container, {
    poolSize: 3,
    random: () => 0,
    reducedMotion: false
  });

  assert.equal(container.dataset.motion, 'animated');
  assert.equal(container.querySelectorAll('.sparse-cell').length, 3);
});

test('createSparseField creates static cells and marks reduced motion', () => {
  const { container } = createFakeContainer();

  createSparseField(container, {
    poolSize: 5,
    staticCellCount: 2,
    random: () => 0,
    reducedMotion: true
  });

  assert.equal(container.dataset.motion, 'reduced');
  assert.equal(container.querySelectorAll('.sparse-cell-static').length, 2);
});

test('createSparseField stop clears scheduled timeouts in animated mode', () => {
  const { container, win } = createFakeContainer();
  const field = createSparseField(container, {
    poolSize: 2,
    random: () => 0,
    reducedMotion: false
  });

  assert.equal(win.scheduledTimers.size, 1);
  field.stop();
  assert.equal(win.scheduledTimers.size, 0);
});
