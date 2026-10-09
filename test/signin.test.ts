// src/signin.ts against hpcworker's `contract` export, pinned in test/hpcworker/ (test data, never
// edited): the keys the verdict reads are held equal to rules.json, and every sign-in case hpcworker
// publishes beside its rule (the cases its own hpcw_claude_signin is tested against) is run through
// signinVerdict, as the printed text, pretty-printed as Claude Code prints it, with a line of noise
// around it, and parsed (the interface standard's rule 4). The rest pins what no case covers: values
// of the wrong type, JSON that is not an object, and the two places where base reads the contract's
// text more strictly than hpcw_claude_signin's patterns do.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SIGNIN_READ_KEYS, signinAnswered, signinVerdict, type SigninVerdict } from '../src/signin.js';
import { ROOT } from './origin.js';

interface Rules {
  subscription_signin: { read_keys: string[]; none: string; other: string; subscription: string };
  signin_cases: Array<{ input: string; verdict: SigninVerdict }>;
}
const rules = JSON.parse(readFileSync(join(ROOT, 'test', 'hpcworker', 'rules.json'), 'utf8')) as Rules;
const cases = rules.signin_cases;
const parsed = (text: string): unknown => (text.trim() === '' ? undefined : JSON.parse(text));

// a Claude subscription as Claude Code 2.1.289 prints it (hpcworker's test_adapters.py), and changes to it
const SUB = { loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', email: 'a@b.edu', subscriptionType: 'max' };
const both = (value: unknown): [SigninVerdict, SigninVerdict] => [signinVerdict(value), signinVerdict(JSON.stringify(value, null, 2))];

describe("the rule, against hpcworker's rules.json", () => {
  it('reads exactly the keys rules.json names, in its order', () => {
    expect([...SIGNIN_READ_KEYS]).toEqual(rules.subscription_signin.read_keys);
  });

  it("implements rules.json's three texts word for word, so a change of wording fails here until the module is read again", () => {
    // signin.ts's two stricter readings rest on this wording: "present" whatever the value (an
    // apiProvider of null or "" is present and not firstParty; apiKeySource's value is not read)
    expect(rules.subscription_signin.none).toBe('loggedIn is not true');
    expect(rules.subscription_signin.other).toBe(
      'loggedIn is true and apiKeySource is present (its value is not read), or authMethod is not claude.ai, or apiProvider is present and not firstParty',
    );
    expect(rules.subscription_signin.subscription).toBe('loggedIn is true, authMethod is claude.ai, apiProvider is firstParty or absent, and apiKeySource is absent');
  });

  it('gives every published case its verdict, read as the text it printed', () => {
    expect(cases.length).toBeGreaterThan(10);
    expect(new Set(cases.map((c) => c.verdict))).toEqual(new Set(['subscription', 'other', 'none']));
    for (const c of cases) expect(signinVerdict(c.input), c.input).toBe(c.verdict);
  });

  it('gives every published case the same verdict pretty-printed, as Claude Code prints it, and with lines of noise around it', () => {
    let read = 0;
    for (const c of cases) {
      const v = parsed(c.input);
      if (v === undefined) continue;
      read++;
      const pretty = JSON.stringify(v, null, 2);
      expect(signinVerdict(pretty), pretty).toBe(c.verdict);
      expect(signinVerdict(`${pretty}\n`), pretty).toBe(c.verdict);
      expect(signinVerdict(pretty.replace(/\n/g, '\r\n')), 'CRLF').toBe(c.verdict);
      expect(signinVerdict(`Warning: a newer version is available\n${pretty}\nbye\n`), 'noise').toBe(c.verdict);
    }
    expect(read).toBe(cases.filter((c) => c.input.trim() !== '').length);
    expect(read).toBeGreaterThanOrEqual(10);
  });

  it('gives every published case the same verdict once parsed, and the same again from its four read keys alone', () => {
    let read = 0;
    for (const c of cases) {
      const v = parsed(c.input);
      if (v === undefined) continue;
      read++;
      expect(signinVerdict(v), c.input).toBe(c.verdict);
      const four = Object.fromEntries(Object.entries(v as object).filter(([k]) => (SIGNIN_READ_KEYS as readonly string[]).includes(k)));
      expect(signinVerdict(four), c.input).toBe(c.verdict);
    }
    expect(read).toBe(cases.filter((c) => c.input.trim() !== '').length);
    expect(read).toBeGreaterThanOrEqual(10);
  });
});

describe('signinVerdict, beyond the published cases', () => {
  it('counts only loggedIn exactly true as signed in: a string "true", 1, null or no loggedIn is none', () => {
    for (const loggedIn of ['true', 1, 'yes', null, {}, [true]]) expect(both({ ...SUB, loggedIn }), JSON.stringify(loggedIn)).toEqual(['none', 'none']);
    const { loggedIn: _, ...rest } = SUB;
    expect(both(rest)).toEqual(['none', 'none']);
    expect(both({ ...SUB, loggedIn: false })).toEqual(['none', 'none']);
    expect(both(SUB)).toEqual(['subscription', 'subscription']);
    // a parsed answer's own loggedIn decides even where its text, printed again, finds a nested true first
    for (const loggedIn of [1, 'true', 'yes', [true]]) {
      const value = { loggedIn, x: { loggedIn: true }, authMethod: 'claude.ai' };
      expect(signinVerdict(JSON.stringify(value)), JSON.stringify(value)).toBe('subscription');
      expect(signinVerdict(value), JSON.stringify(value)).toBe('none');
    }
  });

  it('makes apiKeySource other by its presence alone, whatever its value: null, empty, false or a label', () => {
    for (const apiKeySource of [null, '', false, 0, '/login managed key', 'ANTHROPIC_API_KEY', {}]) {
      expect(both({ ...SUB, apiKeySource }), JSON.stringify(apiKeySource)).toEqual(['other', 'other']);
    }
  });

  it('never reads the value of apiKeySource', () => {
    const status: Record<string, unknown> = { ...SUB };
    Object.defineProperty(status, 'apiKeySource', {
      enumerable: true,
      get() {
        throw new Error('apiKeySource was read');
      },
    });
    expect(signinVerdict(status)).toBe('other');
  });

  it('wants authMethod to be the string claude.ai: absent, null, another case or a list holding it is other', () => {
    for (const authMethod of [null, '', 'Claude.ai', 'claude.ai ', ['claude.ai'], 'console', 'oauth_token']) {
      expect(both({ ...SUB, authMethod }), JSON.stringify(authMethod)).toEqual(['other', 'other']);
    }
    const { authMethod: _, ...rest } = SUB;
    expect(both(rest)).toEqual(['other', 'other']);
    // a parsed answer's own authMethod decides even where its text, printed again, finds a nested claude.ai first
    const value = { loggedIn: true, plan: { authMethod: 'claude.ai' }, authMethod: 'console' };
    expect(signinVerdict(JSON.stringify(value))).toBe('subscription');
    expect(signinVerdict(value)).toBe('other');
  });

  it('takes apiProvider absent or the string firstParty, and anything present but firstParty, null and empty included, as other', () => {
    const { apiProvider: _, ...rest } = SUB;
    expect(both(rest)).toEqual(['subscription', 'subscription']);
    for (const apiProvider of [null, '', 'bedrock', 'vertex', 'foundry', 'gateway', 'FirstParty', 1, ['firstParty']]) {
      expect(both({ ...SUB, apiProvider }), JSON.stringify(apiProvider)).toEqual(['other', 'other']);
    }
  });

  it('reads anything but a JSON object as no sign-in: arrays, null, numbers, strings, booleans and nothing', () => {
    for (const v of [[], [SUB], null, undefined, 0, 1, true, false]) expect(signinVerdict(v), JSON.stringify(v)).toBe('none');
    for (const text of ['', '\n', 'null', '[]', '42', 'true', '"loggedIn"', 'not signed in', 'Error: claude: command not found']) {
      expect(signinVerdict(text), text).toBe('none');
    }
  });

  it('reads the printed text as the worker does: keys found anywhere, the first loggedIn deciding, so an object inside a list counts', () => {
    // hpcw_claude_signin greps the whole output; a client that read it otherwise would disagree with the worker it starts
    expect(signinVerdict(`[${JSON.stringify(SUB)}]`)).toBe('subscription');
    expect(signinVerdict('{"loggedIn": false, "loggedIn": true, "authMethod": "claude.ai"}')).toBe('none');
    expect(signinVerdict('{"loggedIn":true,"authMethod":"claude.ai"}')).toBe('subscription');
    // the line breaks are dropped first (tr -d '\n'), so a value on the line after its key still counts
    expect(signinVerdict('{"loggedIn":\n  true,\n  "authMethod":\n  "claude.ai"}')).toBe('subscription');
    // its pattern allows spaces after the colon, never before it
    expect(signinVerdict('{"loggedIn" : true, "authMethod": "claude.ai"}')).toBe('none');
    expect(signinVerdict('{"loggedIn": true, "authMethod" : "claude.ai"}')).toBe('other');
    // and spaces only: grep's " *" finds no loggedIn or authMethod after a tab, so the worker says none
    // or other there (checked with grep -o on the same text), and so does this reader
    expect(signinVerdict('{"loggedIn":\ttrue, "authMethod": "claude.ai"}')).toBe('none');
    expect(signinVerdict('{"loggedIn": \t true, "authMethod": "claude.ai"}')).toBe('none');
    expect(signinVerdict('{"loggedIn": true, "authMethod":\t"claude.ai"}')).toBe('other');
    expect(signinVerdict('{"loggedIn": true, "authMethod": \r"claude.ai"}')).toBe('other');
  });

  it('is stricter than the worker where the contract says so: apiKeySource or apiProvider with space before the colon is still present', () => {
    expect(signinVerdict('{"loggedIn": true, "authMethod": "claude.ai", "apiKeySource" : "x"}')).toBe('other');
    expect(signinVerdict('{"loggedIn": true, "authMethod": "claude.ai", "apiProvider" : "firstParty"}')).toBe('other');
    expect(signinVerdict('{"loggedIn": true, "authMethod": "claude.ai", "apiProvider": null}')).toBe('other');
    // any white space before the colon, a tab or a carriage return as well as a space
    for (const gap of ['\t', '\r', ' \t ', '\r\n ']) {
      expect(signinVerdict(`{"loggedIn": true, "authMethod": "claude.ai", "apiKeySource"${gap}: "x"}`), JSON.stringify(gap)).toBe('other');
      expect(signinVerdict(`{"loggedIn": true, "authMethod": "claude.ai", "apiProvider"${gap}: "firstParty"}`), JSON.stringify(gap)).toBe('other');
    }
  });

  it('is stricter than both the worker and rules.json\'s words where the value of a present apiProvider is past white space the worker\'s pattern does not read: a tab after the colon makes even firstParty other', () => {
    // the worker's grep finds no apiProvider in '"apiProvider":\t"firstParty"' and counts it absent, a
    // subscription; rules.json's words would read firstParty, a subscription too; base sees the key
    // present and its value unread, and says other, so it never says subscription where it read no value
    for (const gap of ['\t', ' \t', '\t ', '\r']) {
      expect(signinVerdict(`{"loggedIn": true, "authMethod": "claude.ai", "apiProvider":${gap}"firstParty"}`), JSON.stringify(gap)).toBe('other');
    }
    // spaces alone are the worker's own reading, and firstParty after them is a subscription
    expect(signinVerdict('{"loggedIn": true, "authMethod": "claude.ai", "apiProvider":   "firstParty"}')).toBe('subscription');
  });

  it("reads only a parsed object's own keys, never one it inherits", () => {
    expect(signinVerdict(Object.create(SUB) as unknown)).toBe('none');
    expect(signinVerdict(Object.assign(Object.create({ apiKeySource: 'x' }) as object, SUB))).toBe('subscription');
  });

  it('gives a parsed answer the verdict of its text when a key is nested, as the worker greps the whole output', () => {
    // hpcw_claude_signin finds a key anywhere; a parsed answer read by its top-level keys alone would
    // say subscription where the worker says other or none
    const nested: Array<[Record<string, unknown>, SigninVerdict]> = [
      [{ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', organization: { apiKeySource: 'x' } }, 'other'],
      [{ loggedIn: true, authMethod: 'claude.ai', org: { apiKeySource: '/login managed key' } }, 'other'],
      [{ loggedIn: true, authMethod: 'claude.ai', account: { apiProvider: 'bedrock' } }, 'other'],
      [{ organization: { loggedIn: false }, loggedIn: true, authMethod: 'claude.ai' }, 'none'],
      [{ loggedIn: true, authMethod: 'claude.ai', list: [{ apiKeySource: null }] }, 'other'],
      [{ ...SUB, plan: { name: 'max', authMethod: 'claude.ai' } }, 'subscription'],
    ];
    for (const [value, verdict] of nested) {
      const text = JSON.stringify(value, null, 2);
      expect(signinVerdict(text), text).toBe(verdict);
      expect(signinVerdict(value), text).toBe(verdict);
      expect(signinVerdict(JSON.parse(text)), text).toBe(verdict);
    }
  });

  it('counts an own apiKeySource whose value text would drop (undefined) as present, and never says subscription where the text does not', () => {
    expect(signinVerdict({ ...SUB, apiKeySource: undefined })).toBe('other');
    expect(signinVerdict({ ...SUB, apiProvider: undefined, authMethod: 'claude.ai' })).toBe('other');
  });

  it('cannot see a repeated key once the text is parsed: JSON.parse keeps the last and the worker the first, so an edition passes the text', () => {
    const text = '{"loggedIn": false, "loggedIn": true, "authMethod": "claude.ai"}';
    expect(signinVerdict(text)).toBe('none');
    expect(signinVerdict(JSON.parse(text))).toBe('subscription');
  });

  it('reads a parsed answer that cannot be printed as no sign-in', () => {
    const loop: Record<string, unknown> = { ...SUB };
    loop.self = loop;
    expect(signinVerdict(loop)).toBe('none');
    expect(signinVerdict({ ...SUB, big: 1n })).toBe('none');
  });

  it('never gives a verdict outside subscription, other and none', () => {
    // (signinAnswered below tells an answer of none from no answer)
    const seen = new Set<string>();
    for (const v of [SUB, {}, null, '', 'x', [], { ...SUB, apiProvider: 'gateway' }]) seen.add(signinVerdict(v));
    expect([...seen].sort()).toEqual(['none', 'other', 'subscription']);
  });
});

describe('signinAnswered: whether there was an answer at all, which none alone does not say', () => {
  it('is true where the worker\'s reading finds a loggedIn of true or false, noise around it or not', () => {
    for (const text of ['{"loggedIn":false}', '{"loggedIn": true}', `note: update available\n${JSON.stringify(SUB, null, 2)}\nbye`, '{"loggedIn":\n false}']) {
      expect(signinAnswered(text), text).toBe(true);
    }
    expect(signinAnswered({ loggedIn: false })).toBe(true);
    expect(signinAnswered(SUB)).toBe(true);
  });

  it('is false for no text, an error, JSON without a loggedIn the pattern reads, and anything parsed that is not an object with a boolean loggedIn', () => {
    for (const text of ['', '\n', 'Error: something broke', 'claude: command not found', '{}', '{"loggedIn": "true"}', '{"loggedIn" : true}', 'null', '[]']) {
      expect(signinAnswered(text), JSON.stringify(text)).toBe(false);
    }
    for (const v of [undefined, null, {}, [], [SUB], { loggedIn: 'true' }, { loggedIn: 1 }, 'x'.length]) expect(signinAnswered(v), JSON.stringify(v)).toBe(false);
    // a loggedIn the object only inherits is no answer, as signinVerdict reads only own keys
    expect(signinAnswered(Object.create({ loggedIn: false }) as unknown)).toBe(false);
    expect(signinAnswered(Object.create(SUB) as unknown)).toBe(false);
  });

  it('is true wherever the verdict is subscription or other, over every published case and the cases above', () => {
    const inputs: unknown[] = [...cases.map((c) => c.input), ...cases.flatMap((c) => (c.input.trim() === '' ? [] : [parsed(c.input)])), SUB, { ...SUB, apiKeySource: 'x' }];
    let signedIn = 0;
    for (const v of inputs) {
      if (signinVerdict(v) === 'none') continue;
      signedIn++;
      expect(signinAnswered(v), JSON.stringify(v)).toBe(true);
    }
    expect(signedIn).toBeGreaterThan(5);
    // and a published none that holds loggedIn false is an answer: the verdict alone cannot tell
    expect(cases.some((c) => c.verdict === 'none' && signinAnswered(c.input))).toBe(true);
    expect(cases.some((c) => c.verdict === 'none' && !signinAnswered(c.input))).toBe(true);
  });
});
