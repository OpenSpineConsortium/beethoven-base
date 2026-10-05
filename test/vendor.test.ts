// tools/vendor.mjs against throwaway repositories: a base with releases v1.0.0 and v2.0.0, and an
// edition with an origin/main. Each test makes its own folder and removes only that.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASE, commitAll, git, makeBase, makeEdition, MODULES, node, put, removeTmp, makeTmp, testEnv, twoReleases } from './fixtures.mjs';

let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = makeTmp();
  env = testEnv(tmp);
});
afterEach(() => removeTmp(tmp));

const sha = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const read = (root: string, rel: string) => readFileSync(join(root, ...rel.split('/')));
const vendor = (base: string, edition: string, name = 'desktop') => node(env, base, join(base, 'tools', 'vendor.mjs'), 'vendor', '--into', edition, '--edition', name);
const check = (edition: string, ...args: string[]) => node(env, edition, join(edition, 'vendor', 'beethoven-base', 'check.mjs'), ...args);
const unix = process.platform === 'win32' ? it.skip : it;

describe('vendor', () => {
  it('writes the listed modules, check.mjs and ORIGIN from the tag, and the edition check passes', () => {
    const base = twoReleases(env, tmp);
    git(env, base, 'checkout', '-q', 'v1.0.0');
    const edition = makeEdition(env, tmp);
    const r = vendor(base, edition);
    expect(r.out).toContain('beethoven-base v1.0.0');
    expect(r.status).toBe(0);

    expect(read(edition, 'src/base/links.ts').toString()).toBe(MODULES['src/links.ts']);
    expect(read(edition, 'src/base/steps.ts').toString()).toBe(MODULES['src/steps.ts']);
    expect(read(edition, 'vendor/beethoven-base/check.mjs').equals(read(base, 'vendor/check.mjs'))).toBe(true);

    // ORIGIN, recomputed here from the bytes by the documented rule, not by the tool's own code
    const entries: Array<[string, string]> = ['src/base/links.ts', 'src/base/steps.ts', 'vendor/beethoven-base/check.mjs'].map((p) => [p, sha(read(edition, p))]);
    const tree = sha(entries.map(([p, d]) => `${p}\0${d}\n`).join(''));
    const commit = git(env, base, 'rev-parse', 'v1.0.0^{commit}').trim();
    expect(read(edition, 'vendor/beethoven-base/ORIGIN').toString()).toBe(
      [
        'repository: OpenSpineConsortium/beethoven-base',
        'ref: v1.0.0',
        `commit: ${commit}`,
        `tree_sha256: ${tree}`,
        'files: 3',
        'edition: desktop',
        ...entries.map(([p, d]) => `file: ${p} ${d}`),
        '',
      ].join('\n'),
    );
    const c = check(edition);
    expect(c.out).toContain('3 files match ORIGIN');
    expect(c.status).toBe(0);
  });

  it("gives the browser its own list at extension/src/base and nothing of another edition's", () => {
    const base = twoReleases(env, tmp);
    git(env, base, 'checkout', '-q', 'v1.0.0');
    const edition = makeEdition(env, tmp);
    expect(vendor(base, edition, 'browser').status).toBe(0);
    expect(existsSync(join(edition, 'extension', 'src', 'base', 'links.ts'))).toBe(true);
    expect(existsSync(join(edition, 'extension', 'src', 'base', 'steps.ts'))).toBe(false);
    expect(existsSync(join(edition, 'src'))).toBe(false);
    expect(check(edition).status).toBe(0);
  });

  it('prints the git rm line for a module the new release dropped, deletes nothing, and the check fails until it is removed', () => {
    const base = twoReleases(env, tmp);
    git(env, base, 'checkout', '-q', 'v1.0.0');
    const edition = makeEdition(env, tmp);
    expect(vendor(base, edition).status).toBe(0);
    commitAll(env, edition, 'beethoven-base v1.0.0');
    git(env, edition, 'push', '-q', 'origin', 'main');

    git(env, base, 'checkout', '-q', 'v2.0.0');
    const r = vendor(base, edition);
    expect(r.status).toBe(1);
    expect(r.out).toContain('nothing was deleted');
    const line = r.out.split('\n').map((l) => l.trim()).find((l) => l.startsWith('rm -- '));
    expect(line).toBe('rm -- src/base/steps.ts && git rm -q --cached --ignore-unmatch -- src/base/steps.ts');
    expect(existsSync(join(edition, 'src', 'base', 'steps.ts'))).toBe(true);
    expect(read(edition, 'vendor/beethoven-base/ORIGIN').toString()).toContain('ref: v2.0.0');

    const before = check(edition);
    expect(before.status).toBe(1);
    expect(before.out).toContain('src/base/steps.ts');

    const sh = spawnSync('sh', ['-c', line as string], { cwd: edition, env, encoding: 'utf8' });
    expect(sh.status).toBe(0);
    expect(check(edition).status).toBe(0);
  });

  it('refuses a base checkout with an untracked file, and writes nothing', () => {
    const base = twoReleases(env, tmp);
    const edition = makeEdition(env, tmp);
    put(base, { 'notes.txt': 'not committed\n' });
    const r = vendor(base, edition);
    expect(r.status).toBe(2);
    expect(r.out).toContain('uncommitted or untracked');
    expect(existsSync(join(edition, 'vendor'))).toBe(false);
    expect(existsSync(join(edition, 'src'))).toBe(false);
  });

  it('refuses a HEAD that carries no release tag', () => {
    const base = twoReleases(env, tmp);
    put(base, { 'src/links.ts': 'export const LINK = 1;\n' });
    commitAll(env, base, 'after the tag');
    const edition = makeEdition(env, tmp);
    const r = vendor(base, edition);
    expect(r.status).toBe(2);
    expect(r.out).toContain('carries no release tag');
    expect(existsSync(join(edition, 'vendor'))).toBe(false);
  });

  it('refuses a file added by hand to the copy, and leaves it and the record as they are', () => {
    const base = twoReleases(env, tmp);
    git(env, base, 'checkout', '-q', 'v1.0.0');
    const edition = makeEdition(env, tmp);
    expect(vendor(base, edition).status).toBe(0);
    const origin = read(edition, 'vendor/beethoven-base/ORIGIN');
    put(edition, { 'src/base/extra.ts': 'export const EXTRA = 1;\n' });
    git(env, base, 'checkout', '-q', 'v2.0.0');
    const r = vendor(base, edition);
    expect(r.status).toBe(2);
    expect(r.out).toContain('does not list');
    expect(r.out).toContain('src/base/extra.ts');
    expect(read(edition, 'vendor/beethoven-base/ORIGIN').equals(origin)).toBe(true);
    expect(read(edition, 'src/base/links.ts').toString()).toBe(MODULES['src/links.ts']);
  });

  it("refuses a release older than the one on the edition's origin/main", () => {
    const base = twoReleases(env, tmp);
    const edition = makeEdition(env, tmp);
    git(env, edition, 'branch', 'before-base');
    expect(vendor(base, edition).status).toBe(0); // v2.0.0, HEAD's tag
    commitAll(env, edition, 'beethoven-base v2.0.0');
    git(env, edition, 'push', '-q', 'origin', 'main');

    git(env, edition, 'checkout', '-q', 'before-base'); // no copy here; origin/main has v2.0.0
    git(env, base, 'checkout', '-q', 'v1.0.0');
    const r = vendor(base, edition);
    expect(r.status).toBe(2);
    expect(r.out).toContain("origin/main's vendor/beethoven-base/ORIGIN records v2.0.0, newer than v1.0.0");
    expect(existsSync(join(edition, 'vendor'))).toBe(false);
  });

  it('refuses a release older than the copy already there', () => {
    const base = twoReleases(env, tmp);
    const edition = makeEdition(env, tmp);
    expect(vendor(base, edition).status).toBe(0);
    git(env, base, 'checkout', '-q', 'v1.0.0');
    const r = vendor(base, edition);
    expect(r.status).toBe(2);
    expect(r.out).toContain('records v2.0.0, newer than v1.0.0');
  });

  it('takes another release over a copy that is not committed yet but is exactly what its ORIGIN says', () => {
    const base = twoReleases(env, tmp);
    git(env, base, 'checkout', '-q', 'v1.0.0');
    const edition = makeEdition(env, tmp);
    expect(vendor(base, edition, 'browser').status).toBe(0);
    git(env, base, 'checkout', '-q', 'v2.0.0');
    const r = vendor(base, edition, 'browser');
    expect(r.status).toBe(0);
    expect(read(edition, 'extension/src/base/links.ts').toString()).toContain('(?:ai|com)');
  });

  it('refuses to replace a module that holds changes neither ORIGIN nor a commit has', () => {
    const base = twoReleases(env, tmp);
    git(env, base, 'checkout', '-q', 'v1.0.0');
    const edition = makeEdition(env, tmp);
    expect(vendor(base, edition, 'browser').status).toBe(0);
    commitAll(env, edition, 'beethoven-base v1.0.0');
    put(edition, { 'extension/src/base/links.ts': 'export const LINK = "edited";\n' });
    git(env, base, 'checkout', '-q', 'v2.0.0');
    const r = vendor(base, edition, 'browser');
    expect(r.status).toBe(2);
    expect(r.out).toContain('extension/src/base/links.ts has changes that neither its ORIGIN nor a commit holds');
    expect(read(edition, 'extension/src/base/links.ts').toString()).toBe('export const LINK = "edited";\n');
  });

  unix('refuses a symbolic link inside the copy, and the edition check fails on it', () => {
    const base = twoReleases(env, tmp);
    git(env, base, 'checkout', '-q', 'v1.0.0');
    const edition = makeEdition(env, tmp);
    expect(vendor(base, edition).status).toBe(0);
    symlinkSync('../../README.md', join(edition, 'src', 'base', 'readme.ts'));
    git(env, base, 'checkout', '-q', 'v2.0.0');
    const r = vendor(base, edition);
    expect(r.status).toBe(2);
    expect(r.out).toContain('src/base/readme.ts');
    expect(r.out).toContain('a link');
    const c = check(edition);
    expect(c.status).toBe(1);
    expect(c.out).toContain('src/base/readme.ts is a link');
  });

  unix('refuses a link on the way to the copy and writes nothing through it', () => {
    const base = twoReleases(env, tmp);
    const edition = makeEdition(env, tmp);
    const elsewhere = join(tmp, 'elsewhere');
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(edition, 'vendor'));
    const r = vendor(base, edition);
    expect(r.status).toBe(2);
    expect(r.out).toContain('vendor is a link');
    expect(spawnSync('ls', ['-A', elsewhere], { encoding: 'utf8' }).stdout).toBe('');
    expect(existsSync(join(edition, 'src'))).toBe(false);
  });

  it('refuses a list that leaves out a module one of its modules imports', () => {
    const base = makeBase(env, tmp, [
      {
        tag: 'v1.0.0',
        files: {
          ...MODULES,
          'editions/desktop.json': '{ "modules": ["steps.ts"] }\n',
          'editions/browser.json': '{ "modules": [] }\n',
          'editions/vscode.json': '{ "modules": [] }\n',
        },
      },
    ]);
    const edition = makeEdition(env, tmp);
    const r = vendor(base, edition);
    expect(r.status).toBe(2);
    expect(r.out).toContain('src/steps.ts imports ./links.js, which editions/desktop.json does not list');
    expect(existsSync(join(edition, 'src'))).toBe(false);
  });

  it('refuses an edition it does not know, and a target that is base itself', () => {
    const base = twoReleases(env, tmp);
    const edition = makeEdition(env, tmp);
    expect(vendor(base, edition, 'phone').out).toContain('--edition must be one of desktop, browser, vscode');
    const self = vendor(base, base);
    expect(self.status).toBe(2);
    expect(self.out).toContain('into itself');
  });
});

