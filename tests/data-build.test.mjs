// The committed data/ is exactly what scripts/build-data.mjs produces from the AccessEMR core repo.
// Skipped when the core repo is not next to this package (set ACCESSEMR_CORE to point at it).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const core = process.env.ACCESSEMR_CORE || fileURLToPath(new URL('../../access-emr-core-safety', import.meta.url));
const skip = existsSync(core) ? false : `AccessEMR core repo not found at ${core}`;

test('build-data --check reproduces data/', { skip }, () => {
  const out = execFileSync(process.execPath, ['scripts/build-data.mjs', '--core', core, '--check'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(out, /up to date/);
});
