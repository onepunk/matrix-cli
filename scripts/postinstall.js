// node-pty 1.1.0's macOS prebuilt helper can arrive without its executable bit.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { chmodSync, existsSync } from 'node:fs';
if (process.platform === 'darwin') {
  const root = dirname(createRequire(import.meta.url).resolve('node-pty/package.json'));
  for (const relative of [`prebuilds/darwin-${process.arch}/spawn-helper`, 'build/Release/spawn-helper']) {
    const helper = join(root,relative);
    if (existsSync(helper)) chmodSync(helper,0o755);
  }
}
