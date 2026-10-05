// check.mjs (and vendor.mjs, which writes the copy it checks) on the oldest Node the editions run:
// desktop's manifest says Node 18 or later. node:test and the fixtures only, no package, so CI runs
// it on Node 18 without npm ci, on Linux and on Windows; `npm run test:node18` runs it here.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { commitAll, git, makeEdition, makeTmp, node, put, removeTmp, testEnv, twoReleases } from '../fixtures.mjs';

/** @param {(t: { env: NodeJS.ProcessEnv, base: string, edition: string, check: () => { status: number | null, out: string } }) => void} body */
function withCopy(body) {
  return () => {
    const tmp = makeTmp();
    try {
      const env = testEnv(tmp);
      const base = twoReleases(env, tmp);
      git(env, base, 'checkout', '-q', 'v1.0.0');
      const edition = makeEdition(env, tmp);
      const v = node(env, base, join(base, 'tools', 'vendor.mjs'), 'vendor', '--into', edition, '--edition', 'desktop');
      assert.equal(v.status, 0, v.out);
      commitAll(env, edition, 'beethoven-base v1.0.0');
      git(env, edition, 'push', '-q', 'origin', 'main');
      body({ env, base, edition, check: () => node(env, edition, join('vendor', 'beethoven-base', 'check.mjs')) });
    } finally {
      removeTmp(tmp);
    }
  };
}

test(`Node ${process.versions.node}: a fresh copy passes`, withCopy(({ check }) => {
  const r = check();
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /3 files match ORIGIN \(beethoven-base v1\.0\.0/);
}));

test('a changed file fails', withCopy(({ edition, check }) => {
  put(edition, { 'src/base/links.ts': 'export const LINK = 1;\n' });
  const r = check();
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /src\/base\/links\.ts differs from ORIGIN/);
}));

test('an extra file fails', withCopy(({ edition, check }) => {
  put(edition, { 'src/base/extra.ts': 'export const EXTRA = 1;\n' });
  const r = check();
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /does not list.*src\/base\/extra\.ts/);
}));

test("a copy older than the base branch's fails", withCopy(({ env, base, edition, check }) => {
  git(env, edition, 'branch', 'feature');
  git(env, base, 'checkout', '-q', 'v2.0.0');
  const v = node(env, base, join(base, 'tools', 'vendor.mjs'), 'vendor', '--into', edition, '--edition', 'desktop');
  assert.equal(v.status, 1, v.out);
  put(edition, { 'src/base/steps.ts': null });
  commitAll(env, edition, 'beethoven-base v2.0.0');
  git(env, edition, 'push', '-q', 'origin', 'main');
  git(env, edition, 'checkout', '-q', 'feature');
  const r = check();
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /ORIGIN records v1\.0\.0, older than v2\.0\.0 on origin\/main/);
}));
