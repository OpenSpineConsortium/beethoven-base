// Pins hpcworker's contract texts and vectors as base's test data (design sections 5 and 6.1).
// hpcworker stays canonical for everything it writes; base's tests parse what its real writer made.
//
//   node tools/pull-hpcworker.mjs --ref <ref> [--from <hpcworker checkout>]
//   node tools/pull-hpcworker.mjs check [--from <hpcworker checkout>]
//
// The first form copies docs/V11_CONTRACT.md, docs/V12_CONTRACT.md and, when the commit has it,
// docs/contract/vectors/ at <ref> into test/hpcworker/ (as V11_CONTRACT.md, V12_CONTRACT.md and
// vectors/), and writes test/hpcworker/ORIGIN last, in the record format of vendor/check.mjs with no
// edition line. It reads the commit's own objects in a local checkout (default: ../hpcworker beside
// this one), never that checkout's working tree, and has no network code of its own and no token:
// fetch there first, with your own sign-in. Like vendor.mjs it writes only inside test/hpcworker,
// never through a link, refuses a file there that its ORIGIN does not list and a file whose changes
// neither the ORIGIN nor a commit holds, and never deletes: a file the new commit no longer has is
// printed with the line that removes it.
//
// check compares test/hpcworker with its ORIGIN, and with --from also with the commit it names.
// The pin is test data and never reaches an edition. Exit codes as vendor.mjs: 0, 1 (written, files
// of the older pin remain), 2 (refused, nothing written), 3 (stopped part way).
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  git,
  gitBytes,
  isCheckoutRoot,
  linkOnPath,
  readOrigin,
  readRel,
  renderOrigin,
  safeRelPath,
  sha256,
  treeDigest,
  walk,
} from '../vendor/check.mjs';
import { Refused, flags, isFile, preflight, printDropped, writeInside } from './lib.mjs';

/** @typedef {import('../vendor/check.mjs').Origin} Origin */

const BASE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY = 'OpenSpineConsortium/hpcworker';
const DEST = 'test/hpcworker';
const RECORD = `${DEST}/ORIGIN`;
/** what is taken, by its path in hpcworker, and where it lands below test/hpcworker */
const TEXTS = { 'docs/V11_CONTRACT.md': 'V11_CONTRACT.md', 'docs/V12_CONTRACT.md': 'V12_CONTRACT.md' };
const VECTORS = 'docs/contract/vectors';

/**
 * The files of the pin at `commit`, by their path below test/hpcworker, read from git's objects.
 * @param {string} from
 * @param {string} commit
 * @returns {Map<string, Buffer>}
 */
function pinFiles(from, commit) {
  const listing = gitBytes(from, ['ls-tree', '-r', '-z', '--full-tree', commit, '--', ...Object.keys(TEXTS), VECTORS]);
  if (listing === undefined) throw new Refused(`git cannot list ${commit.slice(0, 12)} in ${from}`);
  /** @type {Map<string, Buffer>} */
  const files = new Map();
  for (const item of listing.toString('utf8').split('\0')) {
    if (!item) continue;
    const tab = item.indexOf('\t');
    const [mode, kind, oid] = item.slice(0, tab).split(' ');
    const path = item.slice(tab + 1);
    const rel = path in TEXTS ? TEXTS[/** @type {keyof typeof TEXTS} */ (path)] : `vectors/${path.slice(VECTORS.length + 1)}`;
    if (kind !== 'blob' || (mode !== '100644' && mode !== '100755')) throw new Refused(`${path} is a ${mode} ${kind} at ${commit.slice(0, 12)}; the pin holds plain files only`);
    if (!safeRelPath(rel) || /\s/.test(rel) || rel === 'ORIGIN') throw new Refused(`refusing the file name ${JSON.stringify(path)}`);
    const data = gitBytes(from, ['cat-file', 'blob', /** @type {string} */ (oid)]);
    if (data === undefined) throw new Refused(`git cannot read ${path} at ${commit.slice(0, 12)}`);
    files.set(rel, data);
  }
  for (const [path, rel] of Object.entries(TEXTS)) if (!files.has(rel)) throw new Refused(`${commit.slice(0, 12)} has no ${path}; is ${from} hpcworker?`);
  return files;
}

/** @param {string | undefined} given @returns {string} */
function sourceOf(given) {
  const from = given ? resolve(given) : resolve(BASE, '..', 'hpcworker');
  if (!isCheckoutRoot(from)) throw new Refused(`${from} is not the root of a git checkout; name hpcworker's with --from`);
  return from;
}

/** @returns {{ present: string[], previous: Origin | undefined }} */
function existing() {
  const reason = linkOnPath(BASE, RECORD);
  if (reason) throw new Refused(`${reason}; the pin holds no link`);
  const { files, odd } = walk(BASE, DEST);
  if (odd.length > 0) throw new Refused(`${DEST} holds a link or something that is not a regular file: ${odd.join(', ')}`);
  /** @type {Origin | undefined} */
  let previous;
  if (isFile(BASE, RECORD)) {
    try {
      previous = readOrigin(BASE, RECORD, { edition: false });
    } catch (e) {
      throw new Refused(`${RECORD} cannot be read (${e instanceof Error ? e.message : String(e)}); restore it from git first`);
    }
    // the record lists paths below test/hpcworker; the walk gives them from the repository root
    previous = { ...previous, entries: new Map([...previous.entries].map(([p, d]) => [`${DEST}/${p}`, d])) };
  }
  return { present: files.filter((f) => f !== RECORD), previous };
}