describe('check --source (the anchored check, from base)', () => {
  it('catches an edited check.mjs whose ORIGIN was rewritten to match, which the copy alone cannot', () => {
    const base = twoReleases(env, tmp);
    git(env, base, 'checkout', '-q', 'v1.0.0');
    const edition = makeEdition(env, tmp);
    expect(vendor(base, edition).status).toBe(0);
    const anchored = () => node(env, base, join(base, 'tools', 'vendor.mjs'), 'check', '--into', edition, '--source', base);
    expect(anchored().status).toBe(0);

    // the forgery: a check.mjs that vouches for anything, and an ORIGIN rewritten by the same rule
    const forged = `process.exitCode = 0; // forged\n${read(edition, 'vendor/beethoven-base/check.mjs').toString()}`;
    writeFileSync(join(edition, 'vendor', 'beethoven-base', 'check.mjs'), forged);
    const forgedLine = `file: vendor/beethoven-base/check.mjs ${sha(forged)}`;
    const lines = read(edition, 'vendor/beethoven-base/ORIGIN')
      .toString()
      .split('\n')
      .map((l) => (l.startsWith('file: vendor/beethoven-base/check.mjs ') ? forgedLine : l));
    const pairs = lines.filter((l) => l.startsWith('file: ')).map((l) => l.slice('file: '.length).split(' '));
    const tree = sha(pairs.map(([p, d]) => `${p}\0${d}\n`).join(''));
    const rewritten = lines.map((l) => (l.startsWith('tree_sha256: ') ? `tree_sha256: ${tree}` : l));
    writeFileSync(join(edition, 'vendor', 'beethoven-base', 'ORIGIN'), rewritten.join('\n'));
    expect(check(edition).status).toBe(0); // the copy checking itself is fooled, as documented

    const r = anchored();
    expect(r.status).toBe(1);
    expect(r.out).toContain("vendor/beethoven-base/check.mjs is not");
  });

  it('refuses a --source that is not the checkout it runs from', () => {
    const base = twoReleases(env, tmp);
    const edition = makeEdition(env, tmp);
    expect(vendor(base, edition).status).toBe(0);
    const r = node(env, base, join(base, 'tools', 'vendor.mjs'), 'check', '--into', edition, '--source', edition);
    expect(r.status).toBe(1);
    expect(r.out).toContain('is not the checkout this command runs from');
  });
});

