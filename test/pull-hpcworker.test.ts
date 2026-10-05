// tools/pull-hpcworker.mjs against a throwaway hpcworker with three commits (the two texts; then
// vectors; then one vector dropped), run from a throwaway base checkout that holds the tool.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitAll, git, makeBase, makeTmp, node, put, removeTmp, testEnv } from './fixtures.mjs';

let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = makeTmp();
  env = testEnv(tmp);
});
afterEach(() => removeTmp(tmp));

const sha = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const V11 = '# V11 contract\nHPCW-STEP done\n';
const V12 = '# V12 contract\nthe gate\n';

/** hpcworker at <tmp>/hpcworker, beside base at <tmp>/base, as the tool's default expects */
function setup(): { base: string; hpc: string; c1: string; c2: string; c3: string } {
  const base = makeBase(env, tmp, [{ tag: 'v0.0.1', files: { 'README.md': '# base\n' } }]);
  const hpc = join(tmp, 'hpcworker');
  mkdirSync(hpc);
  git(env, hpc, 'init', '-q', '-b', 'main');
  put(hpc, { 'docs/V11_CONTRACT.md': V11, 'docs/V12_CONTRACT.md': V12, 'docs/OTHER.md': 'not taken\n', 'framework/VERSION': '17\n' });
  const c1 = commitAll(env, hpc, 'texts');
  put(hpc, { 'docs/contract/vectors/steps.json': '["HPCW-STEP done"]\n', 'docs/contract/vectors/status/r1.json': '{"v":1}\n' });
  const c2 = commitAll(env, hpc, 'vectors');
  put(hpc, { 'docs/contract/vectors/status/r1.json': null });
  const c3 = commitAll(env, hpc, 'one vector dropped');
  return { base, hpc, c1, c2, c3 };
}
const pull = (base: string, ...args: string[]) => node(env, base, join(base, 'tools', 'pull-hpcworker.mjs'), ...args);
const pinned = (base: string, rel: string) => readFileSync(join(base, 'test', 'hpcworker', ...rel.split('/')));

describe('pull-hpcworker', () => {
  it('pins the two texts at a named commit, from ../hpcworker by default, with an ORIGIN that check accepts', () => {
    const { base, c1 } = setup();
    const r = pull(base, '--ref', c1);
    expect(r.out).toContain('the two contract texts and 0 vector file(s)');
    expect(r.status).toBe(0);
    expect(pinned(base, 'V11_CONTRACT.md').toString()).toBe(V11);
    expect(pinned(base, 'V12_CONTRACT.md').toString()).toBe(V12);
    expect(existsSync(join(base, 'test', 'hpcworker', 'OTHER.md'))).toBe(false);
    const entries: Array<[string, string]> = [
      ['V11_CONTRACT.md', sha(V11)],
      ['V12_CONTRACT.md', sha(V12)],
    ];
    expect(pinned(base, 'ORIGIN').toString()).toBe(
      [
        'repository: OpenSpineConsortium/hpcworker',
        `ref: ${c1}`,
        `commit: ${c1}`,
        `tree_sha256: ${sha(entries.map(([p, d]) => `${p}\0${d}\n`).join(''))}`,
        'files: 2',
        ...entries.map(([p, d]) => `file: ${p} ${d}`),
        '',
      ].join('\n'),
    );
    expect(pull(base, 'check').status).toBe(0);
    const anchored = pull(base, 'check', '--from', join(tmp, 'hpcworker'));
    expect(anchored.out).toContain('and the commit it names');
    expect(anchored.status).toBe(0);
  });

  it("reads the commit's objects, never hpcworker's working tree", () => {
    const { base, hpc } = setup();
    put(hpc, { 'docs/V11_CONTRACT.md': 'an edit nobody committed\n' });
    expect(pull(base, '--ref', 'main', '--from', hpc).status).toBe(0);
    expect(pinned(base, 'V11_CONTRACT.md').toString()).toBe(V11);
    expect(pinned(base, 'ORIGIN').toString()).toContain('ref: main\n');
  });

  it('takes the vectors when the commit has them, and prints a vector a later commit dropped without deleting it', () => {
    const { base, hpc, c2, c3 } = setup();
    expect(pull(base, '--ref', c2, '--from', hpc).out).toContain('2 vector file(s)');
    expect(pinned(base, 'vectors/status/r1.json').toString()).toBe('{"v":1}\n');
    commitAll(env, base, 'pin hpcworker');

    const r = pull(base, '--ref', c3, '--from', hpc);
    expect(r.status).toBe(1);
    expect(r.out).toContain('nothing was deleted');
    expect(r.out).toContain('rm -- test/hpcworker/vectors/status/r1.json && git rm -q --cached --ignore-unmatch -- test/hpcworker/vectors/status/r1.json');
    expect(existsSync(join(base, 'test', 'hpcworker', 'vectors', 'status', 'r1.json'))).toBe(true);
    const c = pull(base, 'check');
    expect(c.status).toBe(1);
    expect(c.out).toContain('test/hpcworker holds files ORIGIN does not list: test/hpcworker/vectors/status/r1.json');
  });

  it('refuses a ref the checkout does not have, with nothing written', () => {
    const { base, hpc } = setup();
    const r = pull(base, '--ref', 'no-such-branch', '--from', hpc);
    expect(r.status).toBe(2);
    expect(r.out).toContain('has no no-such-branch; fetch it there first');
    expect(existsSync(join(base, 'test'))).toBe(false);
  });

  it('refuses a checkout that is not hpcworker, and a file added by hand to the pin', () => {
    const { base, hpc, c1 } = setup();
    const notHpc = pull(base, '--ref', 'main', '--from', base);
    expect(notHpc.status).toBe(2);
    expect(notHpc.out).toContain('is ' + base + ' hpcworker?');
    expect(pull(base, '--ref', c1, '--from', hpc).status).toBe(0);
    put(base, { 'test/hpcworker/mine.json': '{}\n' });
    const r = pull(base, '--ref', c1, '--from', hpc);
    expect(r.status).toBe(2);
    expect(r.out).toContain('does not list');
    expect(r.out).toContain('test/hpcworker/mine.json');
  });

  it('check fails on a pinned file that differs, and says when nothing is pinned', () => {
    const { base, hpc, c1 } = setup();
    const none = pull(base, 'check');
    expect(none.status).toBe(1);
    expect(none.out).toContain('nothing is pinned at test/hpcworker yet');
    expect(pull(base, '--ref', c1, '--from', hpc).status).toBe(0);
    put(base, { 'test/hpcworker/V12_CONTRACT.md': 'edited\n' });
    const r = pull(base, 'check');
    expect(r.status).toBe(1);
    expect(r.out).toContain('test/hpcworker/V12_CONTRACT.md differs from ORIGIN');
  });
});
