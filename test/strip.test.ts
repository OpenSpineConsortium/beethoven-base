// src/strip.ts against hpcworker's `contract` export, pinned in test/hpcworker/ (test data, never
// edited): the two lists typed in the module are held equal to rules.json, name by name and in order
// (the interface standard's rule 4), so a new pull that changes hpcworker's list fails here until the
// module follows it; and withoutCredentials takes away exactly those names, from a copy.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { credentialOverrides, CREDENTIAL_VARIABLES, REMOTE_CONTROL_VARIABLES, withoutCredentials } from '../src/strip.js';
import { ROOT } from './origin.js';

interface Rules {
  credential_variables: string[];
  remote_control_variables: { names: string[] };
}
const rules = JSON.parse(readFileSync(join(ROOT, 'test', 'hpcworker', 'rules.json'), 'utf8')) as Rules;
const source = readFileSync(join(ROOT, 'src', 'strip.ts'), 'utf8');

// an environment as a program inherits it: every listed name set, beside names that must pass
const KEPT = {
  PATH: '/usr/bin:/bin',
  HOME: '/home/ab1234',
  CLAUDE_CONFIG_DIR: '/home/ab1234/.beethoven/accounts/main/claude',
  // VS Code passes these three to the student's own tools on purpose (design section 6.4)
  GITHUB_TOKEN: 'g',
  GH_TOKEN: 'g',
  HF_TOKEN: 'h',
};
const full = (): Record<string, string> => ({
  ...KEPT,
  ...Object.fromEntries(CREDENTIAL_VARIABLES.map((n) => [n, 'set'])),
  ...Object.fromEntries(REMOTE_CONTROL_VARIABLES.map((n) => [n, '1'])),
});

describe("the lists, against hpcworker's rules.json", () => {
  it('CREDENTIAL_VARIABLES is rules.json credential_variables, name by name and in order', () => {
    expect(rules.credential_variables.length).toBeGreaterThanOrEqual(15);
    expect([...CREDENTIAL_VARIABLES]).toEqual(rules.credential_variables);
  });

  it('REMOTE_CONTROL_VARIABLES is rules.json remote_control_variables.names, name by name and in order', () => {
    expect(rules.remote_control_variables.names.length).toBeGreaterThan(0);
    expect([...REMOTE_CONTROL_VARIABLES]).toEqual(rules.remote_control_variables.names);
  });

  it('no name is on both lists, and none is a token a program passes on purpose', () => {
    expect(CREDENTIAL_VARIABLES.filter((n) => (REMOTE_CONTROL_VARIABLES as readonly string[]).includes(n))).toEqual([]);
    for (const n of ['GITHUB_TOKEN', 'GH_TOKEN', 'HF_TOKEN']) {
      expect((CREDENTIAL_VARIABLES as readonly string[]).includes(n), n).toBe(false);
      expect((REMOTE_CONTROL_VARIABLES as readonly string[]).includes(n), n).toBe(false);
    }
  });

  it("each name stands on a line of its own as 'NAME', (the one line posture lets a key's name take), and no other name does", () => {
    const lines = source.split('\n').filter((l) => /^\s*'[A-Z][A-Z0-9_]*',$/.test(l)).map((l) => l.trim());
    expect(lines).toEqual([...CREDENTIAL_VARIABLES, ...REMOTE_CONTROL_VARIABLES].map((n) => `'${n}',`));
  });
});

describe('withoutCredentials', () => {
  it('takes away every credential variable and keeps every other entry with its value', () => {
    const out = withoutCredentials(full());
    for (const n of CREDENTIAL_VARIABLES) expect(Object.hasOwn(out, n), n).toBe(false);
    expect(out).toEqual({ ...KEPT, ...Object.fromEntries(REMOTE_CONTROL_VARIABLES.map((n) => [n, '1'])) });
  });

  it('takes away the Remote Control switches too only when asked', () => {
    expect(withoutCredentials(full(), { remoteControl: true })).toEqual(KEPT);
    expect(withoutCredentials(full(), { remoteControl: false })).toEqual(withoutCredentials(full()));
  });

  it('passes GITHUB_TOKEN, GH_TOKEN and HF_TOKEN whatever the options', () => {
    for (const options of [{}, { remoteControl: true }, { anyCase: true }, { remoteControl: true, anyCase: true }]) {
      const out = withoutCredentials(full(), options);
      expect([out.GITHUB_TOKEN, out.GH_TOKEN, out.HF_TOKEN], JSON.stringify(options)).toEqual(['g', 'g', 'h']);
    }
  });

  it('never changes its argument and returns a new object', () => {
    const env = Object.freeze(full());
    const before = { ...env };
    const out = withoutCredentials(env, { remoteControl: true });
    expect(env).toEqual(before);
    expect(out).not.toBe(env);
    out.PATH = 'changed';
    expect(env.PATH).toBe('/usr/bin:/bin');
  });

  it('matches names exactly by default, as env -u does: another case, a longer name or a shorter one is another variable', () => {
    const others = {
      anthropic_api_key: 'a',
      Anthropic_Api_Key: 'b',
      ANTHROPIC_API_KEY_OLD: 'c',
      MY_ANTHROPIC_API_KEY: 'd',
      ANTHROPIC_API: 'e',
      disable_growthbook: 'f',
    };
    expect(withoutCredentials({ ...others, ANTHROPIC_API_KEY: 'x' }, { remoteControl: true })).toEqual(others);
  });

  it('with anyCase, takes away a listed name written in any case (one variable on Windows), and nothing longer or shorter', () => {
    const env = { anthropic_api_key: 'a', Claude_Code_Use_Bedrock: 'b', disable_growthbook: 'c', ANTHROPIC_API_KEY_OLD: 'd', anthropic_api: 'e', PATH: 'p' };
    expect(withoutCredentials(env, { anyCase: true })).toEqual({ disable_growthbook: 'c', ANTHROPIC_API_KEY_OLD: 'd', anthropic_api: 'e', PATH: 'p' });
    expect(withoutCredentials(env, { anyCase: true, remoteControl: true })).toEqual({ ANTHROPIC_API_KEY_OLD: 'd', anthropic_api: 'e', PATH: 'p' });
  });

  it('copies a key named __proto__ as a key, never as the prototype', () => {
    const env = JSON.parse('{"__proto__": {"polluted": "yes"}, "ANTHROPIC_AUTH_TOKEN": "t", "PATH": "p"}') as Record<string, unknown>;
    const out = withoutCredentials(env);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.hasOwn(out, '__proto__')).toBe(true);
    expect((out as { polluted?: unknown }).polluted).toBeUndefined();
    expect(Object.keys(out).sort()).toEqual(['PATH', '__proto__']);
  });

  it('keeps an entry whose value is undefined, as the environment object of a program may hold one', () => {
    const out = withoutCredentials({ PATH: 'p', EMPTY: undefined, CLAUDE_CODE_OAUTH_TOKEN: undefined });
    expect(Object.keys(out).sort()).toEqual(['EMPTY', 'PATH']);
  });
});

