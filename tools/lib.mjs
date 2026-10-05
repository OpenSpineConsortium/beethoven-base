// What vendor.mjs and pull-hpcworker.mjs share beyond the record itself (vendor/check.mjs): reading
// their arguments, refusing before the first write, and writing only inside a copy. Neither tool
// ever deletes: a file a new release dropped is printed with the line that removes it, for a
// person to run in a reviewed commit.
import { closeSync, lstatSync, mkdirSync, openSync, constants, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, readRel, removeLine, sha256 } from '../vendor/check.mjs';

/** A reason to write nothing, found before the first write. */
export class Refused extends Error {}

/**
 * `<command> --flag value ...`; every flag takes one value, unknown flags and repeats throw.
 * @param {string[]} args
 * @param {string[]} allowed flag names without the dashes
 * @returns {Record<string, string>}
 */
export function flags(args, allowed) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = /** @type {string} */ (args[i]);
    const name = a.startsWith('--') ? a.slice(2) : '';
    if (!allowed.includes(name)) throw new Refused(`unknown argument ${a}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Refused(`${a} needs a value`);
    if (name in out) throw new Refused(`${a} is given twice`);
    out[name] = value;
    i++;
  }
  return out;
}

/** @param {string} root @param {string} rel @returns {boolean} */
export function isFile(root, rel) {
  try {
    return lstatSync(join(root, ...rel.split('/'))).isFile();
  } catch {
    return false;
  }
}

/**
 * The paths (relative to `root`) that git tracks and whose bytes on disk are the ones HEAD holds.
 * Asked of git file by file and compared with HEAD's own blob (hashed through the filters `git add`
 * would apply), never with the index, so neither an ignore rule nor an index flag such as
 * --assume-unchanged can hide an edit (beethoven-qa's vendor, `_committed`).
 * @param {string} root
 * @param {string[]} paths
 * @returns {Set<string>}
 */
export function committedUnchanged(root, paths) {
  if (paths.length === 0) return new Set();
  const listed = git(root, ['--literal-pathspecs', 'ls-files', '-z', '--', ...paths]);
  const tracked = [...new Set(listed.out.split('\0'))].filter((p) => p !== '' && !p.includes('\n')).sort();
  if (tracked.length === 0 || !git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']).ok) return new Set();
  const onDisk = git(root, ['hash-object', '--stdin-paths'], { input: tracked.map((p) => `${p}\n`).join('') });
  const inHead = git(root, ['cat-file', '--batch-check=%(objectname)'], { input: tracked.map((p) => `HEAD:${p}\n`).join('') });
  if (!onDisk.ok || !inHead.ok) return new Set();
  const disk = onDisk.out.split('\n');
  const head = inHead.out.split('\n');
  return new Set(tracked.filter((_, i) => disk[i] !== undefined && disk[i] === head[i]));
}

/**
 * @typedef {import('../vendor/check.mjs').Origin} Origin
 */

/**
 * Every reason to write nothing, before the first write. A file in the copy that the record already
 * there does not list was added by hand or left over from an older release; it is never folded in.
 * A file to be replaced must be what its record says or what HEAD holds, so nothing is lost; the
 * record itself may be replaced when it is committed, or when every file it lists is on disk as it
 * says (then it is the record a tool wrote, and the commit it names can rebuild it).
 * @param {string} root
 * @param {{ present: string[], previous: Origin | undefined, targets: string[], recordPath: string, what: string }} copy
 */
export function preflight(root, copy) {
  const listed = copy.previous ? copy.previous.entries : new Map();
  const extra = copy.present.filter((p) => !listed.has(p));
  if (extra.length > 0) {
    throw new Refused(
      `${copy.what} holds files its ORIGIN does not list (added by hand, or left over from an older release): ${extra.join(', ')}. ` +
        `Remove them in a reviewed commit first: ${removeLine(extra)}`,
    );
  }
  const existing = [...copy.targets, copy.recordPath].filter((p) => isFile(root, p));
  const committed = committedUnchanged(root, existing);
  /** @param {string} p */
  const asRecorded = (p) => isFile(root, p) && listed.get(p) === sha256(readRel(root, p));
  const recordWhole = copy.previous !== undefined && copy.previous.entries.size === copy.previous.files && [...listed.keys()].every(asRecorded);
  for (const p of existing) {
    if (committed.has(p)) continue;
    if (p === copy.recordPath ? recordWhole : asRecorded(p)) continue;
    throw new Refused(`${p} has changes that neither its ORIGIN nor a commit holds; commit or restore it first`);
  }
}

/**
 * Writes one file below `root`, making folders as needed. Every folder on the way is checked as it is
 * reached and the file is opened without following a link (O_NOFOLLOW, where the platform has it; on
 * Windows the check just before the open is what stands), so nothing is written through a link.
 * @param {string} root
 * @param {string} rel forward slashes
 * @param {Buffer | string} data
 */
export function writeInside(root, rel, data) {
  const parts = rel.split('/');
  let dir = root;
  for (const [i, part] of parts.slice(0, -1).entries()) {
    dir = join(dir, part);
    let st;
    try {
      st = lstatSync(dir);
    } catch {
      mkdirSync(dir);
      st = lstatSync(dir);
    }
    if (st.isSymbolicLink() || !st.isDirectory()) throw new Refused(`${parts.slice(0, i + 1).join('/')} is a link or a file where a folder belongs`);
  }
  const target = join(dir, /** @type {string} */ (parts[parts.length - 1]));
  try {
    if (!lstatSync(target).isFile()) throw new Refused(`${rel} is a link or not a regular file`);
  } catch (e) {
    if (e instanceof Refused) throw e;
  }
  const nofollow = constants.O_NOFOLLOW ?? 0;
  const fd = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | nofollow, 0o644);
  try {
    writeFileSync(fd, data);
  } finally {
    closeSync(fd);
  }
}

/**
 * Prints what a new release dropped and the line that removes it; deletes nothing.
 * @param {string} tool
 * @param {string[]} gone
 */
export function printDropped(tool, gone) {
  console.log(`${tool}: the new release no longer has these files; nothing was deleted. Remove them in a reviewed`);
  console.log(`${' '.repeat(tool.length)}  commit (the line works whether or not git tracks them), then check again:`);
  console.log(`${' '.repeat(tool.length)}  ${removeLine(gone)}`);
}
