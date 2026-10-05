// The three typecheck lanes: base's modules compiled where and as each edition will hold them.
//
//   node tools/lanes.mjs                          every lane: desktop, browser, vscode (5.9.3), vscode (7.0.2)
//   node tools/lanes.mjs <desktop|browser|vscode> [--compiler 5|7]
//
// A lane copies src/*.ts into a folder of its own under the system's temporary folder, laid out as
// the edition's checkout is: the modules at its module folder (desktop src/base, the others
// extension/src/base) under a package.json of the edition's module kind, and a tsconfig.json that
// extends this checkout's tsconfig.<lane>.json, which holds the edition's own compiler options. The
// package.json is what makes the VS Code lane real: Node16 reads a .ts file as CommonJS or as an ES
// module by the nearest package.json, VS Code's extension/package.json has no "type" (CommonJS),
// desktop's and the browser's say "module", and base's own says "module". Then the lane's compiler
// runs there (typescript 5.9.3, or the VS Code lane also under 7.0.2, the version VS Code's main
// pins), and its messages are printed with the copy's paths turned back into src/. The folder is
// removed afterwards; it is the lane's own, made by mkdtemp, and nothing else is touched.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EDITION_ROOTS } from '../vendor/check.mjs';

const BASE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPILERS = { 5: join(BASE, 'node_modules', 'typescript', 'bin', 'tsc'), 7: join(BASE, 'node_modules', 'typescript7', 'bin', 'tsc') };
/** each edition's package.json folder and module kind, read from the editions' checkouts (design section 3) */
const LANES = {
  desktop: { pkgDir: '.', type: 'module' },
  browser: { pkgDir: 'extension', type: 'module' },
  vscode: { pkgDir: 'extension', type: undefined },
};

/** @param {keyof typeof LANES} lane @param {5 | 7} compiler @returns {number} */
function runLane(lane, compiler) {
  const tsc = COMPILERS[compiler];
  const version = spawnSync(process.execPath, [tsc, '--version'], { encoding: 'utf8' }).stdout.trim();
  const modules = readdirSync(join(BASE, 'src')).filter((n) => n.endsWith('.ts'));
  const stage = mkdtempSync(join(tmpdir(), `beethoven-base-lane-${lane}-`));
  try {
    const root = EDITION_ROOTS[lane];
    const { pkgDir, type } = LANES[lane];
    mkdirSync(join(stage, ...root.split('/')), { recursive: true });
    for (const m of modules) cpSync(join(BASE, 'src', m), join(stage, ...root.split('/'), m));
    writeFileSync(join(stage, pkgDir, 'package.json'), JSON.stringify({ private: true, ...(type ? { type } : {}) }, null, 2) + '\n');
    writeFileSync(join(stage, 'tsconfig.json'), JSON.stringify({ extends: join(BASE, `tsconfig.${lane}.json`), include: [`${root}/**/*.ts`] }, null, 2) + '\n');
    const r = spawnSync(process.execPath, [tsc, '-p', join(stage, 'tsconfig.json')], { encoding: 'utf8', cwd: stage });
    const where = join(stage, ...root.split('/'));
    /** @param {string} s */
    const back = (s) => s.split(where + (where.includes('\\') ? '\\' : '/')).join('src/').split(`${root}/`).join('src/');
    const out = back(`${r.stdout ?? ''}${r.stderr ?? ''}`).trim();
    if (out) console.log(out);
    const kind = type === 'module' ? 'ES modules' : 'CommonJS';
    if (r.status === 0) console.log(`lane ${lane}: ${modules.length} module(s) compile as ${kind} at ${root}/ under ${version}`);
    else console.error(`lane ${lane}: does not compile as ${kind} at ${root}/ under ${version}`);
    return r.status === 0 ? 0 : 1;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
/** @type {Array<[keyof typeof LANES, 5 | 7]>} */
let plan;
if (args.length === 0) {
  plan = [['desktop', 5], ['browser', 5], ['vscode', 5], ['vscode', 7]];
} else {
  const lane = /** @type {string} */ (args[0]);
  const compiler = args[1] === '--compiler' ? Number(args[2]) : 5;
  if (!(lane in LANES) || (args.length !== 1 && args.length !== 3) || (compiler !== 5 && compiler !== 7)) {
    console.error('usage: node tools/lanes.mjs [<desktop|browser|vscode> [--compiler 5|7]]');
    process.exit(2);
  }
  plan = [[/** @type {keyof typeof LANES} */ (lane), compiler]];
}
let failed = 0;
for (const [lane, compiler] of plan) failed += runLane(lane, compiler);
process.exitCode = failed ? 1 : 0;