describe('lists (vendor-check-self)', () => {
  const lists = (base: string) => node(env, base, join(base, 'tools', 'vendor.mjs'), 'lists');

  it('passes lists that name modules that exist and carry their imports', () => {
    const base = twoReleases(env, tmp);
    const r = lists(base);
    expect(r.out).toContain('desktop 1, browser 1, vscode 0');
    expect(r.status).toBe(0);
  });

  it('fails a list that names a missing module, one that leaves out an import, and a list file of no edition', () => {
    const base = twoReleases(env, tmp);
    put(base, {
      'editions/desktop.json': '{ "modules": ["steps.ts"] }\n',
      'editions/browser.json': '{ "modules": ["gone.ts"] }\n',
      'editions/phone.json': '{ "modules": [] }\n',
    });
    const r = lists(base);
    expect(r.status).toBe(1);
    expect(r.out).toContain('src/steps.ts imports ./links.js, which editions/desktop.json does not list');
    expect(r.out).toContain('editions/browser.json names gone.ts, and src/gone.ts is missing');
    expect(r.out).toContain('editions/phone.json names no edition');
  });

  it("passes this repository's own lists", () => {
    const r = node(env, BASE, join(BASE, 'tools', 'vendor.mjs'), 'lists');
    expect(r.out).toContain('desktop 0, browser 0, vscode 0');
    expect(r.status).toBe(0);
  });
});
