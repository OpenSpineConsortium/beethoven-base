// The placeholder's version is the package's, so the two never disagree until pull request #2
// replaces it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { BASE_VERSION } from '../src/index.js';
import { BASE } from './fixtures.mjs';

it('BASE_VERSION is the version in package.json', () => {
  const pkg = JSON.parse(readFileSync(join(BASE, 'package.json'), 'utf8')) as { version: string };
  expect(BASE_VERSION).toBe(pkg.version);
});
