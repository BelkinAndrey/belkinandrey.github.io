import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getPrimaryLink } from '../projects.mjs';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const projects = JSON.parse(await readFile(new URL('../data/projects.json', import.meta.url), 'utf8'));
const projectUrls = projects.flatMap((project) => project.links.map((link) => link.url));

test('homepage contains the sparse field hook and module scripts', () => {
  assert.match(html, /data-sparse-field/);
  assert.match(html, /type="module"\s+src="sparse-field\.mjs"/);
  assert.match(html, /type="module"\s+src="projects\.mjs"/);
});

test('homepage uses the neural dashboard composition hooks', () => {
  assert.match(html, /class="dashboard-shell"/);
  assert.match(html, /class="identity-panel"/);
  assert.match(html, /class="projects-panel"/);
  assert.match(html, /class="projects-grid"/);
  assert.match(html, /data-projects-grid/);
});

test('projects data preserves project destinations', () => {
  assert.ok(projectUrls.includes('bug_web/index.html'));
  assert.ok(projectUrls.includes('tonic/index.html'));
  assert.ok(projectUrls.includes('spike/index.html'));
});

test('project links can include page, source, and youtube together', () => {
  const project = {
    links: [
      { type: 'source', url: 'https://github.com/BelkinAndrey/example' },
      { type: 'youtube', url: 'https://youtube.com/watch?v=example' },
      { type: 'page', url: 'example/index.html', primary: true },
    ],
  };

  assert.equal(getPrimaryLink(project).url, 'example/index.html');
});

test('homepage preserves social destinations', () => {
  assert.match(html, /href="https:\/\/telegram\.me\/neuro_cyber"/);
  assert.match(html, /href="https:\/\/youtube\.com\/@it\.belkin\/videos"/);
  assert.match(html, /href="https:\/\/medium\.com\/@it\.belkin"/);
  assert.match(html, /href="https:\/\/habr\.com\/ru\/users\/aigame\/articles\/"/);
  assert.match(html, /href="https:\/\/github\.com\/BelkinAndrey"/);
  assert.match(html, /href="https:\/\/twitter\.com\/it_belkin"/);
});
