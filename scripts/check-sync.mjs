#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.resolve(process.env.MEDVENTURE_ROOT || path.join(projectRoot, '../MedVenture'));
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'coredeck-sync-'));

async function files(root, directory = root) {
  const output = [];
  for (const name of (await readdir(directory)).sort()) {
    const absolute = path.join(directory, name);
    const metadata = await stat(absolute);
    if (metadata.isDirectory()) output.push(...await files(root, absolute));
    else output.push(path.relative(root, absolute));
  }
  return output;
}

async function digest(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

try {
  execFileSync(process.execPath, [path.join(projectRoot, 'scripts/sync-medventure.mjs'), '--source', sourceRoot, '--output', temporaryRoot], { stdio: 'inherit' });
  const committedFiles = (await files(path.join(projectRoot, 'public'))).filter((name) => name === 'data/coredeck.json' || name === 'coredeck-icon.svg' || name.startsWith('media/'));
  const generatedFiles = await files(temporaryRoot);
  if (JSON.stringify(committedFiles) !== JSON.stringify(generatedFiles)) throw new Error('Generated file list differs from the committed snapshot');
  for (const relativePath of committedFiles) {
    const [committed, generated] = await Promise.all([digest(path.join(projectRoot, 'public', relativePath)), digest(path.join(temporaryRoot, relativePath))]);
    if (committed !== generated) throw new Error(`Generated content differs: ${relativePath}`);
  }
  console.log(`Deterministic sync verified (${committedFiles.length} files).`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
