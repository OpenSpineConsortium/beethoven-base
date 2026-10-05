// vendor/check.mjs as an edition runs it (node vendor/beethoven-base/check.mjs), against a copy that
// tools/vendor.mjs wrote into a throwaway edition with an origin/main.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASE, commitAll, git, makeEdition, makeTmp, node, put, removeTmp, testEnv, twoReleases } from './fixtures.mjs';

let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = makeTmp();
  env = testEnv(tmp);
});
afterEach(() => removeTmp(tmp));

const vendor = (base: string, edition: string) => node(env, base, join(base, 'tools', 'vendor.mjs'), 'vendor', '--into', edition, '--edition', 'desktop');
const check = (edition: string, ...args: string[]) => node(env, edition, join('vendor', 'beethoven-base', 'check.mjs'), ...args);

/** an edition whose main (local and origin) carries the v1.0.0 copy */
function vendored(tag = 'v1.0.0'): { base: string; edition: string } {
  const base = twoReleases(env, tmp);
  git(env, base, 'checkout', '-q', tag);
  const edition = makeEdition(env, tmp);
  expect(vendor(base, edition).status).toBe(0);
  commitAll(env, edition, `beethoven-base ${tag}`);
  git(env, edition, 'push', '-q', 'origin', 'main');
  return { base, edition };
}

describe('check.mjs in an edition', () => {
  it("passes a fresh copy, and says what origin/main records", () => {
    const { edition } = vendored();
    const r = check(edition);
    expect(r.out).toContain('origin/main records v1.0.0');
    expect(r.out).toContain('3 files match ORIGIN (beethoven-base v1.0.0');
    expect(r.status).toBe(0);
  });

  it('fails on a file that differs from ORIGIN', () => {
    const { edition } = vendored();
    put(edition, { 'src/base/links.ts': 'export const LINK = /anything/;\n' });
    const r = check(edition);
    expect(r.status).toBe(1);
    expect(r.out).toContain('src/base/links.ts differs from ORIGIN');
  });

  it('fails on a file ORIGIN does not list, in the modules folder or beside ORIGIN', () => {
    const { edition } = vendored();
    put(edition, { 'src/base/extra.ts': 'export const EXTRA = 1;\n', 'vendor/beethoven-base/notes.md': 'hi\n' });
    const r = check(edition);
    expect(r.status).toBe(1);
    expect(r.out).toContain('files ORIGIN does not list (added by hand, or left over from an older release): src/base/extra.ts, vendor/beethoven-base/notes.md');
    expect(r.out).toContain('rm -- src/base/extra.ts vendor/beethoven-base/notes.md && git rm -q --cached --ignore-unmatch --');
  });

  it('fails on a listed file that is missing', () => {
    const { edition } = vendored();
    put(edition, { 'src/base/steps.ts': null });
    const r = check(edition);
    expect(r.status).toBe(1);
    expect(r.out).toContain('src/base/steps.ts is listed in ORIGIN and missing');
  });

  it("fails when ORIGIN's release is older than the base branch's: a rebase that took the older side", () => {
    const { base, edition } = vendored();
    git(env, edition, 'branch', 'feature'); // carries the v1.0.0 copy
    git(env, base, 'checkout', '-q', 'v2.0.0');
    expect(vendor(base, edition).status).toBe(1); // v2.0.0 drops steps.ts from desktop's list
    put(edition, { 'src/base/steps.ts': null });
    commitAll(env, edition, 'beethoven-base v2.0.0');
    git(env, edition, 'push', '-q', 'origin', 'main');
    expect(check(edition).status).toBe(0);

    git(env, edition, 'checkout', '-q', 'feature');
    const r = check(edition);
    expect(r.status).toBe(1);
    expect(r.out).toContain('ORIGIN records v1.0.0, older than v2.0.0 on origin/main');
  });

  it('reads the base branch from --base, else GITHUB_BASE_REF, and fails when the clone does not have it', () => {
    const { edition } = vendored();
    const flagged = check(edition, '--base', 'release');
    expect(flagged.status).toBe(1);
    expect(flagged.out).toContain('origin/release is not in this clone');
    expect(flagged.out).toContain('fetch-depth: 0');
    const fromEnv = node({ ...env, GITHUB_BASE_REF: 'next' }, edition, join('vendor', 'beethoven-base', 'check.mjs'));
    expect(fromEnv.status).toBe(1);
    expect(fromEnv.out).toContain('origin/next is not in this clone');
  });

  it('passes when the base branch holds no copy yet, saying so', () => {
    const base = twoReleases(env, tmp);
    const edition = makeEdition(env, tmp);
    expect(vendor(base, edition).status).toBe(0);
    const r = check(edition);
    expect(r.out).toContain('origin/main holds no copy of beethoven-base yet');
    expect(r.status).toBe(0);
  });

  it('fails on an ORIGIN whose counts disagree with its own file lines', () => {
    const { edition } = vendored();
    const path = join(edition, 'vendor', 'beethoven-base', 'ORIGIN');
    writeFileSync(path, readFileSync(path, 'utf8').replace('files: 3', 'files: 2'));
    const r = check(edition);
    expect(r.status).toBe(1);
    expect(r.out).toContain('the record was edited by hand');
  });

  it('fails on an unreadable ORIGIN, and refuses to run as the template in base', () => {
    const { edition } = vendored();
    writeFileSync(join(edition, 'vendor', 'beethoven-base', 'ORIGIN'), 'repository: elsewhere\n');
    const r = check(edition);
    expect(r.status).toBe(1);
    expect(r.out).toContain('vendor/beethoven-base/ORIGIN cannot be read');
    const template = node(env, BASE, join(BASE, 'vendor', 'check.mjs'));
    expect(template.status).toBe(2);
    expect(template.out).toContain("this is beethoven-base's template");
  });

  it('works from any current folder, since it finds the edition from its own place', () => {
    const { edition } = vendored();
    const r = node(env, tmp, join(edition, 'vendor', 'beethoven-base', 'check.mjs'));
    expect(r.status).toBe(0);
  });
});
