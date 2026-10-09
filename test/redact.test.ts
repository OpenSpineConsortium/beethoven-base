// src/redact.ts: the rules the editions hold today are kept exactly (beethoven-desktop 9ce98bb's
// src/redact.ts, whose RULES are the browser's ae11a00 extension/src/core/redact.ts and whose
// CREDENTIAL_RULES are VS Code's e7526f9 extension/src/core/redact.ts, copied below as the record of
// what was taken); the three new token rules take their shape at its real length inside other text and
// leave a word that only begins the same way; every string hpcworker's real writer printed (its
// `contract` export's vectors, which hold no secret) comes through unchanged; and every rule runs in
// time linear in its input, timed on 200 KB of text built against it. No token-shaped literal stands
// in this file: each sample is put together when the test runs.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREDENTIAL_REDACTIONS, redact, redactCredentials, REDACTIONS } from '../src/redact.js';
import { ROOT } from './origin.js';

type Rule = readonly [RegExp, string];
const view = (rules: ReadonlyArray<Rule>) => rules.map(([re, rep]) => [re.source, re.flags, rep]);

// beethoven-desktop 9ce98bb src/redact.ts, RULES and CREDENTIAL_RULES, as they were taken
const DESKTOP_RULES: Rule[] = [
  [/(csrf=)[^&\s"']+/gi, '$1[redacted]'],
  [/ASHLEY(?:REV)?1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[signed-token]'],
  [/BEETHOVEN(?:REV)?1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[signed-token]'],
  [/sk-ant-[A-Za-z0-9_-]+/g, '[redacted]'],
  [/\b(Bearer)\s+\S+/g, '$1 [redacted]'],
  [/\b(token|secret|password|passwd|api[_-]?key|authorization)(\s*[=:]\s*)\S+/gi, '$1$2[redacted]'],
  [/[A-Za-z0-9_-]{40,}/g, '[redacted]'],
];
const DESKTOP_CREDENTIAL_RULES: Rule[] = [
  [/sk-ant-[A-Za-z0-9_-]+/g, '[redacted]'],
  [/ASHLEY(?:REV)?1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[signed-token]'],
  [/BEETHOVEN(?:REV)?1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[signed-token]'],
  [/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/g, '$1 [redacted]'],
  [/("(?:accessToken|refreshToken|access_token|refresh_token|id_token|apiKey|api_key|client_secret|password)"\s*:\s*)"[^"]*"/g, '$1"[redacted]"'],
  [/\b((?:ANTHROPIC|CLAUDE_CODE)_[A-Z_]*(?:KEY|TOKEN)\s*[=:]\s*)\S+/g, '$1[redacted]'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[private key redacted]'],
];
// the three credential shapes of CREDENTIAL_RULES that RULES lacked, which REDACTIONS takes too, after
// the three token rules and before Bearer, so redact never leaves what redactCredentials takes
const CREDENTIAL_SHAPES: Rule[] = DESKTOP_CREDENTIAL_RULES.filter(([re]) => /accessToken|ANTHROPIC|PRIVATE KEY/.test(re.source));
// the three rules this module adds to both sets, each placed before the first general rule (Bearer)
const NEW_RULES: Rule[] = [
  [/\bhf_[A-Za-z0-9]{34,}/g, '[redacted]'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}/g, '[redacted]'],
  [/\bgithub_pat_[A-Za-z0-9_]{82,}/g, '[redacted]'],
];
// three more, added to both sets beside the rule each widens (review round 2): a JSON field named token
// or secret after the JSON credential field; an ANTHROPIC_ or CLAUDE_CODE_ key or token variable as a
// quoted JSON key (settings.json's env block, .mcp.json) after the variable rule; and HTTP Basic after
// an Authorization header, just before Bearer. The JSON values are read past an escaped quote
const JSON_TOKEN_FIELD: Rule = [/("(?:token|secret)"\s*:\s*)"(?:[^"\\]|\\[\s\S])*"/g, '$1"[redacted]"'];
const JSON_KEY_VARIABLE: Rule = [/("(?:ANTHROPIC|CLAUDE_CODE)_[A-Z_]*(?:KEY|TOKEN)"\s*:\s*)"(?:[^"\\]|\\[\s\S])*"/g, '$1"[redacted]"'];
const BASIC: Rule = [/\b(authorization\s*[=:]\s*Basic)\s+[A-Za-z0-9+/=]+/gi, '$1 [redacted]'];
/** a list with each round-2 rule placed after the rule its source names (BASIC before Bearer) */
const withRound2 = (rules: ReadonlyArray<Rule>): Rule[] =>
  rules.flatMap((r): Rule[] => {
    if (r[0].source.includes('accessToken')) return [r, JSON_TOKEN_FIELD];
    if (r[0].source.startsWith('\\b((?:ANTHROPIC')) return [r, JSON_KEY_VARIABLE];
    if (r[0].source.includes('Bearer')) return [BASIC, r];
    return [r];
  });
// four rules review round 3 widened in place, in each set that holds them, each paired with the rule it
// replaces: the JSON credential field reads its value past an escaped quote, as the round-2 JSON rules
// do; the key or token variable, bare and as a quoted JSON key, also takes AWS_BEARER_TOKEN_BEDROCK (a
// Bedrock API key, which runs Claude Code on Bedrock) and a name in any case (on Windows another case
// is the same variable); Bearer takes the scheme in any case, as HTTP reads it; and REDACTIONS' general
// rule takes a name that ends in its word (DB_PASSWORD, AWS_SESSION_TOKEN), access key among its words
const pick = (rules: ReadonlyArray<Rule>, part: string): Rule => {
  const found = rules.filter(([re]) => re.source.includes(part));
  if (found.length !== 1 || !found[0]) throw new Error(`not one rule holding ${part}`);
  return found[0];
};
const ROUND3: ReadonlyArray<readonly [Rule, Rule]> = [
  [
    pick(DESKTOP_CREDENTIAL_RULES, 'accessToken'),
    [/("(?:accessToken|refreshToken|access_token|refresh_token|id_token|apiKey|api_key|client_secret|password)"\s*:\s*)"(?:[^"\\]|\\[\s\S])*"/g, '$1"[redacted]"'],
  ],
  [pick(DESKTOP_CREDENTIAL_RULES, 'ANTHROPIC'), [/\b((?:(?:ANTHROPIC|CLAUDE_CODE)_[A-Z_]*(?:KEY|TOKEN)|AWS_BEARER_TOKEN_BEDROCK)\s*[=:]\s*)\S+/gi, '$1[redacted]']],
  [JSON_KEY_VARIABLE, [/("(?:(?:ANTHROPIC|CLAUDE_CODE)_[A-Z_]*(?:KEY|TOKEN)|AWS_BEARER_TOKEN_BEDROCK)"\s*:\s*)"(?:[^"\\]|\\[\s\S])*"/gi, '$1"[redacted]"']],
  [pick(DESKTOP_RULES, 'Bearer'), [/\b(Bearer)\s+\S+/gi, '$1 [redacted]']],
  [pick(DESKTOP_CREDENTIAL_RULES, 'Bearer'), [/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]']],
  [
    pick(DESKTOP_RULES, 'passwd'),
    [/\b([A-Za-z0-9_]*?(?:token|secret|password|passwd|api[_-]?key|access[_-]?key|authorization))(\s*[=:]\s*)\S+/gi, '$1$2[redacted]'],
  ],
];
/** a rule as round 3 left it: the wider rule in place of the one it replaces, any other unchanged */
const widened = (r: Rule): Rule => ROUND3.find(([old]) => old[0].source === r[0].source && old[0].flags === r[0].flags)?.[1] ?? r;
// each token rule is found by its token's prefix, not by its whole text, so a rule changed in place
// fails the tests below on what it does rather than on a lookup
const HF = 'hf_';
const GH = 'gh[pousr]_';
const PAT = 'github_pat_';
const ruleFor = (rules: ReadonlyArray<Rule>, prefix: string): Rule => {
  const found = rules.filter(([re]) => re.source.includes(prefix));
  if (found.length !== 1 || !found[0]) throw new Error(`not one rule for ${prefix}`);
  return found[0];
};
const alone = ([re, rep]: Rule, text: string) => text.replace(re, rep);

// samples, put together at run time: letters and digits of the token's own alphabet
const ALNUM = 'aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dF3hJ5kL7nP9rS1uV3xZ5';
const run = (n: number, alphabet = ALNUM) => Array.from({ length: n }, (_, i) => alphabet[i % alphabet.length]).join('');
const LETTERS = 'AbCdEfGhIjKlMnOpQrStUvWxYz';
const hf = (n = 34) => `h${'f_'}${run(n, LETTERS)}`;
const gh = (kind: string, n = 36) => `g${'h'}${kind}_${run(n)}`;
const pat = (a = 22, b = 59) => `github${'_pat_'}${run(a)}_${run(b)}`;

describe('the rules, against what the editions hold', () => {
  it("keep desktop's RULES (the browser's) in order, with the three token rules and then the three credential shapes before Bearer, the round-2 rules beside the rules they widen, and each rule unchanged but the four round 3 widened", () => {
    expect(CREDENTIAL_SHAPES).toHaveLength(3);
    const i = DESKTOP_RULES.findIndex(([re]) => re.source.includes('Bearer'));
    expect(view(REDACTIONS)).toEqual(view(withRound2([...DESKTOP_RULES.slice(0, i), ...NEW_RULES, ...CREDENTIAL_SHAPES, ...DESKTOP_RULES.slice(i)]).map(widened)));
  });

  it('make redact take everything redactCredentials takes, two values with nothing between them included: compact JSON of request headers, a list, one header holding two', () => {
    // REDACTIONS' Bearer rule runs to the next white space, through a quote and a comma, so on its own
    // it swallowed the second Bearer and left that token standing; redact runs CREDENTIAL_REDACTIONS first
    const a = run(9);
    const b = run(9, 'zyx987wvuZYX');
    for (const text of [
      `{"authorization":"Bearer ${a}","proxy-authorization":"Bearer ${b}"}`,
      `['Bearer ${a}','Bearer ${b}']`,
      `Authorization: Bearer ${a},Bearer ${b}`,
    ]) {
      const cred = redactCredentials(text);
      expect(cred, text).not.toContain(a);
      expect(cred, text).not.toContain(b);
      expect(redact(text), text).not.toContain(a);
      expect(redact(text), text).not.toContain(b);
    }
  });

  it('never redact less than redactCredentials: over 12,000 texts glued from credential fragments, every secret redactCredentials removes is gone from redact\'s output', () => {
    // a seeded generator, so a failure is the same on every run
    let seed = 20261009;
    const next = (n: number): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % n;
    };
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    let made = 0;
    // a secret no other secret holds: Z (which no other place uses), its number, x, then lower-case letters
    const secret = (): string => `Zq${(made++).toString(36)}x${Array.from({ length: 8 }, () => lower[next(26)]).join('')}`;
    const key = `ANTHROPIC_${'API'}_KEY`;
    const oauth = `CLAUDE_CODE_${'OAUTH'}_TOKEN`;
    const bedrock = `AWS_BEARER_${'TOKEN'}_BEDROCK`;
    const fragments: Array<(s: string) => string> = [
      (s) => `Bearer ${s}`,
      (s) => `bearer ${s}`,
      (s) => `"authorization":"Bearer ${s}"`,
      (s) => `{"access${'Token'}":"${s}"}`,
      (s) => `"pass${'word'}": "${s}"`,
      (s) => `"client_${'secret'}":"pa\\"${s}"`,
      (s) => `"token":"${s}"`,
      (s) => `${key}=${s}`,
      (s) => `${key.toLowerCase()}=${s}`,
      (s) => `"${oauth}":"${s}"`,
      (s) => `${bedrock}=${s}`,
      (s) => `{"${bedrock}":"${s}"}`,
      (s) => `-----BEGIN ${'RSA'} PRIVATE ${'KEY'}-----\n${s}\n-----END ${'RSA'} PRIVATE ${'KEY'}-----`,
      (s) => `Authorization: Basic ${s}`,
      (s) => `sk-${'ant'}-${s}`,
    ];
    const noise = ['csrf=', '-----BEGIN', 'Bearer', 'token=', 'x', '"', 'a b', ''];
    const gaps = ['', '', ',', '"', "'", ' ', '\n', '&', ':', '=', ';', '\\"', '}{', '[', ']'];
    const failures: string[] = [];
    let checked = 0;
    for (let t = 0; t < 12000; t++) {
      const secrets: string[] = [];
      let text = '';
      const parts = 2 + next(3);
      for (let p = 0; p < parts; p++) {
        text += gaps[next(gaps.length)];
        if (next(4) === 0) text += noise[next(noise.length)];
        else {
          const s = secret();
          secrets.push(s);
          text += fragments[next(fragments.length)]!(s);
        }
      }
      const cred = redactCredentials(text);
      const out = redact(text);
      for (const s of secrets) {
        if (cred.includes(s)) continue;
        checked++;
        if (out.includes(s)) failures.push(JSON.stringify(text));
      }
    }
    expect(checked).toBeGreaterThan(10000);
    expect(failures.slice(0, 5)).toEqual([]);
  });

  it("keep desktop's CREDENTIAL_RULES (VS Code's) in order, with the three token rules before Bearer, the round-2 rules beside the rules they widen, and each rule unchanged but the three round 3 widened", () => {
    const i = DESKTOP_CREDENTIAL_RULES.findIndex(([re]) => re.source.includes('Bearer'));
    expect(view(CREDENTIAL_REDACTIONS)).toEqual(view(withRound2([...DESKTOP_CREDENTIAL_RULES.slice(0, i), ...NEW_RULES, ...DESKTOP_CREDENTIAL_RULES.slice(i)]).map(widened)));
  });

  it('widen each of round 3\'s rules: every rule it replaced is gone from the lists, and the wider rule takes every secret the old one took', () => {
    for (const [old] of ROUND3) {
      for (const rules of [REDACTIONS, CREDENTIAL_REDACTIONS]) expect(view(rules).map((r) => JSON.stringify(r)), old[0].source).not.toContain(JSON.stringify(view([old])[0]));
    }
    const s = run(12);
    const key = `ANTHROPIC_${'API'}_KEY`;
    const texts = [
      `{"pass${'word'}": "${s}"}`,
      `{"client_${'secret'}":"${s}","id":1}`,
      `${key}=${s}`,
      `x ${key}: ${s} y`,
      `{"${key}": "${s}"}`,
      `Bearer ${s}`,
      `Authorization: Bearer ${s}`,
      `token=${s}`,
      `api-key: ${s}`,
      `authorization=${s}`,
    ];
    let took = 0;
    for (const [old, wider] of ROUND3) {
      for (const t of texts) {
        if (alone(old, t).includes(s)) continue;
        took++;
        expect(alone(wider, t), `${wider[0].source} on ${t}`).not.toContain(s);
      }
    }
    expect(took).toBeGreaterThanOrEqual(ROUND3.length);
  });

  it('replace every occurrence (each expression is global) with a mark the posture scan allows', () => {
    for (const [re, rep] of [...REDACTIONS, ...CREDENTIAL_REDACTIONS]) {
      expect(re.flags, re.source).toContain('g');
      expect(rep, re.source).toMatch(/\[(?:redacted|signed-token|private key redacted)\]/);
    }
  });

  it("still give desktop's own expected answers", () => {
    expect(redact('token=abc123 password: hunter2')).toBe('token=[redacted] password: [redacted]');
    expect(redact(`sk-${'ant'}-oat01-AAAA_bbbb`)).toBe('[redacted]');
    expect(redactCredentials(`sk-${'ant'}-oat01-AAAA_bbbb`)).toBe('[redacted]');
    expect(redact('csrf=abc123&x=1')).toBe('csrf=[redacted]&x=1');
    // the order matters here: Bearer before the general rule takes the token, the general rule the word
    expect(redact(`Authorization: Bearer ${run(12)}`)).toBe('Authorization: [redacted] [redacted]');
    expect(redact(`authorization=Bearer ${run(12)}`)).toBe('authorization=[redacted] [redacted]');
    expect(redact('x'.repeat(40))).toBe('[redacted]');
    const link = 'https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt';
    expect(redact(link)).toBe(link);
    const sha = '3b22e706f773bbf018ef2a5460e948aafb7f7745';
    const out = redactCredentials(
      `commit ${sha}\n{"accessToken": "SECRET1", "refreshToken": "SECRET2"}\nAuthorization: Bearer abcdefghijkl\nANTHROPIC_API_KEY=xyz\n-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----\n`,
    );
    expect(out).toContain(sha);
    expect(out).not.toMatch(/SECRET|abcdefghijkl|xyz|AAAA/);
    expect(out).toContain('[private key redacted]');
  });

  it('leave nothing of a private key, a short key variable or a short JSON credential through redact, as through redactCredentials', () => {
    // a key as ssh-keygen prints it: base64 lines of 70 with "+" and "/", which the 40-character rule
    // alone stops at, so about half of it would stand
    const body = Array.from({ length: 25 }, (_, i) => run(70, `${ALNUM}+/`.slice(i % 7))).join('\n');
    const key = `-----BEGIN ${'OPENSSH'} PRIVATE ${'KEY'}-----\n${body}\n-----END ${'OPENSSH'} PRIVATE ${'KEY'}-----\n`;
    expect(body).toMatch(/[+/]/);
    for (const f of [redact, redactCredentials]) {
      const out = f(`before\n${key}after`);
      expect(out, f.name).toBe('before\n[private key redacted]\nafter');
    }
    const auth = `ANTHROPIC_${'AUTH'}_TOKEN`;
    const oauth = `CLAUDE_CODE_${'OAUTH'}_TOKEN`;
    for (const f of [redact, redactCredentials]) {
      expect(f(`${auth}=gw-7f3a91c2`), f.name).toBe(`${auth}=[redacted]`);
      expect(f(`${oauth}: abc.def.123`), f.name).toBe(`${oauth}: [redacted]`);
      expect(f(`{"${'refresh'}Token": "rt-short-1"}`), f.name).toBe(`{"${'refresh'}Token": "[redacted]"}`);
      expect(f(`{"${'pass'}word": "hunter2"}`), f.name).toBe(`{"${'pass'}word": "[redacted]"}`);
    }
  });

  it('take a key or token variable written as a quoted JSON key, as settings.json\'s env block and .mcp.json hold it, in both sets', () => {
    const auth = `ANTHROPIC_${'AUTH'}_TOKEN`;
    const key = `ANTHROPIC_${'API'}_KEY`;
    const oauth = `CLAUDE_CODE_${'OAUTH'}_TOKEN`;
    for (const f of [redact, redactCredentials]) {
      expect(f(`{"env": {"${auth}": "gw-7f3a9c2e1b", "DEBUG": "1"}}`), f.name).toBe(`{"env": {"${auth}": "[redacted]", "DEBUG": "1"}}`);
      expect(f(`{"env":{"${key}":"k-12345678"}}`), f.name).toBe(`{"env":{"${key}":"[redacted]"}}`);
      expect(f(`{"${oauth}" : "abc.def-123"}`), f.name).toBe(`{"${oauth}" : "[redacted]"}`);
      // a value holding an escaped quote is taken whole, never cut at the escape
      expect(f(`{"${key}": "ab\\"cd"}`), f.name).toBe(`{"${key}": "[redacted]"}`);
      // a name that is no key or token variable, and one that is not quoted on both sides, stay
      expect(f('{"ANTHROPIC_MODEL": "claude-x"}'), f.name).toBe('{"ANTHROPIC_MODEL": "claude-x"}');
    }
  });

  it('take a JSON field named token or secret, in both sets, and leave a longer name that only holds the word', () => {
    for (const f of [redact, redactCredentials]) {
      expect(f('{"token": "abcd1234efgh"}'), f.name).toBe('{"token": "[redacted]"}');
      expect(f('{"secret":"s3cr3t","id":1}'), f.name).toBe('{"secret":"[redacted]","id":1}');
      expect(f('{"bos_token": "<s>"}'), f.name).toBe('{"bos_token": "<s>"}');
    }
  });

  it('take the credential of an HTTP Basic Authorization header, in both sets, and leave the word basic anywhere else', () => {
    const b64 = ['dXNlcjpw', 'YXNzd29yZA=='].join('');
    expect(redact(`Authorization: Basic ${b64}`)).toBe('Authorization: [redacted] [redacted]');
    expect(redactCredentials(`Authorization: Basic ${b64}`)).toBe('Authorization: Basic [redacted]');
    expect(redactCredentials(`-H "authorization: basic Z286cGFzcw=="`)).toBe('-H "authorization: basic [redacted]"');
    expect(redactCredentials(`Proxy-Authorization=Basic ${b64}`)).toBe('Proxy-Authorization=Basic [redacted]');
    for (const f of [redact, redactCredentials]) {
      for (const t of ['the basic usage', 'Basic setup steps', 'BASIC dXNlcjpwYXNz']) expect(f(t), `${f.name}: ${t}`).toBe(t);
      expect(f(`Authorization: Basic ${b64}`), f.name).not.toContain(b64);
    }
  });

  it('take a Bedrock API key (AWS_BEARER_TOKEN_BEDROCK) and a key or token variable in any case, bare and as a quoted JSON key, in both sets', () => {
    const bedrock = `AWS_BEARER_${'TOKEN'}_BEDROCK`;
    const key = `ANTHROPIC_${'API'}_KEY`.toLowerCase();
    const b64 = ['ABSKQmVkcm9ja0FQSUtleS1hYmM', '+ZGVm/Z2hp='].join('');
    for (const f of [redact, redactCredentials]) {
      expect(f(`${bedrock}=${b64}`), f.name).toBe(`${bedrock}=[redacted]`);
      expect(f(`export ${bedrock}: ${b64}`), f.name).toBe(`export ${bedrock}: [redacted]`);
      expect(f(`{"env":{"${bedrock}":"${b64}"}}`), f.name).toBe(`{"env":{"${bedrock}":"[redacted]"}}`);
      expect(f(`${key}=gw-0123456789`), f.name).toBe(`${key}=[redacted]`);
      expect(f(`{"${key}": "gw-0123456789"}`), f.name).toBe(`{"${key}": "[redacted]"}`);
      expect(f(`Claude_Code_OAuth_${'Token'}=abc.def`), f.name).toBe(`Claude_Code_OAuth_${'Token'}=[redacted]`);
      // a name that is no key or token variable still stays, in any case
      expect(f('anthropic_model=claude-x'), f.name).toBe('anthropic_model=claude-x');
    }
  });

  it('take, through redact, a variable or field whose name ends in token, secret, password, passwd, api key, access key or authorization; redactCredentials leaves them, as a credential under any other name', () => {
    const access = ['wJalrXUtnFEMI', '/K7MDENG/bPxRfiCYEXAMPLEKEY'].join('');
    const samples: Array<[string, string]> = [
      [`AWS_SECRET_ACCESS_${'KEY'}=${access}`, `AWS_SECRET_ACCESS_${'KEY'}=[redacted]`],
      [`AWS_SESSION_${'TOKEN'}=FwoG+abc/def`, `AWS_SESSION_${'TOKEN'}=[redacted]`],
      [`DB_PASS${'WORD'}=hunter2`, `DB_PASS${'WORD'}=[redacted]`],
      ['csrf_token: abc123', 'csrf_token: [redacted]'],
      ['github_secret = s3cr3t', 'github_secret = [redacted]'],
      ['proxy_authorization=xyz', 'proxy_authorization=[redacted]'],
    ];
    for (const [text, want] of samples) {
      expect(redact(text), text).toBe(want);
      expect(redactCredentials(text), text).toBe(text);
    }
    // a name that only holds the word, with more after it, stays
    for (const text of ['max_tokens=4096', 'tokenizer: gpt2', 'passwords=3', 'secretary: x', 'the token budget']) expect(redact(text), text).toBe(text);
  });

  it('take a bearer token whatever the case of the word Bearer, as HTTP reads the scheme, and keep the word as written', () => {
    const t = run(16);
    expect(redactCredentials(`authorization: bearer ${t}`)).toBe('authorization: bearer [redacted]');
    expect(redactCredentials(`BEARER ${t}`)).toBe('BEARER [redacted]');
    expect(redact(`authorization: bearer ${t}`)).toBe('authorization: [redacted] [redacted]');
    expect(redact(`{"token_type": "bearer", "x": "BeArEr ${t}"}`)).not.toContain(t);
  });

  it('read a JSON credential field past an escaped quote, in both sets, so a password holding a quote is taken whole', () => {
    for (const f of [redact, redactCredentials]) {
      expect(f(`{"pass${'word'}":"pa\\"ss word"}`), f.name).toBe(`{"pass${'word'}":"[redacted]"}`);
      expect(f(`{"client_${'secret'}":"s3\\"cr3tvalue","id":1}`), f.name).toBe(`{"client_${'secret'}":"[redacted]","id":1}`);
      expect(f(`{"access${'Token'}": "a\\\\", "b": "c"}`), f.name).toBe(`{"access${'Token'}": "[redacted]", "b": "c"}`);
    }
  });

  it('give a missing text as empty, since the editions hand them untyped tool output', () => {
    expect(redact(undefined as unknown as string)).toBe('');
    expect(redact(null as unknown as string)).toBe('');
    expect(redactCredentials(null as unknown as string)).toBe('');
    expect(redactCredentials(undefined as unknown as string)).toBe('');
  });

  it('give the same text again when run on their own output', () => {
    const samples = [`a ${hf()} b`, `${gh('p')} ${pat()}`, 'csrf=abc&x=1', 'Bearer abcdefghijkl', 'password: hunter2', 'x'.repeat(50), `-----BEGIN RSA PRIVATE KEY-----\nAAAA`];
    for (const s of samples) {
      expect(redact(redact(s)), s).toBe(redact(s));
      expect(redactCredentials(redactCredentials(s)), s).toBe(redactCredentials(s));
    }
  });

  it('are for text: a structured value redacted string by string keeps its shape and loses the credential, where its serialised JSON does not survive (design 15.1)', () => {
    const oauth = `CLAUDE_CODE_${'OAUTH'}_TOKEN`;
    const key = `ANTHROPIC_${'API'}_KEY`;
    const begin = `-----BEGIN ${'RSA'} PRIVATE ${'KEY'}-----`;
    // the shapes desktop's tool results carry: a failed step's sentence, log lines, a status line
    const values: unknown[] = [
      { name: 'w', steps: [{ id: 'failed', code: 'setup', sentence: `${oauth}=abc` }] },
      { name: 'w', line: `${key}=abc` },
      { name: 'w', line: begin },
      { lines: ["2026-10-01T12:00:00Z Couldn't start: x", `${oauth}=abc`, 'Stopped'] },
    ];
    const leaves = (v: unknown, f: (s: string) => string): unknown =>
      typeof v === 'string' ? f(v) : Array.isArray(v) ? v.map((x) => leaves(x, f)) : v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, leaves(x, f)])) : v;
    const shape = (v: unknown): unknown => leaves(v, () => '');
    for (const v of values) {
      for (const f of [redact, redactCredentials]) {
        const walked = leaves(v, f);
        expect(shape(walked), f.name).toEqual(shape(v));
        expect(JSON.stringify(walked), f.name).not.toMatch(/=abc|BEGIN/);
      }
      // through its serialised JSON the same value throws or comes back with fewer strings
      let back: unknown;
      try {
        back = JSON.parse(redact(JSON.stringify(v)));
      } catch {
        back = undefined;
      }
      expect(back === undefined || JSON.stringify(shape(back)) !== JSON.stringify(shape(v)), JSON.stringify(v)).toBe(true);
    }
  });
});

