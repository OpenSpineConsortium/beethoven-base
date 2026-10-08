// tools/posture.mjs on modules written into a throwaway folder: each forbidden form is found with
// its file and line, and a clean module of every allowed form passes.
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASE, makeTmp, node, removeTmp, testEnv } from './fixtures.mjs';

let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = makeTmp();
  env = testEnv(tmp);
});
afterEach(() => removeTmp(tmp));

const posture = (dir: string) => node(env, dir, join(BASE, 'tools', 'posture.mjs'), dir);
function scan(files: Record<string, string>) {
  const dir = join(tmp, 'src');
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return posture(dir);
}

const CLEAN = `// a module of every allowed form; a comment may name fetch( and ANTHROPIC_API_KEY
import { OTHER } from './other.js';
import type { Shape } from './other.js';
export * from './other.js';
export type Kind = 'a' | 'b';
export interface Fields { process: number; window: string; console: boolean }
export const NAME = 'beethoven';
export const COUNT = -3;
export const LINK = /^https:\\/\\/claude\\.ai\\/code\\/session_[A-Za-z0-9_-]+$/;
export const LIST = ['a', 'b', OTHER] as const;
export const TABLE = { done: 0, other: 1, 'signin-node': 6, nested: { ok: true } } satisfies Record<string, unknown>;
export const RE = /*#__PURE__*/ new RegExp('^(?:a|b)$', 'i');
export const FROZEN = /*#__PURE__*/ Object.freeze(['x', 'y']);
export const pick = (s: Shape): number => s.n;
export function parse(line: string, fields: Fields): string | undefined {
  const url = 'https://example.org//not-a-comment';
  return line.startsWith(url) && fields.process > 0 ? line : undefined;
}
export class Failure extends Error {
  static readonly CODE = 'other';
  constructor(readonly code: string) {
    super(code);
  }
}
`;
const OTHER = `export const OTHER = 'o';\nexport interface Shape { n: number }\n`;

