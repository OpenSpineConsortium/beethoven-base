// tools/exports.mjs on repositories made in a throwaway folder: a closed export passes, an export that
// leaves out a module one of its modules imports fails naming the export, the file and the import, a
// path that matches no tracked file fails naming the path, and an edition's export with a path outside
// src/ fails naming it.
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASE, git, makeTmp, node, put, removeTmp, testEnv } from './fixtures.mjs';

let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = makeTmp();
  env = testEnv(tmp);
});
afterEach(() => removeTmp(tmp));

const LINKS = "export const LINK = /^https:\\/\\/claude\\.ai\\/code$/;\n";
const STEPS = "import { LINK } from './links.js';\nexport function linked(s: string): boolean {\n  return LINK.test(s);\n}\n";
const exp = (id: string, paths: string[]) => ({ id, kind: 'files', version: 1, summary: id, paths, consumers: [] });

function repo(exports: unknown, files: Record<string, string> = { 'src/links.ts': LINKS, 'src/steps.ts': STEPS }): string {
  const root = join(tmp, 'repo');
  put(root, { 'interface/INTERFACE.json': JSON.stringify({ format: 1, exports, imports: [] }, null, 1) + '\n', ...files });
  return root;
}
const check = (root: string) => node(env, root, join(BASE, 'tools', 'exports.mjs'), root);