describe('the order the rules run in', () => {
  // the rule of apply written again: each rule of the list over the text, in the list's order
  const fold = (rules: ReadonlyArray<Rule>, text: string) => rules.reduce((t, r) => alone(r, t), text);
  const without = (rules: ReadonlyArray<Rule>, i: number) => rules.filter((_, j) => j !== i);
  const key = `-----BEGIN ${'RSA'} PRIVATE ${'KEY'}-----\nAAAA\n-----END ${'RSA'} PRIVATE ${'KEY'}-----`;
  // at least one text that each rule of each list alone decides
  const POOL = [
    'csrf=abc123&x=1',
    'ASHLEY1.abc.def',
    'BEETHOVEN1.abc.def',
    `sk-${'ant'}-oat01-AAAA_bbbb`,
    hf(),
    gh('p'),
    `${gh('p')}-x`,
    pat(),
    `${pat()}-x`,
    `{"${'pass'}word": "hunter2"}`,
    '{"secret": "s3cr3t"}',
    `ANTHROPIC_${'AUTH'}_TOKEN=gw-7f3a`,
    `AWS_BEARER_${'TOKEN'}_BEDROCK=gw-7f3a`,
    `{"ANTHROPIC_${'AUTH'}_TOKEN": "gw-7f3a"}`,
    key,
    `Authorization: Basic ${['dXNlcjpw', 'YXNzd29yZA=='].join('')}`,
    `Bearer ${run(12)}`,
    `Authorization: Bearer ${run(12)}`,
    'token=abc123',
    'x'.repeat(40),
  ];

  it.each([
    ['redact', redact, [CREDENTIAL_REDACTIONS, REDACTIONS]],
    ['redactCredentials', redactCredentials, [CREDENTIAL_REDACTIONS]],
  ] as const)('%s runs every rule of its lists, each once, in order (redact: CREDENTIAL_REDACTIONS, then REDACTIONS)', (_, f, lists) => {
    for (const t of POOL) expect(f(t), t).toBe(lists.reduce((text, rules) => fold(rules, text), t));
    // every rule of each list decides some text: leaving it out, or running it alone, gives another answer
    for (const rules of lists) {
      rules.forEach((r, i) => {
        const decided = POOL.filter((t) => alone(r, t) !== t && fold(without(rules, i), t) !== fold(rules, t));
        expect(decided.length, `rule ${i} ${r[0].source}`).toBeGreaterThan(0);
      });
    }
  });

  it('matters: Bearer before the general rule, Basic before both, so the reverse order would let a credential through', () => {
    const reversed = [...REDACTIONS].reverse();
    for (const t of [`Authorization: Bearer ${run(12)}`, `Authorization: Basic ${run(12)}`]) {
      expect(fold(reversed, t), t).not.toBe(fold(REDACTIONS, t));
      expect(fold(reversed, t), t).toContain(run(12));
      expect(redact(t), t).not.toContain(run(12));
    }
  });
});