describe('posture', () => {
  it('passes a clean module of every allowed form', () => {
    const r = scan({ 'clean.ts': CLEAN, 'other.ts': OTHER });
    expect(r.out).toContain('posture: 2 file(s) clean');
    expect(r.status).toBe(0);
  });

  it("passes this repository's own src/", () => {
    const r = posture(join(BASE, 'src'));
    expect(r.status).toBe(0);
  });

  const FORBIDDEN: Array<[string, string, string, number]> = [
    ['a node: module', "import { readFileSync } from 'node:fs';\nexport const R = readFileSync;\n", 'imports node:fs', 1],
    ['a package', "import x from 'lodash';\nexport const X = x;\n", 'imports lodash', 1],
    ['a file outside the folder', "export { A } from '../outside.js';\n", 'imports ../outside.js', 1],
    ['a module without its .js', "import { OTHER } from './other';\nexport const A = OTHER;\n", 'imports ./other (', 1],
    ['a module by its .ts', "import { OTHER } from './other.ts';\nexport const A = OTHER;\n", 'imports ./other.ts (', 1],
    ['a triple-slash reference path', '/// <reference path="./other.ts" />\nexport const A = 1;\n', 'a triple-slash directive', 1],
    ['a triple-slash reference to types', '/// <reference types="node" />\nexport const A = 1;\n', 'a triple-slash directive', 1],
    // a directive counts only above the first statement, after any other comments
    ['a triple-slash reference to a library', '// a module\n/// <reference lib="dom" />\nexport const A = 1;\n', 'a triple-slash directive', 2],
    ['a triple-slash no-default-lib', '/// <reference no-default-lib="true"/>\nexport const A = 1;\n', 'a triple-slash directive', 1],
    ['require', "export function load(): unknown {\n  return require('x');\n}\n", 'a Node platform call', 2],
    ['import x = require', "import fs = require('fs');\nexport const F = fs;\n", 'an `import x =`', 1],
    ['a dynamic import()', "export function load(): unknown {\n  return import('./other.js');\n}\n", 'a dynamic import()', 2],
    ['import.meta', 'export function where(): string {\n  return import.meta.url;\n}\n', 'import.meta', 2],
    ['fetch', 'export function get(u: string): unknown {\n  return fetch(u);\n}\n', 'a network or browser call', 2],
    ['XMLHttpRequest', 'export function get(): unknown {\n  return new XMLHttpRequest();\n}\n', 'a network or browser call', 2],
    ['WebSocket', "export function open(): unknown {\n  return new WebSocket('wss://x');\n}\n", 'a network or browser call', 2],
    ['eval', "export function run(): unknown {\n  return eval('1');\n}\n", 'code from text (eval)', 2],
    ['new Function', "export function run(): unknown {\n  return new Function('return 1');\n}\n", 'code from text (new Function)', 2],
    ['crypto', 'export function h(): unknown {\n  return crypto.randomUUID();\n}\n', 'cryptography or hashing', 2],
    ['subtle', "export function h(c: { subtle: unknown }): unknown {\n  return c['subtle'];\n}\n", 'cryptography or hashing', 2],
    ['process', 'export function env(): unknown {\n  return process.env;\n}\n', 'a Node platform call', 2],
    ['fs', 'export function f(fs: unknown): unknown {\n  return fs;\n}\n', 'a Node platform call', 2],
    ['child_process', 'export function f(child_process: unknown): unknown {\n  return child_process;\n}\n', 'a Node platform call', 2],
    ['globalThis', "export function g(): unknown {\n  return (globalThis as Record<string, unknown>)['fetch'];\n}\n", 'a platform global', 2],
    ['a timer', 'export function later(f: () => void): void {\n  setTimeout(f, 1);\n}\n', 'a timer', 2],
    ['console', "export function say(): void {\n  console.log('x');\n}\n", 'output (base does no I/O)', 2],
    ['a top-level call', "export const LIST = ['a', 'b'].map((s) => s + '!');\n", 'a top-level value that is not a literal or a /*#__PURE__*/ call', 1],
    ['a top-level new without the mark', "export const RE = new RegExp('a');\n", 'a top-level value that is not a literal or a /*#__PURE__*/ call', 1],
    ['a pure-marked call with a call in its arguments', "export const RE = /*#__PURE__*/ new RegExp(['a'].join('|'));\n", 'a top-level value that is not a literal or a /*#__PURE__*/ call', 1],
    ['a pure-marked call reading a property in its arguments', "const LINK = /a/;\nexport const RE = /*#__PURE__*/ new RegExp(`^(?:${LINK.source})$`);\n", 'a top-level value that is not a literal or a /*#__PURE__*/ call', 2],
    ['a top-level template with a substitution', "const NAME = 'b';\nexport const T = `${NAME}-x`;\n", 'a top-level value that is not a literal or a /*#__PURE__*/ call', 2],
    ['a top-level property read', "export const N = 'abc'.length;\n", 'a top-level value that is not a literal or a /*#__PURE__*/ call', 1],
    ['a top-level spread', "const A = ['a'];\nexport const B = [...A];\n", 'a top-level value that is not a literal or a /*#__PURE__*/ call', 2],
    ['a top-level let', 'export let count = 0;\n', 'a top-level let, var or using (base keeps no state)', 1],
    ['a statement at load', "const A = 1;\nif (A) throw new Error('x');\n", 'a statement that runs when the module is imported', 2],
    ['an enum', 'export enum E {\n  A,\n}\n', 'an enum', 1],
    ['a namespace', 'export namespace N {\n  export const A = 1;\n}\n', 'a namespace', 1],
    ['an ambient declaration', 'declare const chrome: unknown;\nexport const C = 1;\n', 'an ambient declaration', 1],
    ['a class with a static block', 'export class C {\n  static {\n    void 0;\n  }\n}\n', 'a class whose definition runs code', 1],
    ['an API key name', "export const KEY = 'ANTHROPIC_API_KEY';\n", 'an API key, a gateway or a cloud provider', 1],
    ['apiKeyHelper', "export const HELPER = { apiKeyHelper: 'x' };\n", 'an API key, a gateway or a cloud provider', 1],
    ['ANTHROPIC_BASE_URL', "export const URL_NAME = 'ANTHROPIC_BASE_URL';\n", 'an API key, a gateway or a cloud provider', 1],
    ['a Bedrock switch', "export const S = 'CLAUDE_CODE_USE_BEDROCK';\n", 'an API key, a gateway or a cloud provider', 1],
    ['a Vertex switch', "export const S = 'CLAUDE_CODE_USE_VERTEX';\n", 'an API key, a gateway or a cloud provider', 1],
    ['a Foundry switch', "export const S = 'CLAUDE_CODE_USE_FOUNDRY';\n", 'an API key, a gateway or a cloud provider', 1],
    ['the Console', "export const C = 'https://platform.claude.com/';\n", 'an API key, a gateway or a cloud provider', 1],
    ['a Claude credential', "export const T = 'CLAUDE_CODE_OAUTH_TOKEN';\n", 'a Claude credential or sign-out', 1],
  ];
  for (const [name, text, what, line] of FORBIDDEN) {
    it(`finds ${name}, with its file and line`, () => {
      const r = scan({ 'bad.ts': text });
      expect(r.status).toBe(1);
      expect(r.out).toContain(`bad.ts:${line}: ${what}`);
    });
  }

  it('lets strip.ts take a name away on a line of one quoted name, and refuses the same names anywhere else', () => {
    const strip = "export const STRIP = [\n  'ANTHROPIC_API_KEY',\n  'CLAUDE_CODE_USE_BEDROCK',\n  'CLAUDE_CODE_OAUTH_TOKEN',\n] as const;\n";
    expect(scan({ 'strip.ts': strip }).status).toBe(0);
    const elsewhere = scan({ 'strip.ts': strip, 'other.ts': strip });
    expect(elsewhere.status).toBe(1);
    expect(elsewhere.out).toContain('other.ts:2: an API key');
    expect(elsewhere.out).toContain('other.ts:4: a Claude credential');
    expect(elsewhere.out).not.toContain('strip.ts:');
    const smuggled = scan({ 'strip.ts': "export const K = 'ANTHROPIC_API_KEY';\n" });
    expect(smuggled.status).toBe(1);
    expect(smuggled.out).toContain('strip.ts:1: an API key');
  });

  it("lets redact.ts hold a redaction rule for a key's shape, and nothing else with the name", () => {
    const redact = "const RULES: Array<[RegExp, string]> = [\n  [/sk-ant-[A-Za-z0-9_-]+/g, '[redacted]'],\n];\nexport function redact(s: string): string {\n  let t = s;\n  for (const [re, rep] of RULES) t = t.replace(re, rep);\n  return t;\n}\n";
    expect(scan({ 'redact.ts': redact }).status).toBe(0);
    const r = scan({ 'redact.ts': `${redact}export const K = 'sk-ant-';\n` });
    expect(r.status).toBe(1);
    expect(r.out).toContain('redact.ts:9: an API key');
  });

  it('refuses a folder, a .d.ts file, a name that is not a module and a link in src/', () => {
    const dir = join(tmp, 'src');
    mkdirSync(join(dir, 'inner'), { recursive: true });
    writeFileSync(join(dir, 'globals.d.ts'), 'declare const x: number;\n');
    writeFileSync(join(dir, 'Upper.ts'), 'export const A = 1;\n');
    writeFileSync(join(dir, 'ok.ts'), 'export const A = 1;\n');
    if (process.platform !== 'win32') symlinkSync('ok.ts', join(dir, 'link.ts'));
    const r = posture(dir);
    expect(r.status).toBe(1);
    expect(r.out).toContain("inner:1: a folder (base's modules sit flat in src/)");
    expect(r.out).toContain('globals.d.ts:1: not a module of base');
    expect(r.out).toContain('Upper.ts:1: not a module of base');
    if (process.platform !== 'win32') expect(r.out).toContain('link.ts:1: a link');
  });

  it('fails a folder with no module at all', () => {
    const dir = join(tmp, 'src');
    mkdirSync(dir);
    const r = posture(dir);
    expect(r.status).toBe(1);
    expect(r.out).toContain('no module under');
  });
});
