// beethoven-base's check of its pinned copy in an edition. `vendor` copies this file, byte for byte,
// to vendor/beethoven-base/check.mjs at the edition's repository root, beside ORIGIN; the edition's
// CI and pre-push hook run it with no secret and no network:
//
//   node vendor/beethoven-base/check.mjs [--base <branch>]
//
// It fails when a file of the copy differs from ORIGIN, when the copy holds a file ORIGIN does not
// list (one added by hand, or left over from an older release), and when ORIGIN's release is older
// than the one on the pull request's base branch, read with `git show
// origin/<base>:vendor/beethoven-base/ORIGIN`; that last one catches a rebase that took the older
// side. The base branch is --base, else GITHUB_BASE_REF (set on a pull_request run), else main. CI
// must check out with `fetch-depth: 0`, or origin/<base> is not in the clone and the check fails
// saying so.
//
// It is a check in the edition, not a proof: an edit to this file that also rewrites ORIGIN passes
// it, since it is the copy checking itself. `node tools/vendor.mjs check --into <edition> --source
// <base checkout>`, run from beethoven-base's own checkout, closes that gap by rebuilding the copy
// from the commit ORIGIN names.
//
// Plain Node 18 or later, no dependency, any platform. The same file is the one implementation of the
// ORIGIN record that beethoven-base's own tools import, so what `vendor` writes is what this reads.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY = 'OpenSpineConsortium/beethoven-base';
/** where the record and this file sit in an edition, relative to its repository root */
export const VENDOR_DIR = 'vendor/beethoven-base';
export const CHECK_PATH = `${VENDOR_DIR}/check.mjs`;
export const ORIGIN_PATH = `${VENDOR_DIR}/ORIGIN`;
/** where each edition keeps the modules, relative to its repository root (design section 4) */
export const EDITION_ROOTS = Object.freeze({
  desktop: 'src/base',
  browser: 'extension/src/base',
  vscode: 'extension/src/base',
});

const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const RELEASE = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const KEYS = ['repository', 'ref', 'commit', 'tree_sha256', 'files', 'edition'];

/**
 * @typedef {object} Origin
 * @property {string} repository
 * @property {string} ref the release tag, v<major>.<minor>.<patch>; for the hpcworker pin, the ref as given
 * @property {string} commit
 * @property {string} tree_sha256
 * @property {number} files
 * @property {string} [edition]
 * @property {Map<string, string>} entries path -> sha256 of the file's bytes, one per `file:` line
 */

/** @param {string} path @returns {boolean} a relative path, forward slashes, that cannot leave the folder it is joined to */
export function safeRelPath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.startsWith('/') || /[\\\0\r\n]/.test(path)) return false;
  if (/^[A-Za-z]:/.test(path)) return false;
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

/** @param {Buffer | string} data @returns {string} */
export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * beethoven-qa's tree digest: the sha256 of every (path, sha256) pair, sorted by path, each written as
 * the path, a NUL, the 64 hex characters and a newline. Sorting makes it a property of the tree, not
 * of the order a walk returned.
 * @param {Iterable<[string, string]>} entries
 * @returns {string}
 */
