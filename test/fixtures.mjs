// Throwaway git repositories for the tests: a beethoven-base with the real tools and template and a
// tag per release, an edition with a bare origin, an hpcworker. Each is made in a folder of its own
// under the system's temporary folder, and each test removes only the folder it made. Plain Node 18,
// no dependency, so the Node 18 lane can use it without npm ci.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
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
 * gpgSign or an autocrlf there would change what the tests see), a fixed identity, and no
 * GITHUB_BASE_REF, so check.mjs's base branch is main unless a test says otherwise.
 * @param {string} tmp
 * @returns {NodeJS.ProcessEnv}
 */
export function testEnv(tmp) {
  const listed = spawnSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).stdout ?? '';
  const drop = new Set(listed.split(/\s+/).filter(Boolean));
  /** @type {NodeJS.ProcessEnv} */
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!drop.has(k) && !k.startsWith('GIT_CONFIG_') && k !== 'GITHUB_BASE_REF') env[k] = v;
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
 * Writes files below root (forward-slash paths); null removes one.
 * @param {string} root
 * @param {Record<string, string | null>} files
 */
export function put(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const full = join(root, ...rel.split('/'));
    if (text === null) {
      unlinkSync(full);
      continue;
    }
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
}

/** @param {NodeJS.ProcessEnv} env @param {string} repo @param {string} message @returns {string} the new commit */
export function commitAll(env, repo, message) {
  git(env, repo, 'add', '-A');
  git(env, repo, 'commit', '-q', '--allow-empty', '-m', message);
  return git(env, repo, 'rev-parse', 'HEAD').trim();
}

/**
 * A beethoven-base checkout holding this checkout's tools and template, with one commit and tag per
 * release; HEAD is left at the last one.
 * @param {NodeJS.ProcessEnv} env
 * @param {string} tmp
 * @param {Array<{ tag: string, files: Record<string, string | null> }>} releases
 * @returns {string}
 */
export function makeBase(env, tmp, releases) {
  const repo = join(tmp, 'base');
  mkdirSync(repo);
  git(env, repo, 'init', '-q', '-b', 'main');
  for (const rel of ['tools/vendor.mjs', 'tools/lib.mjs', 'tools/pull-hpcworker.mjs', 'vendor/check.mjs']) {
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    copyFileSync(join(BASE, rel), join(repo, rel));
  }
  for (const r of releases) {
    put(repo, r.files);
    commitAll(env, repo, `release ${r.tag}`);
    git(env, repo, 'tag', r.tag);
  }
  return repo;
}

/**
 * An edition checkout with a bare origin, its first commit pushed to origin/main.
 * @param {NodeJS.ProcessEnv} env
 * @param {string} tmp
 * @returns {string}
 */
export function makeEdition(env, tmp) {
  const origin = join(tmp, 'edition-origin.git');
  const repo = join(tmp, 'edition');
  mkdirSync(origin);
  mkdirSync(repo);
  git(env, origin, 'init', '-q', '--bare', '-b', 'main');
  git(env, repo, 'init', '-q', '-b', 'main');
  put(repo, { 'README.md': '# an edition\n' });
  commitAll(env, repo, 'the edition');
  git(env, repo, 'remote', 'add', 'origin', origin);
  git(env, repo, 'push', '-q', 'origin', 'main');
  return repo;
}

/** two modules, one importing the other, as pull request #2's will */
export const MODULES = {
  'src/links.ts': "export const LINK = /^https:\\/\\/claude\\.ai\\/code$/;\n",
  'src/steps.ts': "import { LINK } from './links.js';\nexport function linked(s: string): boolean {\n  return LINK.test(s);\n}\n",
};

/**
 * Two releases: v1.0.0 gives desktop both modules; v2.0.0 changes links.ts and drops steps.ts from
 * desktop's list (the browser takes links.ts alone in both, VS Code nothing).
 * @param {NodeJS.ProcessEnv} env
 * @param {string} tmp
 * @returns {string}
 */
export function twoReleases(env, tmp) {
  return makeBase(env, tmp, [
    {
      tag: 'v1.0.0',
      files: {
        ...MODULES,
        'editions/desktop.json': '{ "modules": ["links.ts", "steps.ts"] }\n',
        'editions/browser.json': '{ "modules": ["links.ts"] }\n',
        'editions/vscode.json': '{ "modules": [] }\n',
      },
    },
    {
      tag: 'v2.0.0',
      files: {
        'src/links.ts': "export const LINK = /^https:\\/\\/claude\\.(?:ai|com)\\/code$/;\n",
        'editions/desktop.json': '{ "modules": ["links.ts"] }\n',
      },
    },
  ]);
}
