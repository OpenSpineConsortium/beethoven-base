// The interface standard's rules 1 to 3 for this repository (interface/README.md): nothing here reads,
// runs or copies a file of another Beethoven repository's checkout; what it offers and takes is declared
// in interface/INTERFACE.json; and what it takes is a pinned copy that matches its ORIGIN. A line that
// reaches a sibling checkout fails unless it is on the known list below with its reason, and an entry
// that no longer matches fails too, so the list only shrinks. A tracked link is judged by where it
// points, never by what it reaches: one that leaves the repository or points nowhere fails. The
// patterns are hpcworker's framework/tests/test_boundary.py's, ported through beethoven-desktop's
// test/boundary.test.ts, with the forms those two miss added (a path given as separate arguments, an
// action or reusable workflow of another repository, a package fetched from GitHub, a fetched script
// piped into a shell, a link); no network and no secret. Rule 3 runs on every import, and with
// interface/pull.sh is also proven on throwaway imports of the tests' own, the puller against a
// stand-in for gh, so each refusal is shown without the network.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTmp, removeTmp } from './fixtures.mjs';
import { importProblems, INTO, manifest, ROOT, undeclaredOrigins, type Import, type Manifest } from './origin.js';

const SELF = 'beethoven-base';
const THIS = 'test/boundary.test.ts';
const STANDARD = 'https://github.com/OpenSpineConsortium/beethoven/blob/main/INTERFACES.md';
// every other repository of the ecosystem (the hub is beethoven), the names their checkouts had (the
// Desktop folders ashley and ashley-bridge), and the website's
const OTHERS = [
  'beethoven', 'beethoven-extension', 'beethoven-desktop', 'beethoven-vscode', 'hpcworker', 'beethoven-qa', 'beethoven-agents',
  'beethoven-research', 'beethoven-sites', 'beethoven-access', 'ashley', 'ashley-bridge', 'openspineconsortium.github.io',
  'spinesurg-ct-nnunet', 'u251-xenograft-rat-rnaseq-study',
];
const NAMES = [...OTHERS].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
// a path made from this checkout's parent: "../<repo>", or "$(dirname ...)/<repo>", "${PARENT}/<repo>" and the like
const SIBLING_PATH = new RegExp(`(?:\\.\\./|\\)/|\\}/)(${NAMES})(?![A-Za-z0-9_.-])`, 'g');
// the same reach built from separate arguments: resolve(BASE, '..', 'hpcworker'), os.path.join(ROOT, "..", "beethoven-qa")
const SIBLING_ARGS = new RegExp(`['"]\\.\\.['"]\\s*,\\s*['"](${NAMES})['"]`, 'g');
// a variable whose value is another repository's checkout
const CHECKOUT_VAR = /\b((?:HPCWORKER|ASHLEY|SITES|QA|BEETHOVEN_(?:SERVICE|QA|AGENTS|RESEARCH|SITES|EXTENSION|DESKTOP|VSCODE|BASE|HUB))_DIR)\b/g;
// a clone of another repository of the organisation
const CLONE = new RegExp(`\\b(?:git clone|gh repo clone)\\b[^\\n]*?OpenSpineConsortium/(${NAMES})\\b`, 'gi');
// another repository's code imported: hpcworker's test modules, the engine's packages
const FOREIGN_MODULE = /\b(?:import|from)\s+(fakegrid|schemacheck|beethoven_(?:qa|agents|research))\b/g;
// another repository's action or reusable workflow, which GitHub fetches from that repository and runs
const FOREIGN_USES = new RegExp(`^\\s*(?:-\\s*)?uses:\\s*['"]?OpenSpineConsortium/(${NAMES})(?![A-Za-z0-9_.-])`, 'gi');
// another repository fetched from GitHub as a package, to install or run: npx github:OpenSpineConsortium/<repo>
const GITHUB_PACKAGE = new RegExp(`\\bgithub:OpenSpineConsortium/(${NAMES})(?![A-Za-z0-9_.-])`, 'gi');
// a fetched script piped into a shell, from any repository or host (no remote code); the fetcher is the key
const FETCH_TO_SHELL = /\b(curl|wget|gh api)\b[^\n|]*(?:\|[^\n|]*)*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/g;
const PATTERNS = [SIBLING_PATH, SIBLING_ARGS, CHECKOUT_VAR, CLONE, FOREIGN_MODULE, FOREIGN_USES, GITHUB_PACKAGE, FETCH_TO_SHELL];
const CHECKOUT_ACTION_REPO = /^\s*repository:\s*\S+/m;
// a dependency that is not a version from the registry: a path, a link, a git URL or a host's shorthand
const NOT_FROM_REGISTRY = /^(?:file:|link:|portal:|git[+:]|github:|gitlab:|bitbucket:|https?:|\.{0,2}\/|~\/)|^[^@\s/:]+\/[^\s/]+$/;
// the variables git hands a hook that name a repository; a pre-push hook's GIT_DIR would aim git elsewhere
const GIT_REPO_VARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY'];

// [file, what matched, why it is still here and who removes it]
const KNOWN: [string, string, string][] = [];

function gitHere(...args: string[]) {
  const env = { ...process.env };
  for (const k of GIT_REPO_VARS) delete env[k];
  return spawnSync('git', ['-C', ROOT, ...args], { env, encoding: 'utf8' });
}

/**
 * The repository's files: git's list where git is at hand, else the tree without .git and
 * node_modules; and each link among them with the path it holds (git's own record of it, mode 120000,
 * or the link in the tree), so a link is never followed to what it reaches.
 */
function tracked(): { files: string[]; links: Map<string, string> } {
  const links = new Map<string, string>();
  const r = gitHere('ls-files', '-s', '-z');
  const entries = r.status === 0 ? r.stdout.split('\0').filter(Boolean) : [];
  if (entries.length) {
    const files: string[] = [];
    for (const e of entries) {
      // "<mode> <object> <stage>\t<path>"
      const tab = e.indexOf('\t');
      const [mode, object] = e.slice(0, tab).split(' ');
      const rel = e.slice(tab + 1);
      files.push(rel);
      if (mode === '120000') links.set(rel, gitHere('cat-file', 'blob', object!).stdout);
    }
    return { files, links };
  }
  const found: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      if (['.git', 'node_modules'].includes(n)) continue;
      const p = join(d, n);
      const rel = relative(ROOT, p).split(sep).join('/');
      const st = lstatSync(p);
      if (st.isSymbolicLink()) {
        links.set(rel, readlinkSync(p));
        found.push(rel);
      } else if (st.isDirectory()) walk(p);
      else found.push(rel);
    }
  };
  walk(ROOT);
  return { files: found, links };
}

