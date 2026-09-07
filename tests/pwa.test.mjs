import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = process.cwd();

test('PWA manifest identifies coreDECK Web and uses relative scope', async () => {
  const manifest = JSON.parse(await readFile(path.join(projectRoot, 'public/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'coreDECK Web');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(manifest.icons.length > 0);
});

test('service worker precaches the deck snapshot', async () => {
  const worker = await readFile(path.join(projectRoot, 'public/sw.js'), 'utf8');
  assert.match(worker, /data\/coredeck\.json/);
  assert.match(worker, /caches\.open/);
});