describe('exports', () => {
  it("passes this repository's own manifest", () => {
    const r = node(env, BASE, join(BASE, 'tools', 'exports.mjs'));
    expect(r.status, r.out).toBe(0);
  });

  it('passes closed exports, by file, by "*" and by folder', () => {
    const r = check(repo([exp('desktop', ['src/links.ts', 'src/steps.ts']), exp('browser', ['src/links.ts']), exp('vscode', ['src/*.ts']), exp('all', ['src/'])]));
    expect(r.out).toContain('exports: 4 export(s)');
    expect(r.status).toBe(0);
  });

  it('passes no export at all', () => {
    const r = check(repo([]));
    expect(r.out).toContain('exports: 0 export(s)');
    expect(r.status).toBe(0);
  });

  it('fails an export that leaves out a module one of its modules imports, naming the export, the file and the import', () => {
    const r = check(repo([exp('desktop', ['src/links.ts', 'src/steps.ts']), exp('browser', ['src/steps.ts'])]));
    expect(r.status).toBe(1);
    expect(r.out).toContain("exports: export browser: src/steps.ts:1 imports ./links.js, and the export's paths do not cover src/links.ts");
    expect(r.out).not.toContain('export desktop:');
    expect(r.out).toContain('1 finding(s)');
  });

  it('fails a path that matches no tracked file, naming it', () => {
    const r = check(repo([exp('vscode', ['src/links.ts', 'src/nothing.ts', 'src/*.tsx', 'src/lib/']), exp('docs', ['docs/'])]));
    expect(r.status).toBe(1);
    expect(r.out).toContain('export vscode: the path src/nothing.ts matches no tracked file');
    expect(r.out).toContain('export vscode: the path src/*.tsx matches no tracked file');
    expect(r.out).toContain('export vscode: the path src/lib/ matches no tracked file');
    expect(r.out).toContain('export docs: the path docs/ matches no tracked file');
    expect(r.out).toContain('4 finding(s)');
  });

  it("fails an edition's export with a path outside src/, since every module would land one folder deeper, and lets any other export point elsewhere", () => {
    const files = { 'src/links.ts': LINKS, 'src/steps.ts': STEPS, LICENSE: 'all rights reserved\n' };
    const r = check(repo([exp('desktop', ['src/links.ts', 'LICENSE']), exp('notices', ['LICENSE'])], files));
    expect(r.status).toBe(1);
    expect(r.out).toContain(`export desktop: "LICENSE" is not under src/; an edition's copy lands below the folder its paths share`);
    expect(r.out).not.toContain('export notices');
    expect(r.out).toContain('1 finding(s)');
    expect(check(repo([exp('desktop', ['src/links.ts']), exp('notices', ['LICENSE'])], files)).status).toBe(0);
  });

  it('fails an import of "./<name>" or "./<name>.ts", which only "./<name>.js" may be', () => {
    const files = { 'src/links.ts': LINKS, 'src/kinds.ts': 'export type Kind = "a";\n', 'src/a.ts': "import { LINK } from './links';\nimport type { Kind } from './kinds.ts';\nexport const A: [RegExp, Kind] = [LINK, 'a'];\n" };
    const r = check(repo([exp('browser', ['src/'])], files));
    expect(r.status).toBe(1);
    expect(r.out).toContain('export browser: src/a.ts:1 imports ./links, which is no module of base');
    expect(r.out).toContain('export browser: src/a.ts:2 imports ./kinds.ts, which is no module of base');
  });

  it('fails a module that names another file in a triple-slash reference, which an import check would not see', () => {
    const files = { 'src/links.ts': LINKS, 'src/steps.ts': '/// <reference path="./links.ts" />\nexport const A = 1;\n' };
    const r = check(repo([exp('desktop', ['src/steps.ts'])], files));
    expect(r.status).toBe(1);
    expect(r.out).toContain('export desktop: src/steps.ts:1 names ./links.ts in a triple-slash reference');
  });

  it("counts every form of import and export-from, and never a string or a comment that names a module", () => {
    const files = {
      'src/links.ts': LINKS,
      'src/kinds.ts': 'export type Kind = "a" | "b";\n',
      'src/shape.ts': 'export interface Shape { n: number }\n',
      'src/all.ts': "export * from './links.js';\nexport type { Kind } from './kinds.js';\nexport type S = import('./shape.js').Shape;\n// import { X } from './gone.js';\nexport const NOTE = \"from './gone.js'\";\n",
    };
    const r = check(repo([exp('browser', ['src/all.ts'])], files));
    expect(r.status).toBe(1);
    expect(r.out).toContain('src/all.ts:1 imports ./links.js');
    expect(r.out).toContain('src/all.ts:2 imports ./kinds.js');
    expect(r.out).toContain('src/all.ts:3 imports ./shape.js');
    expect(r.out).not.toContain('gone');
    expect(check(repo([exp('browser', ['src/all.ts', 'src/links.ts', 'src/kinds.ts', 'src/shape.ts'])], files)).status).toBe(0);
  });

  it('fails an import of a module that is not there, and one that is no module of base', () => {
    const files = { 'src/links.ts': LINKS, 'src/steps.ts': "import { GONE } from './gone.js';\nimport { readFileSync } from 'node:fs';\nexport const A = [GONE, readFileSync];\n" };
    const r = check(repo([exp('desktop', ['src/'])], files));
    expect(r.status).toBe(1);
    expect(r.out).toContain('export desktop: src/steps.ts:1 imports ./gone.js, and src/gone.ts is not a tracked file');
    expect(r.out).toContain('export desktop: src/steps.ts:2 imports node:fs, which is no module of base');
  });

  it('reads only files under src/ for imports, and only the files the export covers', () => {
    const files = { 'src/links.ts': LINKS, 'src/steps.ts': STEPS, 'docs/notes.ts': "import { X } from './elsewhere.js';\n" };
    expect(check(repo([exp('desktop', ['src/links.ts']), exp('docs', ['docs/'])], files)).status).toBe(0);
  });

  it('counts only what git tracks where the folder is a checkout', () => {
    const root = repo([exp('desktop', ['src/links.ts', 'src/steps.ts'])]);
    git(env, root, 'init', '-q', '-b', 'main');
    git(env, root, 'add', 'interface/INTERFACE.json', 'src/steps.ts');
    git(env, root, 'commit', '-q', '-m', 'steps without links');
    const r = check(root);
    expect(r.status).toBe(1);
    expect(r.out).toContain('export desktop: the path src/links.ts matches no tracked file');
    expect(r.out).toContain('src/steps.ts:1 imports ./links.js, and src/links.ts is not a tracked file');
    git(env, root, 'add', 'src/links.ts');
    expect(check(root).status).toBe(0);
  });

  it('fails a manifest it cannot read, and paths that are not paths inside the repository', () => {
    const root = join(tmp, 'repo');
    put(root, { 'interface/INTERFACE.json': '{ not json' });
    let r = check(root);
    expect([r.status, r.out]).toEqual([1, expect.stringContaining('interface/INTERFACE.json cannot be read as JSON')]);
    put(root, { 'interface/INTERFACE.json': '{"format": 1}' });
    r = check(root);
    expect([r.status, r.out]).toEqual([1, expect.stringContaining('has no "exports" list')]);
    r = check(repo([exp('a', ['../hpcworker-notes/x.ts']), exp('b', ['/etc/']), exp('c', []), { id: 'd', paths: 'src/' }]));
    expect(r.status).toBe(1);
    expect(r.out).toContain('export a: "../hpcworker-notes/x.ts" is not a path inside this repository');
    expect(r.out).toContain('export b: "/etc/" is not a path inside this repository');
    expect(r.out).toContain('export c: "paths" is not a list of paths');
    expect(r.out).toContain('export d: "paths" is not a list of paths');
  });
});
