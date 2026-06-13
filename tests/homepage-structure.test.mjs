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
