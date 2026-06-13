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
