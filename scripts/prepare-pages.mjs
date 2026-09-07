import { access, rename, rmdir } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = path.resolve('dist/client');
const projectDirectory = path.join(outputDirectory, 'coredeck-web');
const nestedAssets = path.join(projectDirectory, '_next');
const publishedAssets = path.join(outputDirectory, '_next');

await access(path.join(outputDirectory, 'index.html'));
await access(path.join(nestedAssets, 'static'));

try {
  await access(publishedAssets);
  throw new Error(`Refusing to overwrite existing Pages assets at ${publishedAssets}`);
} catch (error) {
  if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) throw error;
}

await rename(nestedAssets, publishedAssets);
await rmdir(projectDirectory);
await access(path.join(publishedAssets, 'static'));

console.log('GitHub Pages asset layout is ready.');