/** @param {string | undefined} fromFlag @param {string} ref @returns {number} */
function pull(fromFlag, ref) {
  if (!/^[A-Za-z0-9._/@^~-]+$/.test(ref) || ref.startsWith('-')) throw new Refused(`--ref ${ref} is not a ref name or commit`);
  const from = sourceOf(fromFlag);
  const commit = git(from, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).out.trim();
  if (!commit) throw new Refused(`${from} has no ${ref}; fetch it there first (this tool has no network of its own)`);
  const files = pinFiles(from, commit);
  const { present, previous } = existing();
  const targets = [...files.keys()].map((rel) => `${DEST}/${rel}`);
  for (const rel of targets) {
    const reason = linkOnPath(BASE, rel);
    if (reason) throw new Refused(`${reason}; nothing is written through a link`);
  }
  preflight(BASE, { present, previous, targets, recordPath: RECORD, what: DEST });
  const entries = new Map([...files].map(([rel, data]) => [rel, sha256(data)]));
  const record = renderOrigin({ repository: REPOSITORY, ref, commit, tree_sha256: treeDigest(entries), files: entries.size, entries });
  try {
    for (const [rel, data] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) writeInside(BASE, `${DEST}/${rel}`, data);
    writeInside(BASE, RECORD, record);
  } catch (e) {
    console.error(`pull-hpcworker: stopped part way (${e instanceof Error ? e.message : String(e)}); git status shows what was written`);
    return 3;
  }
  const vectors = [...files.keys()].filter((r) => r.startsWith('vectors/')).length;
  console.log(`pull-hpcworker: hpcworker ${ref} (${commit.slice(0, 12)}) into ${DEST}: the two contract texts and ${vectors} vector file(s)`);
  const gone = previous ? [...previous.entries.keys()].filter((p) => !targets.includes(p)).sort() : [];
  if (gone.length > 0) {
    printDropped('pull-hpcworker', gone);
    return 1;
  }
  return 0;
}

/** @param {string | undefined} fromFlag @returns {number} */
function check(fromFlag) {
  if (!isFile(BASE, RECORD) && !linkOnPath(BASE, RECORD)) {
    console.error(`pull-hpcworker: nothing is pinned at ${DEST} yet (node tools/pull-hpcworker.mjs --ref <ref>)`);
    return 1;
  }
  /** @type {string[]} */
  const failures = [];
  const { present, previous } = existing();
  const origin = /** @type {Origin} */ (previous);
  if (origin.repository !== REPOSITORY) failures.push(`ORIGIN names ${origin.repository}, not ${REPOSITORY}`);
  const own = new Map([...origin.entries].map(([p, d]) => [p.slice(DEST.length + 1), d]));
  if (own.size !== origin.files || treeDigest(own) !== origin.tree_sha256) failures.push("ORIGIN's files and tree_sha256 are not those of its own file lines");
  for (const [path, digest] of origin.entries) {
    if (!present.includes(path)) failures.push(`${path} is listed in ORIGIN and missing`);
    else if (sha256(readRel(BASE, path)) !== digest) failures.push(`${path} differs from ORIGIN`);
  }
  const extra = present.filter((p) => !origin.entries.has(p));
  if (extra.length > 0) failures.push(`${DEST} holds files ORIGIN does not list: ${extra.join(', ')}`);
  if (fromFlag !== undefined) {
    const from = sourceOf(fromFlag);
    if (!git(from, ['cat-file', '-e', `${origin.commit}^{commit}`]).ok) failures.push(`${from} has no commit ${origin.commit.slice(0, 12)}; fetch it`);
    else {
      const expected = new Map([...pinFiles(from, origin.commit)].map(([rel, data]) => [rel, sha256(data)]));
      if (treeDigest(expected) !== origin.tree_sha256 || expected.size !== origin.files) {
        failures.push(`ORIGIN's tree is not the tree of ${origin.commit.slice(0, 12)} in ${from}`);
      }
    }
  }
  for (const f of failures) console.error(`pull-hpcworker: ${f}`);
  if (failures.length > 0) return 1;
  console.log(`pull-hpcworker: ${DEST} matches its ORIGIN (hpcworker ${origin.ref}, ${origin.commit.slice(0, 12)}, ${origin.files} files)${fromFlag !== undefined ? ' and the commit it names' : ''}`);
  return 0;
}

/** @param {string[]} argv @returns {number} */
function run(argv) {
  try {
    if (argv[0] === 'check') return check(flags(argv.slice(1), ['from']).from);
    const f = flags(argv, ['ref', 'from']);
    if (!f.ref) throw new Refused('usage: node tools/pull-hpcworker.mjs --ref <ref> [--from <hpcworker checkout>] | check [--from <hpcworker checkout>]');
    return pull(f.from, f.ref);
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    console.error(`pull-hpcworker: ${e.message}`);
    return 2;
  }
}

process.exitCode = run(process.argv.slice(2));
