// The placeholder's version is the package's, so the two never disagree until design step 9 replaces
// it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { BASE_VERSION } from '../src/index.js';
import { BASE } from './fixtures.mjs';

it('BASE_VERSION is the version in package.json, an integer version', () => {
  const pkg = JSON.parse(readFileSync(join(BASE, 'package.json'), 'utf8')) as { version: string };
  expect(BASE_VERSION).toBe(pkg.version);
  expect(pkg.version).toMatch(/^[1-9][0-9]*\.0\.0$/);
});