/** a file's text, or a link's path: the patterns judge a link by where it points */
function text(rel: string, links: Map<string, string>): string {
  const target = links.get(rel);
  if (target !== undefined) return target;
  try {
    const p = join(ROOT, rel);
    if (lstatSync(p).isSymbolicLink()) return readlinkSync(p);
    const b = readFileSync(p);
    return b.includes(0) ? '' : b.toString('utf8');
  } catch {
    return '';
  }
}

/** each link that leads out of the repository at root, or to nothing, in words */
function linkProblems(links: Map<string, string>, root: string): string[] {
  const out: string[] = [];
  for (const [rel, target] of links) {
    const to = resolve(root, dirname(rel), target);
    const inside = relative(root, to);
    if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) out.push(`${rel} is a link out of the repository (to ${target})`);
    else if (!existsSync(to)) out.push(`${rel} is a link to nothing (to ${target})`);
  }
  return out;
}

/** (file, what matched) -> the first line where it did, for every reach of a sibling checkout in these files */
function reaches(files: Map<string, string>): Map<string, string> {
  const found = new Map<string, string>();
  for (const [rel, body] of files) {
    if (rel.endsWith('.md') || rel === THIS) continue; // prose may name another repository; this file names them to look for them
    body.split('\n').forEach((line, i) => {
      for (const rx of PATTERNS) {
        for (const m of line.matchAll(rx)) {
          const k = `${rel} | ${m[1]}`;
          if (!found.has(k)) found.set(k, `${rel}:${i + 1}: ${line.trim().slice(0, 160)}`);
        }
      }
    });
  }
  // the gate before every push runs the tests in the pusher's environment: while a test reads
  // HPCWORKER_DIR, a hook that does not drop it hands the push's verdict to a sibling checkout
  const hook = files.get('.githooks/pre-push');
  const reader = [...files].find(([rel, body]) => rel.startsWith('test/') && rel !== THIS && /process\.env\.HPCWORKER_DIR\b/.test(body));
  if (hook && reader && /\bnpm (?:run gate|test)\b/.test(hook) && !/(?:unset|env -u)\s+HPCWORKER_DIR\b/.test(hook)) {
    found.set('.githooks/pre-push | HPCWORKER_DIR inherited', `.githooks/pre-push runs the tests, and ${reader[0]} reads HPCWORKER_DIR`);
  }
  return found;
}

