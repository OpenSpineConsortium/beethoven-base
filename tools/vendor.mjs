// beethoven-base's pinned copy in an edition (design section 4), on beethoven-qa's model with a
// downgrade refusal added. Three commands, each run from a beethoven-base checkout:
//
//   node tools/vendor.mjs vendor --into <edition checkout> --edition <desktop|browser|vscode>
//   node tools/vendor.mjs check --into <edition checkout> --source <this checkout> [--base <branch>]
//   node tools/vendor.mjs lists
//
// vendor runs from a clean checkout whose HEAD carries a v* tag and reads everything it copies from
// that commit's own objects (git ls-tree and cat-file), never from the working tree. Into the edition
// it writes the modules editions/<name>.json lists, at the edition's module folder (desktop src/base,
// the browser and VS Code extension/src/base), and vendor/beethoven-base/check.mjs and ORIGIN at its
// repository root, ORIGIN last. It stays inside those two folders and never writes through a link.
// Before the first write it refuses: a base checkout with any uncommitted or untracked file; a HEAD
// with no v* tag; a list that names a module that is not there, or leaves out one a module imports;
// a link on any path it would write or anywhere in the copy; a file in the copy that the ORIGIN
// already there does not list (added by hand); a file to be replaced that is neither what ORIGIN says
// nor what the edition's HEAD holds; and a release older than the one in the copy already there or
// in the edition's origin/main:vendor/beethoven-base/ORIGIN (read with git show; nothing is fetched,
// so fetch first). It never deletes: a file the previous ORIGIN listed that this release lacks is
// printed with the line that removes it, and check.mjs fails until a reviewed commit has.
//
// Exit 0: written, nothing left over. 1: written, but files of the older release remain (printed).
// 2: refused before anything was written. 3: stopped part way by the file system; git status shows
// what was written.
//
// check is the anchored form of the edition's own check: the plain check, by this checkout's code
// rather than the copy's, then the copy rebuilt from the commit ORIGIN names, so an edited check.mjs
// with a rewritten ORIGIN is caught (beethoven-qa's `vendor-check --source`). --source must name the
// checkout this file runs from, said out loud so nobody mistakes a copy for the anchor.
//
// lists checks base's own editions/*.json against src/: each edition has one, every module it names
// is there, and every module a listed one imports is listed too. The gate runs it.
//
// editions/<name>.json is {"modules": ["links.ts", ...]}: file names in src/, flat, lower-case, .ts;
// nothing else. A module imports others only as "./<name>.js", so its imports travel with it on
// every list that takes it.
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHECK_PATH,
  EDITION_ROOTS,
  ORIGIN_PATH,
  REPOSITORY,
  VENDOR_DIR,
  checkCopy,
  compareReleases,
  copyFiles,
  git,
  gitBytes,
  isCheckoutRoot,
  linkOnPath,
  parseOrigin,
  readOrigin,
  releaseOf,
  renderOrigin,
  samePath,
  sha256,
  treeDigest,
} from '../vendor/check.mjs';
import { Refused, flags, isFile, preflight, printDropped, writeInside } from './lib.mjs';

/** @typedef {import('../vendor/check.mjs').Origin} Origin */

const BASE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = 'vendor/check.mjs';
const MODULE_NAME = /^[a-z][a-z0-9-]*\.ts$/;
const EDITIONS = Object.keys(EDITION_ROOTS);

/** @param {string} name @returns {name is keyof typeof EDITION_ROOTS} */
function isEdition(name) {
  return EDITIONS.includes(name);
}

/**
 * A list file's content, checked: {"modules": [...]} and nothing else.
 * @param {string} text
 * @param {string} where
 * @returns {string[]}
 */