describe('the three token rules', () => {
  const shapes: Array<[string, string, string]> = [
    ['a Hugging Face token', HF, hf()],
    ['a longer Hugging Face token', HF, hf(40)],
    ...['p', 'o', 'u', 's', 'r'].map((k): [string, string, string] => [`a GitHub gh${k}_ token`, GH, gh(k)]),
    ['a longer GitHub token', GH, gh('s', 60)],
    ['a fine-grained GitHub token', PAT, pat()],
  ];

  it('each take their shape out of the text around it and keep that text, in both sets', () => {
    for (const [what, prefix, token] of shapes) {
      for (const around of [(t: string) => `see ${t} in the notes`, (t: string) => `"${t}",`, (t: string) => `x=${t}\nnext line`, (t: string) => t]) {
        const text = around(token);
        const want = around('[redacted]');
        expect(alone(ruleFor(REDACTIONS, prefix), text), what).toBe(want);
        expect(alone(ruleFor(CREDENTIAL_REDACTIONS, prefix), text), what).toBe(want);
        expect(redact(text), what).toBe(want);
        expect(redactCredentials(text), what).toBe(want);
      }
    }
  });

  it('take a token at exactly its real length and leave one character fewer', () => {
    const exact: Array<[string, string, string]> = [
      [HF, hf(34), hf(33)],
      [GH, gh('p', 36), gh('p', 35)],
      [PAT, pat(22, 59), `github${'_pat_'}${run(81)}`],
    ];
    for (const [prefix, full, short] of exact) {
      for (const rules of [REDACTIONS, CREDENTIAL_REDACTIONS]) {
        const rule = ruleFor(rules, prefix);
        expect(alone(rule, full), full).toBe('[redacted]');
        expect(alone(rule, short), short).toBe(short);
      }
      expect(redactCredentials(`a ${short} b`), short).toBe(`a ${short} b`);
    }
  });

  it('leave a word that only begins the same way, in another case, or inside another word', () => {
    const lookalikes = [
      `ghost_${run(36)}`,
      'github_page',
      'github_pages_deploy',
      'github_pat_example',
      `GHP_${run(36)}`,
      `gha_${run(36)}`,
      `ghp${run(36)}`,
      `xghp_${run(36)}`,
      'hf_hub_download',
      'hf_transfer',
      `HF_${run(34, LETTERS)}`,
      `rhf_${run(34, LETTERS)}`,
      `hf_${run(20, LETTERS)}_${run(20, LETTERS)}`,
      `my_github_pat_${run(82)}`,
    ];
    for (const word of lookalikes) {
      const text = `before ${word} after`;
      for (const prefix of [HF, GH, PAT]) {
        for (const rules of [REDACTIONS, CREDENTIAL_REDACTIONS]) expect(alone(ruleFor(rules, prefix), text), `${prefix} on ${word}`).toBe(text);
      }
      expect(redactCredentials(text), word).toBe(text);
      // redact also takes any run of 40 or more as a token (desktop's rule), so only the short ones pass it whole
      if (!/[A-Za-z0-9_-]{40,}/.test(word)) expect(redact(text), word).toBe(text);
    }
  });
});

