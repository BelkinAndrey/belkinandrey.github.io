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
