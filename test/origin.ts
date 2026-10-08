// What this repository offers and takes, read from interface/INTERFACE.json, and the check that an
// import's folder is the pinned copy its ORIGIN records (the interface standard's rule 3). The boundary
// test runs it on every import, and on throwaway imports of its own, so the check is shown to refuse.
// Ported from beethoven-desktop's test/origin.ts, without its fetched-program form (base takes no
// program export), and with three refusals desktop's lacks: a link on the way to or inside the folder,
// an ORIGIN that lists no file, and an ORIGIN no import declares.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

export interface Import {
  repository: string;
  export: string;
  version: number;
  into: string;
  origin: string;
}

export interface Export {
  id: string;
  kind: string;
  version: number;
  summary: string;
  paths: string[];
  consumers: string[];
}

export interface Manifest {
  format: number;
  name: string;
  repository: string;
  summary: string;
  standard: string;
  exports: Export[];
  imports: Import[];
}

export function manifest(root = ROOT): Manifest {
  return JSON.parse(readFileSync(join(root, 'interface', 'INTERFACE.json'), 'utf8')) as Manifest;
}

/**
 * Where base takes an import: a folder of its own directly under test/, since what base takes is test
 * data its parsers are read against (hpcworker's contract into test/hpcworker, design step 9). Nothing
 * else of the repository (its root, interface/, src/, a dot folder) can then be written over by a pull;
 * interface/pull.sh refuses the same folders.
 */
export const INTO = /^test\/[a-z0-9][a-z0-9-]*$/;

const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const isLink = (p: string) => {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};

/** what is wrong with one import's folder against its ORIGIN, in words; empty when it is the pinned copy */
export function importProblems(imp: Import, root = ROOT): string[] {
  const out: string[] = [];
  const folder = join(root, imp.into);
  const originPath = join(root, imp.origin);
  // a link would make the copy whatever it points at, another checkout's file among them; the puller
  // writes only plain files into real folders, so a link here was made by hand
  const parts = imp.into.split('/');
  for (let k = 1; k <= parts.length; k++) {
    if (isLink(join(root, ...parts.slice(0, k)))) return [`${parts.slice(0, k).join('/')} is a link; an import is a real folder of this repository`];
  }
  if (isLink(originPath)) return [`${imp.origin} is a link; an import holds plain files only`];
  if (!existsSync(originPath)) return [`${imp.origin} is missing`];
  const lines = readFileSync(originPath, 'utf8').split('\n').filter(Boolean);
  if (lines[0] !== `repository ${imp.repository}`) out.push(`${imp.origin}'s first line is not "repository ${imp.repository}"`);
  if (!/^commit [0-9a-f]{40}$/.test(lines[1] ?? '')) out.push(`${imp.origin}'s second line is not a commit`);
  const recorded = new Map<string, string>();
  let exportLine = false;
  for (const l of lines.slice(2)) {
    let m: RegExpExecArray | null;
    if ((m = /^export (\S+) (\S+)$/.exec(l))) {
      exportLine = true;
      if (m[1] !== imp.export || m[2] !== String(imp.version)) out.push(`${imp.origin} records export ${m[1]} ${m[2]}, the import is ${imp.export} ${imp.version}`);
    } else if ((m = /^sha256 ([0-9a-f]{64}) (\S(?:.*\S)?)$/.exec(l))) {
      recorded.set(m[2]!, m[1]!);
    } else {
      out.push(`${imp.origin} has a line the standard does not know: ${l}`);
    }
  }
  // Every provider base will take publishes INTERFACE.json, so a copy of base's is never one taken
  // before its provider had one (the standard's only reason for a missing export line).
  if (!exportLine) out.push(`${imp.origin} names no export; take the copy again with interface/pull.sh`);
  // the puller refuses an export with no file, so an ORIGIN that lists none was trimmed by hand
  if (recorded.size === 0) out.push(`${imp.origin} lists no file; take the copy again with interface/pull.sh`);
  const present = new Map<string, string>();
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      const rel = relative(folder, p).split(sep).join('/');
      const st = lstatSync(p);
      if (st.isSymbolicLink()) out.push(`${imp.into}/${rel} is a link; an import holds plain files only`);
      else if (st.isDirectory()) walk(p);
      else present.set(rel, sha256(p));
    }
  };
  if (existsSync(folder)) walk(folder);
  // the folder's own files; a README.md the export itself carries is one of its files
  present.delete('ORIGIN');
  for (const own of ['README.md', 'pull.sh']) if (!recorded.has(own)) present.delete(own);
  for (const [f, h] of present) {
    if (!recorded.has(f)) out.push(`${imp.into}/${f} is not in ${imp.origin} (a pull lists a file the provider dropped for a person to remove)`);
    else if (recorded.get(f) !== h) out.push(`${imp.into}/${f} differs from ${imp.origin}: take a new copy with interface/pull.sh, never edit one by hand`);
  }
  for (const f of recorded.keys()) if (!present.has(f)) out.push(`${imp.into}/${f} is in ${imp.origin} but not in the folder`);
  return out;
}

/** every file named ORIGIN that is no import's record: a pinned copy interface/INTERFACE.json does not declare */
export function undeclaredOrigins(files: string[], m: Manifest): string[] {
  const declared = new Set(m.imports.map((i) => i.origin));
  return files
    .filter((f) => f.split('/').pop() === 'ORIGIN' && !declared.has(f))
    .map((f) => `${f} is a pinned copy interface/INTERFACE.json does not list as an import: add the import and take it with interface/pull.sh`);
}