describe("hpcworker's vectors, which hold no secret", () => {
  const dir = join(ROOT, 'test', 'hpcworker', 'vectors');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const strings = (v: unknown): string[] =>
    typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v !== null && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];

  it('come through both functions unchanged, every string and every whole file, e-mail addresses included', () => {
    let checked = 0;
    const emails: string[] = [];
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf8');
      for (const s of [text, ...strings(JSON.parse(text))]) {
        expect(redact(s), f).toBe(s);
        expect(redactCredentials(s), f).toBe(s);
        emails.push(...(s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []));
        checked++;
      }
    }
    expect(files.length).toBeGreaterThan(20);
    expect(checked).toBeGreaterThan(200);
    expect(emails.length).toBeGreaterThan(0);
  });
});

describe('time', () => {
  // The input doubles from 25 KB to 200 KB and a test stops at the first slow call: a rule that
  // backtracks without bound is caught in about a second at 25 or 50 KB, where at 200 KB it would hold
  // the run for minutes (a regular expression cannot be interrupted).
  const SIZES = [25, 50, 100, 200].map((k) => k * 1024);
  const LIMIT_MS = 250;
  // what each rule begins with or waits for: repeated, followed by a long run it may take, by a run it
  // may not, and as near misses one character short of a match
  const STARTS = [
    'csrf=',
    'ASHLEY1.',
    'ASHLEYREV1.',
    'BEETHOVEN1.',
    `sk-${'ant'}-`,
    'hf_',
    'ghp_',
    'github_pat_',
    'Bearer ',
    'authorization: Basic ',
    'authorization=',
    'Authorization:Basic',
    '"token":',
    '"token": "',
    '"secret": "\\',
    '"ANTHROPIC_KEY":',
    '"ANTHROPIC_KEY": "',
    '"CLAUDE_CODE_TOKEN" : "\\',
    'token',
    'token=',
    'password',
    '"password":',
    '"password": "',
    'ANTHROPIC_',
    'ANTHROPIC_KEY',
    'CLAUDE_CODE_',
    'anthropic_api_',
    `AWS_BEARER_${'TOKEN'}_BEDROCK`,
    `"AWS_BEARER_${'TOKEN'}_BEDROCK": "\\`,
    'bearer ',
    'DB_PASSWORD',
    'a_token',
    'x_',
    '"password": "\\',
    '-----BEGIN ',
    '-----BEGIN PRIVATE KEY-----',
    '-----END ',
    '-----END PRIVATE KEY',
  ];
  const hostile = (size: number): string[] => {
    const fill = (unit: string) => unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
    return [
      fill('a'),
      fill('A'),
      fill(' '),
      fill('A '),
      fill(`${'a'.repeat(39)} `),
      fill(`${'a'.repeat(81)} `),
      fill('a.'),
      ...STARTS.flatMap((p) => [
        fill(p),
        p + fill('a'),
        p + fill('A'),
        p + fill(' '),
        p + fill('A '),
        p + fill('\n'),
        fill(`${p}${'a'.repeat(30)} `),
        `-----BEGIN PRIVATE KEY-----${fill(p)}`,
      ]),
    ];
  };
  /** the slowest call, in ms; it stops at the first call over the limit */
  const worstOf = (call: (text: string) => unknown): number => {
    let worst = 0;
    let texts = 0;
    for (const size of SIZES) {
      for (const text of hostile(size)) {
        expect(text.length).toBeGreaterThanOrEqual(size);
        const t0 = performance.now();
        call(text);
        worst = Math.max(worst, performance.now() - t0);
        texts++;
        if (worst >= LIMIT_MS) return worst;
      }
    }
    expect(texts).toBe(SIZES.length * (7 + 8 * STARTS.length));
    return worst;
  };

  it.each([
    ...REDACTIONS.map((r, i): [string, Rule] => [`REDACTIONS ${i} ${r[0].source}`, r]),
    ...CREDENTIAL_REDACTIONS.map((r, i): [string, Rule] => [`CREDENTIAL_REDACTIONS ${i} ${r[0].source}`, r]),
  ])('%s runs in time linear in its input: each hostile text up to 200 KB in well under a second', (_, rule) => {
    expect(worstOf((text) => alone(rule, text))).toBeLessThan(LIMIT_MS);
  });

  it('redact and redactCredentials take each hostile text up to 200 KB in well under a second', () => {
    expect(worstOf((text) => redact(text))).toBeLessThan(LIMIT_MS);
    expect(worstOf((text) => redactCredentials(text))).toBeLessThan(LIMIT_MS);
  });
});