export function treeDigest(entries) {
  const sorted = [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return sha256(sorted.map(([path, digest]) => `${path}\0${digest}\n`).join(''));
}

/** @param {string} ref @returns {number[] | undefined} */
export function releaseOf(ref) {
  const m = RELEASE.exec(ref);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

/** @param {string} a @param {string} b @returns {number} below 0 when release a is older than b; both must be releases */
export function compareReleases(a, b) {
  const x = releaseOf(a);
  const y = releaseOf(b);
  if (!x || !y) throw new Error(`not a release: ${x ? b : a}`);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return /** @type {number} */ (x[i]) - /** @type {number} */ (y[i]);
  return 0;
}

/**
 * Reads an ORIGIN record. Every line is `key: value`; `file: <path> <sha256>` repeats, every other key
 * appears once. Unknown keys, a malformed value or a count that disagrees with the file lines throw.
 * @param {string} text
 * @param {{ edition: boolean }} want whether an `edition:` line is required (an edition's copy) or refused (the hpcworker pin)
 * @returns {Origin}
 */
export function parseOrigin(text, want) {
  /** @type {Record<string, string>} */
  const fields = {};
  /** @type {Map<string, string>} */
  const entries = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.trim() === '') continue;
    const at = line.indexOf(': ');
    if (at <= 0) throw new Error(`ORIGIN line "${line}" is not one "key: value" pair`);
    const key = line.slice(0, at);
    const value = line.slice(at + 2);
    if (key === 'file') {
      const space = value.lastIndexOf(' ');
      const path = value.slice(0, space);
      const digest = value.slice(space + 1);
      if (space <= 0 || !safeRelPath(path) || !HEX64.test(digest)) throw new Error(`ORIGIN line "${line}" is not "file: <path> <sha256>"`);
      if (entries.has(path)) throw new Error(`ORIGIN lists ${path} twice`);
      entries.set(path, digest);
      continue;
    }
    if (!KEYS.includes(key)) throw new Error(`ORIGIN has an unknown key "${key}"`);
    if (key in fields) throw new Error(`ORIGIN has "${key}" twice`);
    fields[key] = value;
  }
  for (const key of KEYS) {
    if (key === 'edition' && !want.edition) continue;
    if (!(key in fields)) throw new Error(`ORIGIN has no "${key}" line`);
  }
  if (!want.edition && 'edition' in fields) throw new Error('this ORIGIN takes no "edition" line');
  const { repository = '', ref = '', commit = '', tree_sha256 = '', files = '', edition } = fields;
  for (const [key, value] of Object.entries({ repository, ref })) {
    if (!value || /[\s:]/.test(value)) throw new Error(`ORIGIN's ${key} must be one word without a colon`);
  }
  if (!HEX40.test(commit)) throw new Error("ORIGIN's commit must be a full 40-character git SHA in lower-case hex");
  if (!HEX64.test(tree_sha256)) throw new Error("ORIGIN's tree_sha256 must be a sha256 in lower-case hex");
  if (!/^(0|[1-9][0-9]*)$/.test(files)) throw new Error("ORIGIN's files must be a whole number");
  if (want.edition && !Object.prototype.hasOwnProperty.call(EDITION_ROOTS, edition ?? '')) {
    throw new Error(`ORIGIN's edition "${edition}" is none of ${Object.keys(EDITION_ROOTS).join(', ')}`);
  }
  return { repository, ref, commit, tree_sha256, files: Number(files), ...(want.edition ? { edition } : {}), entries };
}

/** @param {Origin} o @returns {string} the record, keys in a fixed order, file lines sorted by path */
export function renderOrigin(o) {
  const head = [
    `repository: ${o.repository}`,
    `ref: ${o.ref}`,
    `commit: ${o.commit}`,
    `tree_sha256: ${o.tree_sha256}`,
    `files: ${o.files}`,
    ...(o.edition ? [`edition: ${o.edition}`] : []),
  ];
  const lines = [...o.entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([p, d]) => `file: ${p} ${d}`);
  return [...head, ...lines].join('\n') + '\n';
}

// ---- git, files and paths --------------------------------------------------------------------------

/** @type {Set<string> | undefined} */
let localVars;
/**
 * The environment for every git call: without the variables git treats as naming one repository
 * (`git rev-parse --local-env-vars`: GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE and the rest). A pre-push
 * hook runs with GIT_DIR set, and a git that inherits it acts on that repository whatever -C names
 * (beethoven-qa measured it on 2026-10-04: a test's throwaway `git init` reconfigured the developer's
 * own checkout). Configuration given through the environment (GIT_CONFIG_PARAMETERS, GIT_CONFIG_COUNT
 * and its pairs) names no repository and stays.
 * @returns {NodeJS.ProcessEnv}
 */
