// What base offers, checked by the gate before every push (`npm run posture` runs it after the posture
// scan):
//
//   node tools/exports.mjs [ROOT]        (default: this checkout)
//
// interface/INTERFACE.json is the one place that says what each edition takes (the interface standard,
// rule 2). An edition compiles what it takes inside its own source tree, so an export that leaves out a
// module one of its modules imports would hand the edition a copy that does not compile. For every
// export it fails, naming the export and the file, when:
// - a path of the export matches no tracked file of the repository (git's list where git is at hand,
//   else the tree without .git and node_modules);
// - a path of an edition's export (desktop, browser, vscode) is not under src/: the edition's puller
//   places each file below the folder all of the export's paths share, so one path elsewhere would
//   put every module at src/base/src/<name>.ts instead of src/base/<name>.ts;
// - a file under src/ that the export's paths cover imports "./<name>.js" and src/<name>.ts is not a
//   tracked file, or is one the same export's paths do not cover;
// - such a file imports anything but "./<name>.js", or names another file in a triple-slash
//   reference (the posture scan refuses both too; this check names the export they would break).
// It checks what each export carries, not that it compiles alone: the lanes compile all of src/
// together. Paths follow the standard: one ending in "/" covers every file under it, and "*" matches
// within one part of a path. It reads and prints; it writes nothing.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = rootOf(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const MANIFEST = 'interface/INTERFACE.json';
// the exports an edition takes into its own source folder (interface/README.md)
const EDITIONS = new Set(['desktop', 'browser', 'vscode']);

/** @param {string} dir @returns {string} */
function rootOf(dir) {
  try {
    return realpathSync(resolve(dir));
  } catch {
    return fail(`no folder ${dir}`);
  }
}

/** @param {string} why @returns {never} */
function fail(why) {
  console.error(`exports: ${why}`);
  process.exit(1);
}

/** @type {unknown} */
let data;
try {
  data = JSON.parse(readFileSync(join(root, ...MANIFEST.split('/')), 'utf8'));
} catch (e) {
  fail(`${MANIFEST} cannot be read as JSON: ${e instanceof Error ? e.message : String(e)}`);
}
const exportsList = /** @type {{ exports?: unknown }} */ (data ?? {}).exports;
if (!Array.isArray(exportsList)) fail(`${MANIFEST} has no "exports" list`);

/** @type {Array<{ id: string, paths: string[] }>} */
const exportsOk = [];
/** @type {string[]} */
const findings = [];
for (const [i, e] of /** @type {unknown[]} */ (exportsList).entries()) {
  const x = /** @type {{ id?: unknown, paths?: unknown }} */ (e ?? {});
  const id = typeof x.id === 'string' && x.id !== '' ? x.id : `#${i + 1}`;
  if (!Array.isArray(x.paths) || x.paths.length === 0 || !x.paths.every((p) => typeof p === 'string' && p !== '')) {
    findings.push(`export ${id}: "paths" is not a list of paths`);
    continue;
  }
  const bad = x.paths.find((p) => p.startsWith('/') || p.includes('\\') || p.split('/').includes('..'));
  if (bad !== undefined) {
    findings.push(`export ${id}: ${JSON.stringify(bad)} is not a path inside this repository`);
    continue;
  }
  const outside = EDITIONS.has(id) ? x.paths.find((p) => !p.startsWith('src/')) : undefined;
  if (outside !== undefined) {
    findings.push(`export ${id}: ${JSON.stringify(outside)} is not under src/; an edition's copy lands below the folder its paths share`);
    continue;
  }
  exportsOk.push({ id, paths: x.paths });
}

const files = tracked();
const known = new Set(files);
for (const { id, paths } of exportsOk) {
  for (const p of paths) if (!files.some((f) => covered(f, [p]))) findings.push(`export ${id}: the path ${p} matches no tracked file`);
  for (const f of files.filter((f) => f.startsWith('src/') && f.endsWith('.ts') && covered(f, paths))) {
    for (const { spec, line, reference } of importsOf(f)) {
      if (reference) {
        findings.push(`export ${id}: ${f}:${line} names ${spec} in a triple-slash reference, which no edition's copy may lean on (a module imports only "./<name>.js")`);
        continue;
      }
      const name = /^\.\/([a-z][a-z0-9-]*)\.js$/.exec(spec);
      if (!name) {
        findings.push(`export ${id}: ${f}:${line} imports ${spec}, which is no module of base (a module imports only "./<name>.js")`);
        continue;
      }
      const target = `src/${name[1]}.ts`;
      if (!known.has(target)) findings.push(`export ${id}: ${f}:${line} imports ${spec}, and ${target} is not a tracked file`);
      else if (!covered(target, paths)) findings.push(`export ${id}: ${f}:${line} imports ${spec}, and the export's paths do not cover ${target}`);
    }
  }
}

if (findings.length > 0) {
  for (const f of findings) console.error(`exports: ${f}`);
  console.error(`exports: ${findings.length} finding(s); an edition that takes an export needs every module its modules import (interface/README.md)`);
  process.exit(1);
}
console.log(`exports: ${exportsOk.length} export(s) in ${MANIFEST}; every path names a tracked file and every export carries the modules its modules import`);

/** @param {string} rel @param {string[]} paths whether one of the standard's paths covers rel */
function covered(rel, paths) {
  return paths.some((p) => {
    if (p.endsWith('/')) return rel.startsWith(p);
    const re = new RegExp(`^${p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);
    return re.test(rel);
  });
}

/**
 * The repository's files, forward slashes. A hook's GIT_DIR (a linked worktree's) would aim git
 * elsewhere than this checkout, so git runs without the variables that name a repository.
 * @returns {string[]}
 */
function tracked() {
  const env = { ...process.env };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY']) delete env[k];
  const top = spawnSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { env, encoding: 'utf8' });
  // a folder inside another checkout (a scratch copy under a repository) is not that checkout's root
  if (top.status === 0 && realpathSync(top.stdout.trim()) === root) {
    const r = spawnSync('git', ['-C', root, 'ls-files', '-z'], { env, encoding: 'utf8' });
    if (r.status === 0) return r.stdout.split('\0').filter(Boolean);
  }
  /** @type {string[]} */
  const found = [];
  /** @param {string} d */
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      if (n === '.git' || n === 'node_modules') continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else found.push(relative(root, p).split(sep).join('/'));
    }
  };
  walk(root);
  return found.sort();
}

/**
 * Every module specifier a file names: import and export ... from, a bare import, import type and an
 * import("...") type, read from the parsed source so a string or a comment is never taken for one;
 * and every file or library a triple-slash directive names, which the compiler reads like an import.
 * @param {string} rel
 * @returns {Array<{ spec: string, line: number, reference: boolean }>}
 */
function importsOf(rel) {
  const text = readFileSync(join(root, ...rel.split('/')), 'utf8');
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  /** @type {Array<{ spec: string, line: number, reference: boolean }>} */
  const out = [];
  /** @param {ts.Node} node @param {string} spec */
  const add = (node, spec) => out.push({ spec, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, reference: false });
  for (const r of [...sf.referencedFiles, ...sf.typeReferenceDirectives, ...sf.libReferenceDirectives]) {
    out.push({ spec: r.fileName, line: sf.getLineAndCharacterOfPosition(r.pos).line + 1, reference: true });
  }
  /** @param {ts.Node} node */
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      add(node, node.moduleSpecifier.text);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      add(node, node.argument.literal.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const a = node.arguments[0];
      add(node, a && ts.isStringLiteral(a) ? a.text : '(not a string)');
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
      add(node, node.moduleReference.expression.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}