function parseList(text, where) {
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Refused(`${where} is not JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Refused(`${where} is not an object`);
  const keys = Object.keys(data);
  if (keys.length !== 1 || keys[0] !== 'modules') throw new Refused(`${where} must hold exactly one key, "modules"`);
  const modules = /** @type {{ modules: unknown }} */ (data).modules;
  if (!Array.isArray(modules)) throw new Refused(`${where}: "modules" is not a list`);
  /** @type {string[]} */
  const out = [];
  for (const m of modules) {
    if (typeof m !== 'string' || !MODULE_NAME.test(m)) throw new Refused(`${where}: ${JSON.stringify(m)} is not a module file name (lower-case, flat, .ts)`);
    if (out.includes(m)) throw new Refused(`${where} names ${m} twice`);
    out.push(m);
  }
  return out;
}

/**
 * The modules a module imports, by file name. Only "./<name>.js" (or "./<name>", "./<name>.ts") is a
 * module of base; anything else is refused here and by the posture scan.
 * @param {string} text
 * @param {string} where
 * @returns {string[]}
 */
function importsOf(text, where) {
  /** @type {string[]} */
  const out = [];
  for (const m of text.matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g)) {
    const spec = /** @type {string} */ (m[1] ?? m[2]);
    const name = /^\.\/([a-z][a-z0-9-]*)(?:\.js|\.ts)?$/.exec(spec);
    if (!name) throw new Refused(`${where} imports ${spec}; a module of base imports only "./<module>.js"`);
    out.push(`${name[1]}.ts`);
  }
  return out;
}

/**
 * Refuses a list that leaves out a module one of its modules imports.
 * @param {string[]} modules
 * @param {(m: string) => string} textOf
 * @param {string} listName
 */
function closed(modules, textOf, listName) {
  for (const m of modules) {
    for (const dep of importsOf(textOf(m), `src/${m}`)) {
      if (!modules.includes(dep)) throw new Refused(`src/${m} imports ./${dep.replace(/\.ts$/, '.js')}, which ${listName} does not list`);
    }
  }
}

/**
 * One file of a commit: a regular, non-executable file, read from git's objects.
 * @param {string} repo
 * @param {string} commit
 * @param {string} path
 * @returns {Buffer | undefined} undefined when the commit has no such path
 */
function blobAt(repo, commit, path) {
  const listing = gitBytes(repo, ['ls-tree', '-z', '--full-tree', commit, '--', path]);
  if (listing === undefined) throw new Refused(`git cannot list ${path} at ${commit.slice(0, 12)}`);
  const item = listing.toString('utf8').split('\0').find((x) => x.endsWith(`\t${path}`));
  if (!item) return undefined;
  const [mode, kind, oid] = item.slice(0, item.indexOf('\t')).split(' ');
  if (kind !== 'blob' || mode !== '100644') throw new Refused(`${path} is a ${mode} ${kind} at ${commit.slice(0, 12)}; a copy holds plain files only (no link, no submodule, no executable)`);
  const data = gitBytes(repo, ['cat-file', 'blob', /** @type {string} */ (oid)]);
  if (data === undefined) throw new Refused(`git cannot read ${path} at ${commit.slice(0, 12)}`);
  return data;
}

/**
 * What a copy of `commit` for `edition` holds, by its path in the edition: the listed modules and
 * check.mjs, read from the commit's objects.
 * @param {string} repo
 * @param {string} commit
 * @param {keyof typeof EDITION_ROOTS} edition
 * @returns {Map<string, Buffer>}
 */
function releaseFiles(repo, commit, edition) {
  const listPath = `editions/${edition}.json`;
  const list = blobAt(repo, commit, listPath);
  if (!list) throw new Refused(`${commit.slice(0, 12)} has no ${listPath}`);
  const modules = parseList(list.toString('utf8'), `${listPath} at ${commit.slice(0, 12)}`);
  /** @type {Map<string, Buffer>} */
  const texts = new Map();
  for (const m of modules) {
    const data = blobAt(repo, commit, `src/${m}`);
    if (!data) throw new Refused(`${listPath} names ${m}, and ${commit.slice(0, 12)} has no src/${m}`);
    texts.set(m, data);
  }
  closed(modules, (m) => /** @type {Buffer} */ (texts.get(m)).toString('utf8'), listPath);
  const template = blobAt(repo, commit, TEMPLATE);
  if (!template) throw new Refused(`${commit.slice(0, 12)} has no ${TEMPLATE}`);
  /** @type {Map<string, Buffer>} */
  const files = new Map();
  for (const [m, data] of texts) files.set(`${EDITION_ROOTS[edition]}/${m}`, data);
  files.set(CHECK_PATH, template);
  return files;
}

/** @param {string} repo @returns {{ commit: string, ref: string }} */
function releaseAtHead(repo) {
  const commit = git(repo, ['rev-parse', '--verify', 'HEAD^{commit}']).out.trim();
  const tags = git(repo, ['tag', '--points-at', 'HEAD']).out.split('\n').filter((t) => releaseOf(t));
  if (!commit || tags.length === 0) throw new Refused('HEAD carries no release tag (v<major>.<minor>.<patch>); check out the release to take, for example git checkout v1.0.0');
  tags.sort(compareReleases);
  return { commit, ref: /** @type {string} */ (tags[tags.length - 1]) };
}

/**
 * Refuses taking `ref` where `recorded` (an ORIGIN already there, or on origin/main) is newer, or names
 * the same release as another commit, or another edition.
 * @param {Origin} recorded
 * @param {{ ref: string, commit: string, edition: string }} taking
 * @param {string} where
 */
function notOlder(recorded, taking, where) {
  if (recorded.edition !== taking.edition) throw new Refused(`${where} is a copy for the edition ${recorded.edition}, not ${taking.edition}`);
  if (!releaseOf(recorded.ref)) throw new Refused(`${where} records ${recorded.ref}, which is not a release`);
  const order = compareReleases(taking.ref, recorded.ref);
  if (order < 0) throw new Refused(`${where} records ${recorded.ref}, newer than ${taking.ref}; a release older than the edition's is never taken`);
  if (order === 0 && recorded.commit !== taking.commit) {
    throw new Refused(`${where} records ${recorded.ref} as ${recorded.commit.slice(0, 12)}, and here it is ${taking.commit.slice(0, 12)}: a release tag that moved`);
  }
}

/** @param {string} into @param {string} edition @returns {number} */
function vendor(into, edition) {
  if (!isCheckoutRoot(BASE)) throw new Refused(`${BASE} is not the root of a beethoven-base checkout`);
  const status = git(BASE, ['status', '--porcelain', '--untracked-files=all']);
  if (!status.ok || status.out !== '') throw new Refused('the beethoven-base checkout has uncommitted or untracked files; a copy is of a commit');
  const { commit, ref } = releaseAtHead(BASE);
  if (!isEdition(edition)) throw new Refused(`--edition must be one of ${EDITIONS.join(', ')}`);
  const files = releaseFiles(BASE, commit, edition);

  const root = resolve(into);
  if (!isCheckoutRoot(root)) throw new Refused(`${root} is not the root of a git checkout`);
  if (samePath(root, BASE)) throw new Refused('refusing to copy beethoven-base into itself');
  const taking = { ref, commit, edition };

  /** @type {Origin | undefined} */
  let previous;
  const recordLink = linkOnPath(root, ORIGIN_PATH);
  if (recordLink) throw new Refused(`${recordLink}; a copy holds no link`);
  if (isFile(root, ORIGIN_PATH)) {
    try {
      previous = readOrigin(root, ORIGIN_PATH, { edition: true });
    } catch (e) {
      throw new Refused(`${ORIGIN_PATH} cannot be read (${e instanceof Error ? e.message : String(e)}); restore it from git first`);
    }
    if (previous.repository !== REPOSITORY) throw new Refused(`${ORIGIN_PATH} names ${previous.repository}, not ${REPOSITORY}`);
    notOlder(previous, taking, ORIGIN_PATH);
  }
  if (git(root, ['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main^{commit}']).ok) {
    if (git(root, ['cat-file', '-e', `refs/remotes/origin/main:${ORIGIN_PATH}`]).ok) {
      /** @type {Origin} */
      let theirs;
      try {
        theirs = parseOrigin(git(root, ['show', `refs/remotes/origin/main:${ORIGIN_PATH}`]).out, { edition: true });
      } catch (e) {
        throw new Refused(`origin/main's ${ORIGIN_PATH} cannot be read: ${e instanceof Error ? e.message : String(e)}`);
      }
      notOlder(theirs, taking, `origin/main's ${ORIGIN_PATH}`);
    }
  } else {
    console.log(`vendor: ${root} has no origin/main, so no release on main to compare with; if the edition has a remote, fetch it first`);
  }

  const { files: present, odd } = copyFiles(root, edition);
  if (odd.length > 0) throw new Refused(`the copy holds a link or something that is not a regular file: ${odd.join(', ')}`);
  for (const rel of files.keys()) {
    const reason = linkOnPath(root, rel);
    if (reason) throw new Refused(`${reason}; nothing is written through a link`);
  }
  preflight(root, { present, previous, targets: [...files.keys()], recordPath: ORIGIN_PATH, what: 'the copy' });

  /** @type {Map<string, string>} */
  const entries = new Map([...files].map(([rel, data]) => [rel, sha256(data)]));
  const record = renderOrigin({ repository: REPOSITORY, ref, commit, tree_sha256: treeDigest(entries), files: entries.size, edition, entries });
  try {
    for (const [rel, data] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) writeInside(root, rel, data);
    writeInside(root, ORIGIN_PATH, record);
  } catch (e) {
    // A link that appeared after the checks lands here too: something may already be written.
    console.error(`vendor: stopped part way (${e instanceof Error ? e.message : String(e)}); git status shows what was written`);
    return 3;
  }
  const modules = files.size - 1;
  console.log(`vendor: beethoven-base ${ref} (${commit.slice(0, 12)}) into ${root}: ${modules} module(s) in ${EDITION_ROOTS[edition]}/, ${CHECK_PATH} and ${ORIGIN_PATH}`);
  const gone = previous ? [...previous.entries.keys()].filter((p) => !files.has(p)).sort() : [];
  if (gone.length > 0) {
    printDropped('vendor', gone);
    return 1;
  }
  return 0;
}

/** @param {string} into @param {string} source @param {string} base @returns {number} */
function anchored(into, source, base) {
  if (!samePath(resolve(source), BASE)) {
    console.error(`check: --source ${resolve(source)} is not the checkout this command runs from (${BASE}); run the anchored check from that checkout, since a copy cannot vouch for itself`);
    return 1;
  }
  if (!isCheckoutRoot(BASE)) throw new Refused(`${BASE} is not the root of a beethoven-base checkout`);
  const root = resolve(into);
  if (!isCheckoutRoot(root)) throw new Refused(`${root} is not the root of a git checkout`);
  const { failures, notes, origin } = checkCopy(root, { base });
  if (origin) failures.push(...rebuilt(origin));
  for (const n of notes) console.log(`check: ${n}`);
  for (const f of failures) console.error(`check: ${f}`);
  if (failures.length > 0) {
    console.error(`check: ${failures.length} failure(s) in ${VENDOR_DIR}`);
    return 1;
  }
  const o = /** @type {Origin} */ (origin);
  console.log(`check: ${o.files} files match ORIGIN and the commit it names (beethoven-base ${o.ref}, ${o.commit.slice(0, 12)}, edition ${o.edition})`);
  return 0;
}

/** @param {Origin} origin @returns {string[]} how the record differs from the commit it names */
function rebuilt(origin) {
  if (!git(BASE, ['cat-file', '-e', `${origin.commit}^{commit}`]).ok) {
    return [`this checkout has no commit ${origin.commit.slice(0, 12)}; fetch it, or the ORIGIN is wrong`];
  }
  /** @type {string[]} */
  const failures = [];
  const tagged = git(BASE, ['rev-parse', '--verify', '--quiet', `refs/tags/${origin.ref}^{commit}`]).out.trim();
  if (tagged !== origin.commit) failures.push(`${origin.ref} in this checkout is ${tagged ? tagged.slice(0, 12) : 'missing'}, not ${origin.commit.slice(0, 12)}`);
  /** @type {Map<string, Buffer>} */
  let files;
  try {
    files = releaseFiles(BASE, origin.commit, /** @type {keyof typeof EDITION_ROOTS} */ (origin.edition));
  } catch (e) {
    return [...failures, e instanceof Error ? e.message : String(e)];
  }
  const expected = new Map([...files].map(([rel, data]) => [rel, sha256(data)]));
  for (const [rel, digest] of expected) {
    if (origin.entries.get(rel) !== digest) failures.push(`${rel} is not ${origin.commit.slice(0, 12)}'s ${rel === CHECK_PATH ? TEMPLATE : rel}`);
  }
  for (const rel of origin.entries.keys()) if (!expected.has(rel)) failures.push(`ORIGIN lists ${rel}, which ${origin.commit.slice(0, 12)} does not give the edition ${origin.edition}`);
  if (treeDigest(expected) !== origin.tree_sha256) failures.push(`ORIGIN's tree ${origin.tree_sha256.slice(0, 12)} is not the tree of ${origin.commit.slice(0, 12)} (${treeDigest(expected).slice(0, 12)})`);
  return failures;
}

/** @returns {number} */
function lists() {
  /** @type {string[]} */
  const failures = [];
  /** @type {string[]} */
  const counts = [];
  /** @type {string[]} */
  let names = [];
  try {
    names = readdirSync(join(BASE, 'editions')).sort();
  } catch {
    failures.push('editions/ is missing');
  }
  for (const n of names) if (!isEdition(n.replace(/\.json$/, '')) || !n.endsWith('.json')) failures.push(`editions/${n} names no edition (${EDITIONS.join(', ')})`);
  /** @param {string} m */
  const textOf = (m) => readFileSync(join(BASE, 'src', m), 'utf8');
  for (const edition of EDITIONS) {
    const listPath = `editions/${edition}.json`;
    try {
      if (!isFile(BASE, listPath)) throw new Refused(`${listPath} is missing`);
      const modules = parseList(readFileSync(join(BASE, listPath), 'utf8'), listPath);
      for (const m of modules) {
        let st;
        try {
          st = lstatSync(join(BASE, 'src', m));
        } catch {
          throw new Refused(`${listPath} names ${m}, and src/${m} is missing`);
        }
        if (!st.isFile()) throw new Refused(`src/${m} is a link or not a regular file`);
      }
      closed(modules, textOf, listPath);
      counts.push(`${edition} ${modules.length}`);
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      failures.push(e.message);
    }
  }
  if (!isFile(BASE, TEMPLATE)) failures.push(`${TEMPLATE} is missing`);
  for (const f of failures) console.error(`lists: ${f}`);
  if (failures.length > 0) return 1;
  console.log(`lists: modules per edition: ${counts.join(', ')}; each list is there, names modules that exist, and carries their imports`);
  return 0;
}

/** @param {string[]} argv @returns {number} */
function run(argv) {
  const [command, ...rest] = argv;
  try {
    if (command === 'vendor') {
      const f = flags(rest, ['into', 'edition']);
      if (!f.into || !f.edition) throw new Refused('usage: node tools/vendor.mjs vendor --into <edition checkout> --edition <name>');
      return vendor(f.into, f.edition);
    }
    if (command === 'check') {
      const f = flags(rest, ['into', 'source', 'base']);
      if (!f.into || !f.source) throw new Refused('usage: node tools/vendor.mjs check --into <edition checkout> --source <this checkout> [--base <branch>]');
      return anchored(f.into, f.source, f.base ?? (process.env.GITHUB_BASE_REF || 'main'));
    }
    if (command === 'lists' && rest.length === 0) return lists();
    throw new Refused('usage: node tools/vendor.mjs vendor|check|lists (see the top of tools/vendor.mjs)');
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    console.error(`${command === 'check' ? 'check' : command === 'lists' ? 'lists' : 'vendor'}: ${e.message}`);
    return 2;
  }
}

process.exitCode = run(process.argv.slice(2));