export function gitEnv() {
  if (!localVars) {
    const r = spawnSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' });
    localVars = new Set((r.stdout ?? '').split(/\s+/).filter(Boolean));
    localVars.delete('GIT_CONFIG_PARAMETERS');
    localVars.delete('GIT_CONFIG_COUNT');
  }
  /** @type {NodeJS.ProcessEnv} */
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!localVars.has(k)) env[k] = v;
  return env;
}

/**
 * Runs git in `cwd`. Never through a shell: every argument is one argv entry.
 * @param {string} cwd
 * @param {string[]} args
 * @param {{ input?: string }} [opts]
 * @returns {{ ok: boolean, out: string, err: string }}
 */
export function git(cwd, args, opts = {}) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: gitEnv(), input: opts.input, maxBuffer: 256 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout ?? '', err: (r.stderr ?? '') + (r.error ? String(r.error.message) : '') };
}

/** @param {string} cwd @param {string[]} args @returns {Buffer | undefined} the raw bytes git printed, or undefined when it failed */
export function gitBytes(cwd, args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { env: gitEnv(), maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : undefined;
}

/** @param {string} a @param {string} b @returns {boolean} the same place on disk (Windows: any case, any short name) */
export function samePath(a, b) {
  /** @param {string} p */
  const canon = (p) => {
    try {
      return realpathSync.native(p);
    } catch {
      return resolve(p);
    }
  };
  const x = canon(a);
  const y = canon(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

/** @param {string} dir @returns {boolean} whether dir is the root of a git checkout */
export function isCheckoutRoot(dir) {
  const r = git(dir, ['rev-parse', '--show-toplevel']);
  return r.ok && samePath(r.out.trim(), dir);
}

/**
 * Why a path below `root` could reach somewhere else, or undefined: every component of `rel` that
 * exists must not be a link, and every one but the last must be a directory.
 * @param {string} root
 * @param {string} rel forward slashes
 * @returns {string | undefined}
 */
export function linkOnPath(root, rel) {
  let probe = root;
  const parts = rel.split('/');
  for (let i = 0; i < parts.length; i++) {
    probe = join(probe, /** @type {string} */ (parts[i]));
    let st;
    try {
      st = lstatSync(probe);
    } catch {
      return undefined;
    }
    if (st.isSymbolicLink()) return `${parts.slice(0, i + 1).join('/')} is a link`;
    if (i < parts.length - 1 && !st.isDirectory()) return `${parts.slice(0, i + 1).join('/')} is a file where a folder belongs`;
  }
  return undefined;
}

/**
 * Every entry under `dir` (relative to `root`, forward slashes): its regular files, and anything that is
 * neither a regular file nor a folder (a link, a device), which a copy never holds. A missing dir is empty.
 * @param {string} root
 * @param {string} rel
 * @returns {{ files: string[], odd: string[] }}
 */
export function walk(root, rel) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const odd = [];
  /** @param {string} r */
  const visit = (r) => {
    let names;
    try {
      names = readdirSync(join(root, ...r.split('/')));
    } catch {
      return;
    }
    for (const name of names.sort()) {
      const child = `${r}/${name}`;
      const st = lstatSync(join(root, ...child.split('/')));
      if (st.isSymbolicLink() || (!st.isFile() && !st.isDirectory())) odd.push(child);
      else if (st.isDirectory()) visit(child);
      else files.push(child);
    }
  };
  let st;
  try {
    st = lstatSync(join(root, ...rel.split('/')));
  } catch {
    return { files, odd };
  }
  if (st.isSymbolicLink() || !st.isDirectory()) odd.push(rel);
  else visit(rel);
  return { files, odd };
}

/** @param {string} root @param {string} rel @returns {Buffer} */
export function readRel(root, rel) {
  return readFileSync(join(root, ...rel.split('/')));
}

/**
 * The record at `rel` below `root`, refusing a link.
 * @param {string} root
 * @param {string} rel
 * @param {{ edition: boolean }} want
 * @returns {Origin}
 */
export function readOrigin(root, rel, want) {
  const st = lstatSync(join(root, ...rel.split('/')));
  if (!st.isFile()) throw new Error(`${rel} is not a regular file`);
  return parseOrigin(readRel(root, rel).toString('utf8'), want);
}

/**
 * The files of an edition's copy, relative to the edition's root: everything under the edition's
 * module folder and under vendor/beethoven-base, the record itself left out.
 * @param {string} root
 * @param {string} edition
 * @returns {{ files: string[], odd: string[] }}
 */
export function copyFiles(root, edition) {
  const modules = /** @type {string} */ (EDITION_ROOTS[/** @type {keyof typeof EDITION_ROOTS} */ (edition)]);
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const odd = [];
  for (const rel of [modules, VENDOR_DIR]) {
    const reason = linkOnPath(root, rel);
    if (reason) {
      odd.push(rel);
      continue;
    }
    const w = walk(root, rel);
    files.push(...w.files.filter((f) => f !== ORIGIN_PATH));
    odd.push(...w.odd);
  }
  return { files, odd };
}

// ---- the check ---------------------------------------------------------------------------------------

/**
 * Compares a copy with its record, and the record with the one on the base branch.
 * @param {string} root the edition's repository root
 * @param {{ base: string }} opts
 * @returns {{ failures: string[], notes: string[], origin?: Origin }}
 */
export function checkCopy(root, opts) {
  /** @type {string[]} */
  const failures = [];
  /** @type {string[]} */
  const notes = [];
  const reason = linkOnPath(root, ORIGIN_PATH);
  if (reason) return { failures: [`${reason}; a copy holds no link`], notes };
  /** @type {Origin} */
  let origin;
  try {
    origin = readOrigin(root, ORIGIN_PATH, { edition: true });
  } catch (e) {
    return { failures: [`${ORIGIN_PATH} cannot be read: ${e instanceof Error ? e.message : String(e)}`], notes };
  }
  if (origin.repository !== REPOSITORY) failures.push(`ORIGIN names ${origin.repository}, not ${REPOSITORY}`);
  if (!releaseOf(origin.ref)) failures.push(`ORIGIN's ref ${origin.ref} is not a release (v<major>.<minor>.<patch>)`);
  if (origin.entries.size !== origin.files || treeDigest(origin.entries) !== origin.tree_sha256) {
    failures.push("ORIGIN's files and tree_sha256 are not those of its own file lines: the record was edited by hand");
  }
  const edition = /** @type {string} */ (origin.edition);
  const modules = EDITION_ROOTS[/** @type {keyof typeof EDITION_ROOTS} */ (edition)];
  for (const path of origin.entries.keys()) {
    if (path !== CHECK_PATH && !(path.startsWith(`${modules}/`) && !path.slice(modules.length + 1).includes('/'))) {
      failures.push(`ORIGIN lists ${path}, which is outside ${modules}/ and ${VENDOR_DIR}/`);
    }
  }
  const { files, odd } = copyFiles(root, edition);
  for (const rel of odd) failures.push(`${rel} is a link or not a regular file; a copy holds neither`);
  const present = new Set(files);
  for (const [path, digest] of origin.entries) {
    if (!present.has(path)) {
      if (!odd.includes(path)) failures.push(`${path} is listed in ORIGIN and missing`);
      continue;
    }
    if (sha256(readRel(root, path)) !== digest) {
      failures.push(`${path} differs from ORIGIN: it was edited by hand (a checkout that converts line endings does that too; the edition's .gitattributes keeps them LF)`);
    }
  }
  const extra = files.filter((f) => !origin.entries.has(f));
  if (extra.length > 0) {
    failures.push(`the copy holds files ORIGIN does not list (added by hand, or left over from an older release): ${extra.join(', ')}`);
    failures.push(`remove them in a reviewed commit: ${removeLine(extra)}`);
  }
  failures.push(...againstBase(root, origin, opts.base, notes));
  return { failures, notes, origin };
}

/**
 * The shell line that removes files whether or not git tracks them (beethoven-qa's form).
 * @param {string[]} paths
 * @returns {string}
 */
export function removeLine(paths) {
  const q = paths.map((p) => (/^[A-Za-z0-9._/-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`)).join(' ');
  return `rm -- ${q} && git rm -q --cached --ignore-unmatch -- ${q}`;
}

/**
 * @param {string} root
 * @param {Origin} origin
 * @param {string} base
 * @param {string[]} notes
 * @returns {string[]}
 */
function againstBase(root, origin, base, notes) {
  if (!/^[A-Za-z0-9._][A-Za-z0-9._/-]*$/.test(base) || base.includes('..')) return [`"${base}" is not a branch name`];
  const ref = `refs/remotes/origin/${base}`;
  if (!git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).ok) {
    return [`origin/${base} is not in this clone, so the copy cannot be compared with the base branch's; fetch it (in CI, actions/checkout with fetch-depth: 0)`];
  }
  if (!git(root, ['cat-file', '-e', `${ref}:${ORIGIN_PATH}`]).ok) {
    notes.push(`origin/${base} holds no copy of beethoven-base yet; nothing to compare`);
    return [];
  }
  /** @type {Origin} */
  let theirs;
  try {
    theirs = parseOrigin(git(root, ['show', `${ref}:${ORIGIN_PATH}`]).out, { edition: true });
  } catch (e) {
    return [`origin/${base}'s ${ORIGIN_PATH} cannot be read: ${e instanceof Error ? e.message : String(e)}`];
  }
  if (theirs.edition !== origin.edition) return [`ORIGIN names the edition ${origin.edition}; origin/${base}'s names ${theirs.edition}`];
  if (!releaseOf(origin.ref) || !releaseOf(theirs.ref)) return [];
  const order = compareReleases(origin.ref, theirs.ref);
  if (order < 0) {
    return [`ORIGIN records ${origin.ref}, older than ${theirs.ref} on origin/${base}: a rebase or merge took the older copy; take ${theirs.ref} or later`];
  }
  if (order === 0 && theirs.commit !== origin.commit) {
    return [`ORIGIN records ${origin.ref} as ${origin.commit.slice(0, 12)}; origin/${base} records it as ${theirs.commit.slice(0, 12)}: a release tag that moved`];
  }
  notes.push(`origin/${base} records ${theirs.ref}`);
  return [];
}

/** @param {string[]} argv @returns {number} */
export function main(argv) {
  const here = resolve(argv[1] ?? '');
  const copyDir = dirname(here);
  if (basename(copyDir) !== 'beethoven-base' || basename(dirname(copyDir)) !== 'vendor') {
    console.error(`check: this is beethoven-base's template; it runs as ${CHECK_PATH} at an edition's root (node ${CHECK_PATH})`);
    return 2;
  }
  const root = dirname(dirname(copyDir));
  /** @type {string | undefined} */
  let base;
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base' && i + 1 < args.length) base = args[++i];
    else {
      console.error(`check: unknown argument ${args[i]}; usage: node ${CHECK_PATH} [--base <branch>]`);
      return 2;
    }
  }
  base = base ?? (process.env.GITHUB_BASE_REF || 'main');
  if (!isCheckoutRoot(root)) {
    console.error(`check: ${root} is not the root of a git checkout`);
    return 2;
  }
  const { failures, notes, origin } = checkCopy(root, { base });
  for (const n of notes) console.log(`check: ${n}`);
  for (const f of failures) console.error(`check: ${f}`);
  if (failures.length > 0) {
    console.error(`check: ${failures.length} failure(s) in ${VENDOR_DIR}`);
    return 1;
  }
  const o = /** @type {Origin} */ (origin);
  console.log(`check: ${o.files} files match ORIGIN (beethoven-base ${o.ref}, ${o.commit.slice(0, 12)}, edition ${o.edition})`);
  return 0;
}

// Run as a command, not when the tools import the record functions above. Both sides through the
// file system's own spelling, so a Windows drive letter or a short name compares equal.
const self = fileURLToPath(import.meta.url);
const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
if (invoked && (invoked === self || samePath(invoked, self)) && invoked.endsWith(`${sep}check.mjs`)) {
  process.exitCode = main(process.argv);
}