describe('credentialOverrides', () => {
  // VS Code's run() starts every child with { ...process.env, ...opts.env } (shell.ts:35 at e7526f9):
  // an environment handed to it as opts.env is merged over the inherited one, so a name taken away
  // from it is still inherited. What such a caller needs is each listed name set to undefined, which
  // Node leaves out of the child's environment, over what is inherited.
  const merged = (inherited: Record<string, string | undefined>, options = {}) => ({ ...inherited, ...credentialOverrides(inherited, options) });
  const live = (env: Record<string, string | undefined>) => Object.entries(env).filter(([, v]) => v !== undefined).map(([k]) => k);

  it('sets every listed name to undefined, so a merge over the inherited environment leaves none of them with a value', () => {
    const out = credentialOverrides();
    expect(Object.keys(out)).toEqual([...CREDENTIAL_VARIABLES]);
    for (const v of Object.values(out)) expect(v).toBeUndefined();
    expect(live(merged(full())).sort()).toEqual([...Object.keys(KEPT), ...REMOTE_CONTROL_VARIABLES].sort());
    // the shape withoutCredentials returns does not do this: merged over the inherited environment, every key survives
    const wrong = { ...full(), ...withoutCredentials(full()) };
    expect(CREDENTIAL_VARIABLES.filter((n) => wrong[n] !== undefined)).toEqual([...CREDENTIAL_VARIABLES]);
  });

  it('adds the Remote Control switches only when asked, and passes the tokens a program passes on purpose', () => {
    expect(Object.keys(credentialOverrides({}, { remoteControl: true }))).toEqual([...CREDENTIAL_VARIABLES, ...REMOTE_CONTROL_VARIABLES]);
    expect(live(merged(full(), { remoteControl: true })).sort()).toEqual(Object.keys(KEPT).sort());
  });

  it('with anyCase, also sets the inherited names written in another case, which would otherwise reach the child under the listed one on Windows', () => {
    const inherited = { anthropic_api_key: 'a', Claude_Code_Use_Bedrock: 'b', disable_growthbook: 'c', ANTHROPIC_API_KEY_OLD: 'd', PATH: 'p' };
    const out = credentialOverrides(inherited, { anyCase: true });
    expect(Object.keys(out).filter((k) => !(CREDENTIAL_VARIABLES as readonly string[]).includes(k))).toEqual(['anthropic_api_key', 'Claude_Code_Use_Bedrock']);
    expect(live(merged(inherited, { anyCase: true })).sort()).toEqual(['ANTHROPIC_API_KEY_OLD', 'PATH', 'disable_growthbook']);
    expect(live(merged(inherited, { anyCase: true, remoteControl: true })).sort()).toEqual(['ANTHROPIC_API_KEY_OLD', 'PATH']);
    // without anyCase a name in another case is another variable, as env -u reads it
    expect(live(merged(inherited)).sort()).toEqual(Object.keys(inherited).sort());
  });

  it('never changes its argument, never takes a prototype from it, and gives every value as undefined', () => {
    const inherited = Object.freeze(JSON.parse('{"__proto__": {"polluted": "yes"}, "anthropic_auth_token": "t", "PATH": "p"}') as Record<string, string>);
    const out = credentialOverrides(inherited, { anyCase: true });
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.hasOwn(out, '__proto__')).toBe(false);
    expect(Object.hasOwn(out, 'anthropic_auth_token')).toBe(true);
    for (const v of Object.values(out)) expect(v).toBeUndefined();
    expect(inherited.PATH).toBe('p');
  });
});