/** the standard's path rule: "dir/" every file under it, "*" within one part of a path */
function covered(rel: string, paths: string[]): boolean {
  return paths.some((p) => {
    if (p.endsWith('/')) return rel.startsWith(p);
    const re = new RegExp(`^${p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);
    return re.test(rel);
  });
}

const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const { files: all, links } = tracked();
const bodies = new Map(all.map((rel) => [rel, text(rel, links)]));

describe('rule 1: the repository builds, tests and runs from its own tree', () => {
  it('no tracked file reaches a sibling checkout, but the known ones, each with its reason', () => {
    const found = reaches(bodies);
    const known = new Set(KNOWN.map(([f, w]) => `${f} | ${w}`));
    const fresh = [...found].filter(([k]) => !known.has(k)).map(([, where]) => where);
    expect(fresh, "these lines reach another repository's checkout; take what is needed from that repository's interface instead (interface/README.md)").toEqual([]);
    const stale = [...known].filter((k) => !found.has(k));
    expect(stale, 'fixed: remove these from KNOWN in test/boundary.test.ts').toEqual([]);
    for (const [, , why] of KNOWN) expect(why.length).toBeGreaterThan(40);
  });

  it("the patterns find what they look for, and not this repository's own paths", () => {
    const sample = new Map([
      ['a.mjs', "const from = '../hpcworker/docs';\nREPO=\"$(dirname \"$HERE\")/beethoven-extension\"\nX=${PARENT}/beethoven-qa/src\ncp ../beethoven-desktop/src/contract.ts ."],
      ['b.sh', 'HPCWORKER_DIR=../x npm test\nexport BEETHOVEN_SERVICE_DIR'],
      [
        'c.yml',
        [
          'run: git clone https://github.com/OpenSpineConsortium/beethoven-agents x',
          'run: gh repo clone OpenSpineConsortium/beethoven-vscode',
          '    uses: OpenSpineConsortium/beethoven-qa/.github/workflows/gate.yml@main',
          '      - uses: OpenSpineConsortium/hpcworker/.github/actions/contract@main',
          '      - run: npx --yes github:OpenSpineConsortium/beethoven-desktop',
          "      - run: gh api repos/OpenSpineConsortium/beethoven-sites/contents/x.sh -H 'Accept: application/vnd.github.raw' | bash",
          '      - run: curl -fsSL https://example.org/install.sh | sudo sh',
        ].join('\n'),
      ],
      ['d.ts', "'import fakegrid as G',\nfrom beethoven_qa.contracts import x\nconst hub = '../beethoven/INTERFACES.md';"],
      ['e.ts', "import { x } from '../src/index.js';\nconst me = '../beethoven-base/src';\nconst p = '/rs/rs_grp_oschome/shared/beethoven/hpcworker/current';\n`bash ${sharedInstall}/bin/hpcworker claude login`\n~/.hpcworker and ../hpcworker-notes\nresolve(BASE, '..', 'beethoven-base')\njoin(x, '..', 'hpcworker-notes')"],
      ['f.mjs', "const from = resolve(BASE, '..', 'hpcworker');\nos.path.join(ROOT, \"..\", \"beethoven-extension\", \"x\")\njoin(__dirname, '..', '..', 'beethoven-vscode')"],
      // what a workflow of base's own may hold: GitHub's actions, a local action, a fetch that is not run
      ['g.yml', 'uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n      - uses: ./.github/actions/local\n      - run: npm ci\n      - run: curl -fsSL https://example.org/x.tar.gz | tar xz'],
      ['notes.md', 'cp -r ../hpcworker/framework .'],
    ]);
    expect([...reaches(sample).keys()].sort()).toEqual([
      'a.mjs | beethoven-desktop', 'a.mjs | beethoven-extension', 'a.mjs | beethoven-qa', 'a.mjs | hpcworker', 'b.sh | BEETHOVEN_SERVICE_DIR',
      'b.sh | HPCWORKER_DIR', 'c.yml | beethoven-agents', 'c.yml | beethoven-desktop', 'c.yml | beethoven-qa', 'c.yml | beethoven-vscode',
      'c.yml | curl', 'c.yml | gh api', 'c.yml | hpcworker', 'd.ts | beethoven', 'd.ts | beethoven_qa', 'd.ts | fakegrid',
      'f.mjs | beethoven-extension', 'f.mjs | beethoven-vscode', 'f.mjs | hpcworker',
    ]);
  });

  it('no tracked link leads out of the repository or to nothing', () => {
    expect(linkProblems(links, ROOT)).toEqual([]);
  });

  it('the link check refuses a link into a sibling checkout and a link to nothing, and its path is scanned', () => {
    // a link read through would scan the sibling's file and never see where it points; a dangling one
    // (the sibling absent, as in CI) would read as nothing at all. The links are judged by the paths they
    // hold, as git records them, so none needs to exist here.
    const T = makeTmp();
    try {
      const repo = join(T, 'beethoven-base');
      mkdirSync(join(T, 'hpcworker', 'interface', 'contract'), { recursive: true });
      writeFileSync(join(T, 'hpcworker', 'interface', 'contract', 'lines.json'), '{"lines": []}\n');
      mkdirSync(join(repo, 'tools'), { recursive: true });
      mkdirSync(join(repo, 'src'));
      writeFileSync(join(repo, 'src', 'a.ts'), 'export const A = 1;\n');
      const made = new Map([
        ['tools/contract.json', '../../hpcworker/interface/contract/lines.json'],
        ['tools/gone.json', 'nothing.json'],
        ['tools/inside.ts', '../src/a.ts'],
      ]);
      expect(linkProblems(made, repo)).toEqual([
        'tools/contract.json is a link out of the repository (to ../../hpcworker/interface/contract/lines.json)',
        'tools/gone.json is a link to nothing (to nothing.json)',
      ]);
      expect([...reaches(made).keys()]).toEqual(['tools/contract.json | hpcworker']);
    } finally {
      removeTmp(T);
    }
  });

  it('no submodule, and no workflow checks out another repository (nor runs its action or workflow: the patterns above)', () => {
    expect(existsSync(join(ROOT, '.gitmodules'))).toBe(false);
    expect(all).not.toContain('.gitmodules');
    const workflows = all.filter((f) => f.startsWith('.github/workflows/'));
    expect(workflows.length).toBeGreaterThan(0);
    for (const rel of workflows) {
      expect(CHECKOUT_ACTION_REPO.test(bodies.get(rel) ?? ''), `${rel} checks out another repository`).toBe(false);
    }
  });

  it('every dependency is a version from the registry, never a path, a link or a git URL', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<string, unknown>;
    expect(pkg.workspaces).toBeUndefined();
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'bundleDependencies', 'overrides']) {
      for (const [name, spec] of Object.entries((pkg[field] ?? {}) as Record<string, unknown>)) {
        expect(typeof spec === 'string' && !NOT_FROM_REGISTRY.test(spec), `${field} ${name}: ${String(spec)}`).toBe(true);
      }
    }
    const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as { packages: Record<string, { resolved?: string; link?: boolean }> };
    for (const [where, p] of Object.entries(lock.packages)) {
      expect(p.link, `${where} is a link`).not.toBe(true);
      if (p.resolved !== undefined) expect(p.resolved, where).toMatch(/^https:\/\/registry\.npmjs\.org\//);
    }
    for (const bad of ['file:../hpcworker', 'link:../beethoven-desktop', 'github:OpenSpineConsortium/beethoven-qa', 'OpenSpineConsortium/beethoven-qa', 'git+https://github.com/OpenSpineConsortium/x.git', '../x', '~/beethoven-desktop']) {
      expect(NOT_FROM_REGISTRY.test(bad), bad).toBe(true);
    }
    for (const good of ['5.9.3', '^1.2.0', '~1.0.0', 'npm:typescript@7.0.2', '>=18', 'latest']) expect(NOT_FROM_REGISTRY.test(good), good).toBe(false);
  });
});

describe('rule 2: what this repository offers and takes, declared in one place', () => {
  it("interface/INTERFACE.json has the standard's shape", () => {
    const m = manifest();
    expect(Object.keys(m).sort()).toEqual(['exports', 'format', 'imports', 'name', 'repository', 'standard', 'summary']);
    expect([m.format, m.name, m.repository, m.standard]).toEqual([1, SELF, `OpenSpineConsortium/${SELF}`, STANDARD]);
    expect(typeof m.summary === 'string' && m.summary.length > 0).toBe(true);
    expect(Array.isArray(m.exports) && Array.isArray(m.imports)).toBe(true);
    const ids = m.exports.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of m.exports) {
      expect(Object.keys(e).sort()).toEqual(['consumers', 'id', 'kind', 'paths', 'summary', 'version']);
      expect(e.id).toMatch(/^[a-z0-9-]+$/);
      expect(['contract', 'schema', 'data', 'python', 'cli', 'files', 'program', 'text']).toContain(e.kind);
      expect(Number.isInteger(e.version) && e.version >= 1).toBe(true);
      expect(e.paths.length).toBeGreaterThan(0);
      for (const p of e.paths) expect(p === '' || p.startsWith('/') || p.includes('\\') || p.split('/').includes('..'), p).toBe(false);
      // an edition's copy lands below the folder its paths share; one path outside src/ would move every module
      if (['desktop', 'browser', 'vscode'].includes(e.id)) for (const p of e.paths) expect(p, `${e.id}: ${p}`).toMatch(/^src\//);
      for (const c of e.consumers) expect(c).toMatch(/^OpenSpineConsortium\/[a-z0-9.-]+$/);
    }
    const intos = m.imports.map((i) => i.into);
    expect(new Set(intos).size).toBe(intos.length);
    for (const i of m.imports) {
      expect(Object.keys(i).sort()).toEqual(['export', 'into', 'origin', 'repository', 'version']);
      expect(i.repository).toMatch(/^OpenSpineConsortium\/[a-z0-9.-]+$/);
      expect(i.repository).not.toBe(`OpenSpineConsortium/${SELF}`);
      expect(Number.isInteger(i.version) && i.version >= 1).toBe(true);
      expect(i.into).toMatch(INTO);
      expect(i.origin).toBe(`${i.into}/ORIGIN`);
    }
  });

  it('an import goes only into a folder of its own directly under test/, so no pull writes over the repository', () => {
    // the root, interface/ (the manifest and the puller), src/, a dot folder or a path through . or ..
    // would let a provider's file replace one of base's own; interface/pull.sh refuses the same
    for (const bad of ['.', 'test', 'test/.', 'test/..', './x', 'test/./x', 'test/a/b', 'test/.hidden', 'test/-x', 'test/Upper', 'interface', 'interface/x', 'src/x', '.github/workflows', '.githooks', 'tools/x', '']) {
      expect(INTO.test(bad), bad).toBe(false);
    }
    for (const good of ['test/hpcworker', 'test/contract-2']) expect(INTO.test(good), good).toBe(true);
  });

  it('every export path names a file of this repository', () => {
    for (const e of manifest().exports) {
      for (const p of e.paths) expect(all.some((f) => covered(f, [p])), `${e.id}: ${p} names no file`).toBe(true);
    }
    // the rule itself, so an empty list of exports proves something
    expect(covered('src/links.ts', ['src/*.ts'])).toBe(true);
    expect(covered('src/inner/links.ts', ['src/*.ts'])).toBe(false);
    expect(covered('src/linksXts', ['src/*.ts'])).toBe(false);
    expect(covered('src/inner/links.ts', ['src/'])).toBe(true);
    expect(covered('srcX/links.ts', ['src/'])).toBe(false);
    expect(covered('src/links.ts', ['src/links.ts'])).toBe(true);
    expect(covered('src/links.tsx', ['src/links.ts'])).toBe(false);
  });
});

describe('rule 3: an import is a pinned, checked copy', () => {
  const gitAtHand = gitHere('rev-parse', '--is-inside-work-tree').status === 0;

  it('each import folder holds exactly what its ORIGIN lists, byte for byte', () => {
    for (const imp of manifest().imports) expect(importProblems(imp), imp.into).toEqual([]);
  });

  it('every ORIGIN in the repository is the record of an import interface/INTERFACE.json declares', () => {
    // a copy that is not declared is never checked at all, and the dependency graph would not show it
    expect(undeclaredOrigins(all, manifest())).toEqual([]);
    const imp: Import = { repository: 'OpenSpineConsortium/hpcworker', export: 'contract', version: 1, into: 'test/hpcworker', origin: 'test/hpcworker/ORIGIN' };
    const none: Manifest = { ...manifest(), imports: [] };
    const files = ['test/hpcworker/ORIGIN', 'test/hpcworker/lines.json', 'src/ORIGIN.ts'];
    expect(undeclaredOrigins(files, none)).toEqual([
      'test/hpcworker/ORIGIN is a pinned copy interface/INTERFACE.json does not list as an import: add the import and take it with interface/pull.sh',
    ]);
    expect(undeclaredOrigins(files, { ...none, imports: [imp] })).toEqual([]);
  });

  it.skipIf(!gitAtHand)('an import is committed whole', () => {
    for (const imp of manifest().imports) {
      const inside = all.filter((f) => f.startsWith(`${imp.into}/`));
      const listed = readFileSync(join(ROOT, imp.origin), 'utf8').split('\n').filter((l) => l.startsWith('sha256 ')).map((l) => `${imp.into}/${l.split(' ').slice(2).join(' ')}`);
      for (const f of [imp.origin, ...listed]) expect(inside, `${f} is in the import but git does not track it`).toContain(f);
    }
  });

  it('the check passes a whole copy and refuses an edited file, a file ORIGIN does not list, a missing one, another export, a foreign record, a record of no file and a link', () => {
    // a check that passes everything proves nothing: each of these is named
    const imp: Import = { repository: 'OpenSpineConsortium/hpcworker', export: 'contract', version: 1, into: 'test/hpcworker', origin: 'test/hpcworker/ORIGIN' };
    const T = makeTmp();
    try {
      const dir = join(T, 'test', 'hpcworker');
      mkdirSync(join(dir, 'vectors'), { recursive: true });
      const files: Record<string, string> = { 'lines.json': '{"lines": []}\n', 'vectors/status-online.json': '{"v": 1}\n' };
      for (const [rel, body] of Object.entries(files)) writeFileSync(join(dir, rel), body);
      const head = `repository ${imp.repository}\ncommit ${'a'.repeat(40)}\nexport contract 1\n`;
      const shas = Object.entries(files).map(([rel, body]) => `sha256 ${sha(body)} ${rel}\n`).join('');
      writeFileSync(join(dir, 'ORIGIN'), head + shas);
      expect(importProblems(imp, T)).toEqual([]);
      // the folder's own README.md and pull.sh are not the export's
      writeFileSync(join(dir, 'README.md'), 'what this copy is\n');
      expect(importProblems(imp, T)).toEqual([]);

      writeFileSync(join(dir, 'lines.json'), '{"lines": ["edited"]}\n');
      writeFileSync(join(dir, 'extra.json'), '{}\n');
      rmSync(join(dir, 'vectors', 'status-online.json'));
      let p = importProblems(imp, T).join('\n');
      expect(p).toMatch(/test\/hpcworker\/lines\.json differs from test\/hpcworker\/ORIGIN/);
      expect(p).toMatch(/test\/hpcworker\/extra\.json is not in test\/hpcworker\/ORIGIN/);
      expect(p).toMatch(/test\/hpcworker\/vectors\/status-online\.json is in test\/hpcworker\/ORIGIN but not in the folder/);

      writeFileSync(join(dir, 'ORIGIN'), `repository OpenSpineConsortium/beethoven-desktop\ncommit main\nexport contract 2\nsha256 ${'0'.repeat(64)}\n`);
      p = importProblems(imp, T).join('\n');
      expect(p).toMatch(/first line is not "repository OpenSpineConsortium\/hpcworker"/);
      expect(p).toMatch(/second line is not a commit/);
      expect(p).toMatch(/records export contract 2, the import is contract 1/);
      expect(p).toMatch(/a line the standard does not know/);

      writeFileSync(join(dir, 'ORIGIN'), `repository ${imp.repository}\ncommit ${'a'.repeat(40)}\n`);
      expect(importProblems(imp, T).join('\n')).toMatch(/names no export/);
      rmSync(join(dir, 'ORIGIN'));
      expect(importProblems(imp, T)).toEqual(['test/hpcworker/ORIGIN is missing']);

      // a record trimmed to its head over an emptied folder: the puller never writes one
      rmSync(join(dir, 'lines.json'));
      rmSync(join(dir, 'extra.json'));
      rmSync(join(dir, 'README.md'));
      writeFileSync(join(dir, 'ORIGIN'), head);
      expect(importProblems(imp, T)).toEqual(['test/hpcworker/ORIGIN lists no file; take the copy again with interface/pull.sh']);

      if (process.platform !== 'win32') {
        // a link in the copy, and the copy's folder a link: each would make the copy another checkout's file
        const outside = join(T, 'hpcworker', 'interface', 'contract');
        mkdirSync(outside, { recursive: true });
        writeFileSync(join(outside, 'lines.json'), files['lines.json']!);
        writeFileSync(join(dir, 'ORIGIN'), head + `sha256 ${sha(files['lines.json']!)} lines.json\n`);
        symlinkSync(join(outside, 'lines.json'), join(dir, 'lines.json'));
        expect(importProblems(imp, T).join('\n')).toMatch(/test\/hpcworker\/lines\.json is a link; an import holds plain files only/);
        writeFileSync(join(outside, 'ORIGIN'), head + `sha256 ${sha(files['lines.json']!)} lines.json\n`);
        rmSync(join(T, 'test', 'hpcworker'), { recursive: true });
        symlinkSync(outside, join(T, 'test', 'hpcworker'));
        expect(importProblems(imp, T)).toEqual(['test/hpcworker is a link; an import is a real folder of this repository']);
      }
    } finally {
      removeTmp(T);
    }
  });

  const bash = spawnSync('bash', ['-c', 'exit 0']).status === 0 && spawnSync('node', ['-e', '0']).status === 0;
  describe.skipIf(!bash)('interface/pull.sh, with no network', () => {
    const pull = join(ROOT, 'interface', 'pull.sh');
    // the script's functions, with nothing run: it runs main only when it is not sourced
    const fn = (name: string, args: string[], input?: string) =>
      spawnSync('bash', ['-c', 'source "$1"; shift; "$@"', '_', pull, name, ...args], { encoding: 'utf8', input });
    // a gh that only says it was asked stands first on the PATH: the network is never reached from here
    const withFakeGh = (run: (env: NodeJS.ProcessEnv) => void) => {
      const T = makeTmp();
      try {
        writeFileSync(join(T, 'gh'), '#!/bin/sh\necho asked >&2\nexit 99\n', { mode: 0o755 });
        run({ ...process.env, PATH: `${T}:${process.env.PATH ?? ''}` });
      } finally {
        removeTmp(T);
      }
    };

    it('refuses a word it does not know, and a folder that is no import, before it asks anything of GitHub', () => {
      withFakeGh((env) => {
        // (test/hpcworker becomes an import at step 9, so the folder that is no import is one that never will be)
        for (const args of [['--from', '../hpcworker'], ['--into', '../beethoven-desktop'], ['--ref'], ['hpcworker'], ['test/not-an-import'], ['../x'], [], ['--ref', 'main', '--pinned', 'test/hpcworker'], ['--all', 'test/hpcworker']]) {
          const r = spawnSync('bash', [pull, ...args], { encoding: 'utf8', env });
          expect([r.status, r.stderr.includes('asked')], args.join(' ')).toEqual([2, false]);
        }
      });
    });

    it('takes every import of none without asking GitHub anything', () => {
      withFakeGh((env) => {
        const r = spawnSync('bash', [pull, '--all'], { encoding: 'utf8', env });
        if (manifest().imports.length === 0) {
          expect([r.status, r.stdout, r.stderr]).toEqual([0, 'interface/INTERFACE.json lists no import: nothing to take\n', '']);
        } else {
          // with imports, --all goes to GitHub, which the fake gh refuses
          expect(r.stderr).toMatch(/asked/);
          expect(r.status).not.toBe(0);
        }
      });
    });

    it('reads each import from the manifest, and nothing that is not one of the organisation', () => {
      const one = { repository: 'OpenSpineConsortium/hpcworker', export: 'contract', version: 1, into: 'test/hpcworker', origin: 'test/hpcworker/ORIGIN' };
      const m = JSON.stringify({ format: 1, imports: [one] });
      expect(fn('import_of', ['test/hpcworker'], m).stdout).toBe('OpenSpineConsortium/hpcworker contract 1\n');
      expect(fn('imports_all', [], m).stdout).toBe('test/hpcworker\n');
      expect(fn('import_of', ['framework'], m).status).not.toBe(0);
      for (const bad of [{ ...one, repository: 'someone/else' }, { ...one, export: '../x' }, { ...one, version: 0 }, { ...one, version: '1' }]) {
        expect(fn('import_of', ['test/hpcworker'], JSON.stringify({ imports: [bad] })).status, JSON.stringify(bad)).not.toBe(0);
      }
      expect(fn('import_of', ['test/hpcworker'], 'not json').status).not.toBe(0);
      expect(fn('imports_all', [], 'not json').status).not.toBe(0);
      // an import whose folder is not test/<name> is refused whatever the manifest says (test/origin.ts INTO)
      for (const into of ['.', 'test', 'interface', 'test/.', 'test/a/b']) {
        expect(fn('import_of', [into], JSON.stringify({ imports: [{ ...one, into, origin: `${into}/ORIGIN` }] })).status, into).not.toBe(0);
      }
      // this repository's own manifest, as the script reads it
      const real = readFileSync(join(ROOT, 'interface', 'INTERFACE.json'), 'utf8');
      expect(fn('imports_all', [], real).stdout).toBe(manifest().imports.map((i) => `${i.into}\n`).join(''));
      expect(fn('origin_commit', [], `repository a/b\ncommit ${'c'.repeat(40)}\nexport x 1\n`).stdout).toBe('c'.repeat(40));
      expect(fn('origin_commit', [], 'repository a/b\n').status).not.toBe(0);
    });

    it("places each file at its path below the folder the export's paths share, never on the folder's own files", () => {
      expect(fn('shared_base', ['interface/contract/']).stdout).toBe('interface/contract/');
      // base's own exports at step 9: modules listed one by one under src/ land flat in the edition's folder
      expect(fn('shared_base', ['src/links.ts', 'src/steps.ts']).stdout).toBe('src/');
      expect(fn('placed', ['src/', 'src/links.ts']).stdout).toBe('links.ts');
      expect(fn('shared_base', ['framework/profiles/*.json']).stdout).toBe('framework/profiles/');
      expect(fn('shared_base', ['docs/V11_CONTRACT.md', 'docs/V12_CONTRACT.md']).stdout).toBe('docs/');
      expect(fn('shared_base', ['framework/bin/', 'framework/lib/', 'framework/VERSION']).stdout).toBe('framework/');
      expect(fn('placed', ['interface/contract/', 'interface/contract/vectors/status-online.json']).stdout).toBe('vectors/status-online.json');
      for (const [b, p] of [['interface/contract/', 'interface/other.json'], ['interface/contract/', 'interface/contract/ORIGIN'], ['', '../x'], ['a/', 'a//b'], ['a/', 'a/./b']]) {
        expect(fn('placed', [b!, p!]).status, `${b} ${p}`).not.toBe(0);
      }
      expect(fn('covered', ['src/links.ts', 'src/*.ts']).status).toBe(0);
      expect(fn('covered', ['src/inner/links.ts', 'src/*.ts']).status).not.toBe(0);
      expect(fn('covered', ['tools/posture.mjs', 'src/*.ts', 'src/links.ts']).status).not.toBe(0);
      expect(fn('covered', ['interface/contract/vectors/a.json', 'interface/contract/']).status).toBe(0);
      // the folder's own README.md is never written over; one its ORIGIN records came with the export
      const T = makeTmp();
      try {
        expect(fn('own_file', [T, 'README.md']).status).not.toBe(0);
        writeFileSync(join(T, 'README.md'), 'ours\n');
        writeFileSync(join(T, 'pull.sh'), 'ours\n');
        expect(fn('own_file', [T, 'README.md']).status).toBe(0);
        expect(fn('own_file', [T, 'pull.sh']).status).toBe(0);
        expect(fn('own_file', [T, 'lines.json']).status).not.toBe(0);
        writeFileSync(join(T, 'ORIGIN'), `repository a/b\ncommit ${'c'.repeat(40)}\nsha256 ${'d'.repeat(64)} README.md\n`);
        expect(fn('own_file', [T, 'README.md']).status).not.toBe(0);
        expect(fn('own_file', [T, 'pull.sh']).status).toBe(0);
      } finally {
        removeTmp(T);
      }
    });

    it("takes the paths the provider's manifest lists for the export at the version asked, and nothing else", () => {
      const offer = (exports: unknown, id = 'contract', want = '1') => fn('export_paths', [id, want], JSON.stringify({ format: 1, exports }));
      const both = [{ id: 'contract', version: 1, paths: ['interface/contract/'] }, { id: 'profiles', version: 1, paths: ['framework/profiles/*.json'] }];
      const ok = offer(both);
      expect([ok.status, ok.stdout]).toEqual([0, 'interface/contract/\n']);
      expect(offer(both, 'profiles').stdout).toBe('framework/profiles/*.json\n');
      const v2 = offer([{ id: 'contract', version: 2, paths: ['interface/contract/'] }]);
      expect(v2.status).not.toBe(0);
      expect(v2.stderr).toMatch(/contract version 1 is not offered \(offered: contract 2\)/);
      expect(offer([]).status).not.toBe(0);
      expect(offer([{ id: 'contract', version: 1, paths: [] }]).status).not.toBe(0);
      expect(offer([{ id: 'contract', version: 1, paths: ['../hpcworker/interface/contract/'] }]).status).not.toBe(0);
      expect(offer([{ id: 'contract', version: 1, paths: ['/etc/'] }]).status).not.toBe(0);
      expect(fn('export_paths', ['contract', '1'], 'not json').status).not.toBe(0);
    });

    // gh as pull.sh asks it, answered from a folder that stands for the provider at one commit
    const GH_STANDIN = [
      '#!/bin/bash',
      '[ "$1" = api ] || exit 9',
      'shift',
      'if [ "$1" = -H ]; then p="${3#repos/OpenSpineConsortium/hpcworker/contents/}"; cat "$FAKE_PROVIDER/${p%%\\?*}"; exit; fi',
      'case "$1" in',
      `  repos/OpenSpineConsortium/hpcworker/commits/*) echo ${'c'.repeat(40)} ;;`,
      '  repos/OpenSpineConsortium/hpcworker) echo main ;;',
      '  repos/OpenSpineConsortium/hpcworker/compare/*) echo "${FAKE_COMPARE:-identical}" ;;',
      "  repos/OpenSpineConsortium/hpcworker/git/trees/*) cd \"$FAKE_PROVIDER\" && find . -type f | sed 's|^\\./|100644 |' | LC_ALL=C sort ;;",
      '  *) exit 9 ;;',
      'esac',
      '',
    ].join('\n');

    const IMP: Import = { repository: 'OpenSpineConsortium/hpcworker', export: 'contract', version: 1, into: 'test/hpcworker', origin: 'test/hpcworker/ORIGIN' };
    const offer = (version: number) =>
      JSON.stringify({ format: 1, exports: [{ id: 'contract', kind: 'contract', version, summary: 's', paths: ['interface/contract/'], consumers: [] }] }) + '\n';
    // a throwaway folder of the test's own holding a provider (the folder the stand-in answers from), a
    // repository with this pull.sh and a manifest that imports the provider's contract, and the stand-in
    const stage = (T: string, imports: unknown[] = [IMP], extra: Record<string, string> = {}) => {
      const prov = join(T, 'provider');
      const repo = join(T, 'repo');
      const given: Record<string, string> = {
        'interface/INTERFACE.json': offer(1),
        'interface/contract/lines.json': '{"lines": []}\n',
        'interface/contract/vectors/status-online.json': '{"v": 1}\n',
        'framework/bin/hpcworker': '#!/bin/bash\n',
        ...extra,
      };
      for (const [rel, body] of Object.entries(given)) {
        mkdirSync(dirname(join(prov, rel)), { recursive: true });
        writeFileSync(join(prov, rel), body);
      }
      mkdirSync(join(repo, 'interface'), { recursive: true });
      writeFileSync(join(repo, 'interface', 'pull.sh'), readFileSync(pull));
      writeFileSync(join(repo, 'interface', 'INTERFACE.json'), JSON.stringify({ format: 1, exports: [], imports }) + '\n');
      mkdirSync(join(T, 'bin'));
      writeFileSync(join(T, 'bin', 'gh'), GH_STANDIN, { mode: 0o755 });
      const run = (args: string[], env: Record<string, string> = {}) =>
        spawnSync('bash', [join(repo, 'interface', 'pull.sh'), ...args], {
          encoding: 'utf8',
          env: { ...process.env, PATH: `${join(T, 'bin')}:${process.env.PATH ?? ''}`, FAKE_PROVIDER: prov, ...env },
        });
      return { prov, repo, dir: join(repo, 'test', 'hpcworker'), run };
    };
    const taken = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? taken(join(d, n)).map((x) => `${n}/${x}`) : [n]));

    it('takes an export end to end from a stand-in for gh: only its paths, an ORIGIN the check accepts, nothing deleted', () => {
      const T = makeTmp();
      try {
        const { prov, repo, dir, run } = stage(T);
        const imp = IMP;

        // a commit main does not contain is refused before anything is placed
        let r = run(['--all'], { FAKE_COMPARE: 'diverged' });
        expect([r.status, r.stderr]).toEqual([1, expect.stringMatching(/is not on OpenSpineConsortium\/hpcworker's main/)]);
        expect(existsSync(join(dir, 'ORIGIN'))).toBe(false);

        r = run(['--all']);
        expect(r.status, r.stderr).toBe(0);
        expect(taken(dir).sort()).toEqual(['ORIGIN', 'lines.json', 'vectors/status-online.json']);
        expect(readFileSync(join(dir, 'ORIGIN'), 'utf8').split('\n').slice(0, 3)).toEqual(['repository OpenSpineConsortium/hpcworker', `commit ${'c'.repeat(40)}`, 'export contract 1']);
        // what the puller writes is what the check reads
        expect(importProblems(imp, repo)).toEqual([]);
        expect(run(['--pinned', 'test/hpcworker']).status).toBe(0);

        // a hand edit that rewrites ORIGIN too passes the check (design section 13); --pinned is what catches it
        writeFileSync(join(dir, 'lines.json'), '{"lines": ["edited"]}\n');
        const origin = readFileSync(join(dir, 'ORIGIN'), 'utf8').replace(/^sha256 \S+ lines\.json$/m, `sha256 ${sha('{"lines": ["edited"]}\n')} lines.json`);
        writeFileSync(join(dir, 'ORIGIN'), origin);
        expect(importProblems(imp, repo)).toEqual([]);
        r = run(['--pinned', 'test/hpcworker']);
        expect([r.status, r.stderr]).toEqual([1, expect.stringMatching(/is not what test\/hpcworker\/ORIGIN records/)]);
        expect(readFileSync(join(dir, 'lines.json'), 'utf8')).toBe('{"lines": ["edited"]}\n');
        // an ordinary pull writes over the edit without a word (design section 13)
        expect(run(['--all']).status).toBe(0);
        expect(importProblems(imp, repo)).toEqual([]);

        // a failed pull leaves the folder as it was: nothing placed, and no .part file but its own removed
        const before = new Map(taken(dir).map((f) => [f, readFileSync(join(dir, f), 'utf8')]));
        writeFileSync(join(prov, 'interface', 'contract', 'z.json'), '{ not json');
        r = run(['--all']);
        expect([r.status, r.stderr]).toEqual([1, expect.stringMatching(/z\.json at c+ is not JSON/)]);
        expect(new Map(taken(dir).map((f) => [f, readFileSync(join(dir, f), 'utf8')]))).toEqual(before);
        rmSync(join(prov, 'interface', 'contract', 'z.json'));

        // a file the provider dropped is listed, kept, and fails the check until a person removes it
        rmSync(join(prov, 'interface', 'contract', 'vectors', 'status-online.json'));
        r = run(['--all']);
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/not in OpenSpineConsortium\/hpcworker's export any more: test\/hpcworker\/vectors\/status-online\.json/);
        expect(existsSync(join(dir, 'vectors', 'status-online.json'))).toBe(true);
        expect(importProblems(imp, repo).join('\n')).toMatch(/vectors\/status-online\.json is not in test\/hpcworker\/ORIGIN/);

        // a version the provider does not offer is refused
        writeFileSync(join(prov, 'interface', 'INTERFACE.json'), offer(2));
        r = run(['--all']);
        expect([r.status, r.stderr]).toEqual([1, expect.stringMatching(/does not offer contract version 1/)]);
      } finally {
        removeTmp(T);
      }
    });

    it.skipIf(process.platform === 'win32')('refuses a link anywhere on the way to the copy before it writes, and never writes through one', () => {
      const SIBLING = '{"lines": ["the sibling checkout\'s own"]}\n';
      const cases: Array<[string, (repo: string, outside: string) => void, RegExp]> = [
        ['the folder', (repo, outside) => {
          mkdirSync(join(repo, 'test'));
          symlinkSync(outside, join(repo, 'test', 'hpcworker'));
        }, /FAILED: test\/hpcworker is a link/],
        ['a folder below it', (repo, outside) => {
          mkdirSync(join(repo, 'test', 'hpcworker'), { recursive: true });
          symlinkSync(outside, join(repo, 'test', 'hpcworker', 'vectors'));
        }, /FAILED: test\/hpcworker\/vectors is a link/],
        ['a folder above it', (repo, outside) => {
          symlinkSync(outside, join(repo, 'test'));
        }, /FAILED: test is a link/],
        ['a .part name', (repo, outside) => {
          mkdirSync(join(repo, 'test', 'hpcworker'), { recursive: true });
          symlinkSync(join(outside, 'lines.json'), join(repo, 'test', 'hpcworker', 'lines.json.part'));
        }, /FAILED: test\/hpcworker\/lines\.json\.part is a link/],
      ];
      for (const [where, make, said] of cases) {
        const T = makeTmp();
        try {
          const { repo, run } = stage(T);
          const outside = join(T, 'sibling', 'interface', 'contract');
          mkdirSync(outside, { recursive: true });
          writeFileSync(join(outside, 'lines.json'), SIBLING);
          writeFileSync(join(outside, 'status-online.json'), SIBLING);
          make(repo, outside);
          const r = run(['--all']);
          expect([r.status, r.stderr], where).toEqual([1, expect.stringMatching(said)]);
          expect(taken(outside).sort(), where).toEqual(['lines.json', 'status-online.json']);
          for (const f of ['lines.json', 'status-online.json']) expect(readFileSync(join(outside, f), 'utf8'), where).toBe(SIBLING);
        } finally {
          removeTmp(T);
        }
      }
    });

    it('refuses a .part name in the export and a .part file already in the folder, and changes nothing', () => {
      const T = makeTmp();
      try {
        // the export holds X and X.part: the fetch of X would write over X.part, and a failure remove it
        const { dir, run } = stage(T, [IMP], { 'interface/contract/lines.json.part': '{"also": "the export\'s"}\n' });
        const r = run(['--all']);
        expect([r.status, r.stderr]).toEqual([1, expect.stringMatching(/lines\.json\.part ends in \.part/)]);
        expect(existsSync(dir)).toBe(false);
      } finally {
        removeTmp(T);
      }
      const U = makeTmp();
      try {
        // a .part file left in the folder is not this run's, so it is never fetched over or removed
        const { dir, run } = stage(U);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'lines.json.part'), 'a person\'s\n');
        let r = run(['--all']);
        expect([r.status, r.stderr]).toEqual([1, expect.stringMatching(/test\/hpcworker\/lines\.json\.part is in the way/)]);
        expect(taken(dir)).toEqual(['lines.json.part']);
        expect(readFileSync(join(dir, 'lines.json.part'), 'utf8')).toBe('a person\'s\n');
        rmSync(join(dir, 'lines.json.part'));
        writeFileSync(join(dir, 'ORIGIN.part'), 'a person\'s\n');
        r = run(['--all']);
        expect([r.status, r.stderr]).toEqual([1, expect.stringMatching(/test\/hpcworker\/ORIGIN\.part is in the way/)]);
        expect(taken(dir)).toEqual(['ORIGIN.part']);
      } finally {
        removeTmp(U);
      }
    });

    it('refuses an import into the root or any folder but test/<name> before it asks GitHub anything, and writes nothing', () => {
      for (const into of ['.', 'test', 'interface', 'src/base', 'test/.']) {
        const T = makeTmp();
        try {
          const { repo, run } = stage(T, [{ ...IMP, into, origin: `${into}/ORIGIN` }], { 'interface/contract/package.json': '{"name": "the provider\'s"}\n', 'interface/contract/interface/pull.sh': 'echo the provider\'s\n' });
          writeFileSync(join(repo, 'package.json'), '{"name": "ours"}\n');
          const ours = readFileSync(join(repo, 'interface', 'pull.sh'), 'utf8');
          const r = run(['--all']);
          expect([r.status, r.stderr.includes('test/<name>')], into).toEqual([2, true]);
          // named on the command line, the folder is refused by its shape before the manifest is read
          const n = run([into]);
          expect([n.status, n.stderr.includes("is not an import's folder (test/<name>)")], into).toEqual([2, true]);
          expect(readFileSync(join(repo, 'package.json'), 'utf8'), into).toBe('{"name": "ours"}\n');
          expect(readFileSync(join(repo, 'interface', 'pull.sh'), 'utf8'), into).toBe(ours);
          expect(taken(repo).sort(), into).toEqual(['interface/INTERFACE.json', 'interface/pull.sh', 'package.json']);
        } finally {
          removeTmp(T);
        }
      }
    });

    it('stops with --all when the manifest is missing or not JSON, or node is missing, and never calls that nothing to take', () => {
      const T = makeTmp();
      try {
        const { repo, run } = stage(T);
        const manifestFile = join(repo, 'interface', 'INTERFACE.json');
        const good = readFileSync(manifestFile, 'utf8');
        writeFileSync(manifestFile, good.slice(0, -2));
        let r = run(['--all']);
        expect([r.status, r.stdout.includes('nothing to take')]).toEqual([2, false]);
        expect(r.stderr).toMatch(/interface\/INTERFACE\.json is not JSON/);
        rmSync(manifestFile);
        r = run(['--all']);
        expect([r.status, r.stdout.includes('nothing to take')]).toEqual([2, false]);
        writeFileSync(manifestFile, good);
        // a PATH with what the script needs before it reads a manifest, and no node
        const bare = join(T, 'bare');
        mkdirSync(bare);
        const where = (cmd: string) => spawnSync('bash', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).stdout.trim();
        symlinkSync(where('dirname'), join(bare, 'dirname'));
        writeFileSync(join(bare, 'gh'), '#!/bin/sh\nexit 99\n', { mode: 0o755 });
        r = spawnSync(where('bash'), [join(repo, 'interface', 'pull.sh'), '--all'], { encoding: 'utf8', env: { ...process.env, PATH: bare } });
        expect([r.status, r.stdout.includes('nothing to take')]).toEqual([1, false]);
        expect(r.stderr).toMatch(/node is needed/);
      } finally {
        removeTmp(T);
      }
    });

    it("never unsets gh's own sign-in, never names a token, and never runs another repository's code", () => {
      // gh's ordinary sign-in includes GH_TOKEN and GITHUB_TOKEN (in a cloud session they are how it is
      // signed in); the script reads neither, and nothing it fetches is run
      const body = readFileSync(pull, 'utf8');
      expect(body).not.toMatch(/env -u|unset\s+(?:GH_TOKEN|GITHUB_TOKEN)|\$\{?(?:GH_TOKEN|GITHUB_TOKEN)/);
      expect(body).not.toMatch(/\bgit clone\b|\bcurl\b|\bwget\b|\bsource\s+"\$dest|\bbash\s+"\$dest|\beval\b/);
      // and it deletes nothing but the .part files it fetched itself, when a pull fails before placing them
      expect(body.split('\n').filter((l) => /\brm\b|\brmdir\b|\bunlink\b/.test(l))).toEqual([expect.stringMatching(/^\s*drop_parts\(\) \{ local f; for f in "\$\{parts\[@\]\}"; do rm -f "\$f"; done; \}$/)]);
      expect(body.match(/parts\+=\(.*\)/g)).toEqual(['parts+=("$dest.part")']);
    });
  });
});
