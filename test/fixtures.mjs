// Throwaway folders for the tests of the tools: each is made under the system's temporary folder, and
// each test removes only the folder it made.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** this checkout's root */
export const BASE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = 'beethoven-base-test-';

/** @returns {string} a new folder of the test's own */
export function makeTmp() {
  return mkdtempSync(join(tmpdir(), PREFIX));
}

/** @param {string} dir removes a folder makeTmp made, and refuses anything else */
export function removeTmp(dir) {
  if (!basename(dir).startsWith(PREFIX) || resolve(dirname(dir)) !== resolve(tmpdir())) throw new Error(`refusing to remove ${dir}: not a test's own folder`);
  // retries: on Windows a scanner or git's own process can hold a file for a moment
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

/**
 * The environment every test's git and every tool runs with: no variable that names a repository
 * (a pre-push hook hands the gate GIT_DIR, and a git that inherits it acts on this checkout whatever
 * -C names; beethoven-qa measured that), no configuration from the person or the system (a
 * gpgSign or an autocrlf there would change what the tests see), and a fixed identity.
 * @param {string} tmp
 * @returns {NodeJS.ProcessEnv}
 */
export function testEnv(tmp) {
  const listed = spawnSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).stdout ?? '';
  const drop = new Set(listed.split(/\s+/).filter(Boolean));
  /** @type {NodeJS.ProcessEnv} */
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!drop.has(k) && !k.startsWith('GIT_CONFIG_')) env[k] = v;
  const config = join(tmp, 'gitconfig');
  writeFileSync(config, '');
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: config,
    GIT_AUTHOR_NAME: 'Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  };
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} cwd
 * @param {...string} args
 * @returns {string} what git printed; throws when it fails
 */
export function git(env, cwd, ...args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd} failed: ${r.stderr}`);
  return r.stdout;
}

/**
 * Runs a Node script as a person would, and returns its exit status and everything it printed.
 * @param {NodeJS.ProcessEnv} env
 * @param {string} cwd
 * @param {string} script
 * @param {...string} args
 * @returns {{ status: number | null, out: string }}
 */
export function node(env, cwd, script, ...args) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/**
 * Writes files below root (forward-slash paths).
 * @param {string} root
 * @param {Record<string, string>} files
 */
export function put(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const full = join(root, ...rel.split('/'));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
}
