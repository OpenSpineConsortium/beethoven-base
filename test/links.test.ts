// src/links.ts against hpcworker's `contract` export, taken with interface/pull.sh into test/hpcworker/:
// the link patterns of connection.schema.json ($defs.claude_link) and status.schema.json
// ($defs.claude_link_or_empty), compiled here as an ECMA-262 JSON Schema validator compiles them, and
// every link the real writer printed into the vectors. The module and the schema must give the same
// verdict on every input below; the one input they part on, "", is named, with why.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLAUDE_CODE_LINK,
  ENVIRONMENT_LINK,
  environmentIdOf,
  isClaudeCodeLink,
  isEnvironmentLink,
  isSessionLink,
  linksIn,
  SESSION_LINK,
} from '../src/links.js';
import { ROOT } from './origin.js';

const at = (...p: string[]) => join(ROOT, 'test', 'hpcworker', ...p);
const json = (f: string) => JSON.parse(readFileSync(at(f), 'utf8')) as Record<string, unknown>;
const connectionSchema = json('connection.schema.json') as { $defs: Record<string, { pattern: string }> };
const statusSchema = json('status.schema.json') as { $defs: Record<string, { pattern: string }>; properties: Record<string, { pattern?: string }> };
const vectors = readdirSync(at('vectors')).map((f) => json(`vectors/${f}`));

const LINK_PATTERN = connectionSchema.$defs.claude_link!.pattern;
const LINK_OR_EMPTY_PATTERN = statusSchema.$defs.claude_link_or_empty!.pattern;
// a JSON Schema validator compiles a pattern as ECMA-262, most with the u flag; the verdicts must hold under both
const schemaLink = [new RegExp(LINK_PATTERN), new RegExp(LINK_PATTERN, 'u')];
const schemaLinkOrEmpty = [new RegExp(LINK_OR_EMPTY_PATTERN), new RegExp(LINK_OR_EMPTY_PATTERN, 'u')];

/** every string anywhere in a value, JSON lines of a vector's output parsed too */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') {
    out.push(v);
    if (v.startsWith('{')) {
      try {
        strings(JSON.parse(v), out);
      } catch {
        // a line of text that starts with a brace
      }
    }
  } else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (typeof v === 'object' && v !== null) for (const x of Object.values(v)) strings(x, out);
  return out;
}
const vectorStrings = vectors.flatMap((v) => strings(v));
// every https or http address in the vectors, cut out of the sentences that carry them
const vectorLinks = [...new Set(vectorStrings.flatMap((s) => s.match(/https?:\/\/[^\s"]+/g) ?? []))];
// the values of every field the schemas call a link
const linkFields = [...new Set(vectors.flatMap((v) => strings(v)).filter((s) => /^https:\/\/claude\./.test(s)))];

const ENV = 'https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt';
const SESSION = 'https://claude.ai/code/session_01N4R9mLRJ5wFbf1oaDe5pyj';
const GOOD = [
  ENV,
  SESSION,
  'https://claude.com/code?environment=env_01X',
  'https://claude.com/code/session_01N4R9',
  'https://claude.ai/code?environment=env_-',
  'https://claude.ai/code/session__',
  'https://claude.ai/code/session_01AbC-d_9',
];
const BAD = [
  '',
  ' ',
  // another scheme, host, user or port
  'http://claude.ai/code/session_01N4R9',
  'HTTPS://claude.ai/code/session_01N4R9',
  'https://Claude.ai/code/session_01N4R9',
  'https://CLAUDE.AI/code?environment=env_01X',
  'https://claude.ai/CODE/session_01N4R9',
  'https://claude.ai/code/SESSION_01N4R9',
  'https://claude.ai/code?ENVIRONMENT=env_01X',
  'https://claude.ai/code?environment=ENV_01X',
  'https://claude.ai.example.com/code/session_01N4R9',
  'https://claude.ai.evil.example/code/session_01N4R9',
  'https://xclaude.ai/code/session_01N4R9',
  'https://claudexai/code/session_01N4R9',
  'https://claude.org/code?environment=env_01',
  'https://evil.example/code?environment=env_01',
  'https://evil.example/https://claude.ai/code/session_01N4R9',
  'https://evil.example/?https://claude.ai/code/session_x',
  'javascript:alert(1)//https://claude.ai/code/session_x',
  'https://user@claude.ai/code/session_01N4R9',
  'https://claude.ai:pass@evil.example/code/session_01N4R9',
  'https://claude.ai:443/code/session_01N4R9',
  'https://claude.ai./code/session_01N4R9',
  '//claude.ai/code/session_01N4R9',
  // the platform's own pages, and the sign-in page the vectors carry
  'https://claude.ai/code',
  'https://claude.ai/code/',
  'https://claude.ai/code/session_',
  'https://claude.ai/code?environment=env_',
  'https://claude.ai/code?environment=',
  'https://claude.ai/code/session/mock-1',
  'https://claude.ai/code/sessions',
  'https://claude.ai/oauth/authorize?code=true',
  'https://claude.ai/settings/connectors',
  // anything after the id: a slash, a path, a query, a fragment, a space, a line end
  'https://claude.ai/code/session_01N4R9/',
  'https://claude.ai/code/session_01N4R9/../../oauth',
  'https://claude.ai/code/session_x/../../settings',
  'https://claude.ai/code/session_01N4R9?next=https://evil.example',
  'https://claude.ai/code?environment=env_01X&next=https://evil.example',
  'https://claude.ai/code?environment=env_01X#frag',
  'https://claude.ai/code/session_x#y',
  'https://claude.ai/code/session_x ',
  ' https://claude.ai/code/session_01N4R9',
  'https://claude.ai/code/session_01N4R9\n',
  'https://claude.ai/code/session_01N4R9\r',
  'https://claude.ai/code/session_01N4R9\r\n',
  '\nhttps://claude.ai/code/session_01N4R9',
  `${ENV}\n`,
  `${ENV}\nhttps://evil.example`,
  `https://evil.example\n${ENV}`,
  'https://claude.ai/code/session_01N4R9 ',
  'https://claude.ai/code/session_01N4R9\u0000',
  'https://claude.ai/code\n?environment=env_01X',
  // both forms at once, or one form glued to another
  'https://claude.ai/code?environment=env_01X/session_01N4R9',
  'https://claude.ai/code/session_01N4R9?environment=env_01X',
  `${ENV}${SESSION}`,
  // look-alikes: Cyrillic a, a capital I for l, fullwidth and dotless letters, a zero-width space, one dot leader
  'https://claude.аi/code/session_01N4R9',
  'https://cIaude.ai/code/session_01N4R9',
  'https://claude.ai/code/session_01N4R9ｘ',
  'https://claude.ai/code?environment=env_ı',
  'https://claude.ai/code/session_İ',
  'https://claude.ai/code/session_01N4R9​',
  'https://claude․ai/code/session_01N4R9',
  'https://claude.ai/code/sessiоn_01N4R9',
  'https://claude.ai/code/session_01N4R9́',
  // percent-encoding is not decoded
  'https://claude.ai/code/session_%30',
  'https://claude.ai/code%2Fsession_01N4R9',
  // very long, and very long with one wrong character at the end
  `https://claude.ai/code/session_${'a'.repeat(200_000)}!`,
  `https://claude.ai/code?environment=env_${'-'.repeat(200_000)}?`,
];
const LONG = [`https://claude.ai/code/session_${'a'.repeat(200_000)}`, `https://claude.com/code?environment=env_${'_'.repeat(200_000)}`];
const corpus = [...new Set([...GOOD, ...LONG, ...BAD, ...vectorLinks, ...linkFields])];

describe("the module's patterns are the contract's", () => {
  it("CLAUDE_CODE_LINK is connection.schema.json's claude_link, character for character", () => {
    expect(CLAUDE_CODE_LINK.source).toBe(new RegExp(LINK_PATTERN).source);
  });

  it("status.schema.json's claude_link_or_empty is the same pattern with the empty string allowed", () => {
    expect(new RegExp(LINK_OR_EMPTY_PATTERN).source).toBe(new RegExp(`^(|${LINK_PATTERN.slice(1, -1)})$`).source);
  });

  it("ENVIRONMENT_LINK and SESSION_LINK are claude_link's two branches, the environment id grouped", () => {
    const branch = (b: string) => new RegExp(LINK_PATTERN.replace('(\\?environment=env_|/session_)', b)).source;
    expect(ENVIRONMENT_LINK.source.replace('(env_[A-Za-z0-9_-]+)', 'env_[A-Za-z0-9_-]+')).toBe(branch('\\?environment=env_'));
    expect(SESSION_LINK.source).toBe(branch('/session_'));
  });

  it('carry no flag, so a test keeps no state and $ is the end of the input, never of a line', () => {
    for (const re of [CLAUDE_CODE_LINK, ENVIRONMENT_LINK, SESSION_LINK]) expect(re.flags, re.source).toBe('');
  });
});

describe('the module and the schema give the same verdict', () => {
  it('on every link the real writer printed, and every one of them is a Claude Code link but the sign-in page', () => {
    expect(vectorLinks.length).toBeGreaterThan(1);
    for (const s of vectorLinks) {
      for (const re of schemaLink) expect(isClaudeCodeLink(s), s).toBe(re.test(s));
      expect(isClaudeCodeLink(s), s).toBe(!s.startsWith('https://claude.ai/oauth/'));
    }
  });

  it('on every value a link field of the vectors holds, each of them a link', () => {
    expect(linkFields.length).toBeGreaterThan(0);
    for (const s of linkFields.filter((x) => !x.includes(' ') && !x.startsWith('https://claude.ai/oauth/'))) {
      expect(isClaudeCodeLink(s), s).toBe(true);
      for (const re of schemaLink) expect(re.test(s), s).toBe(true);
    }
  });

  it("on every input of the corpus, against claude_link: no disagreement at all", () => {
    const parted = corpus.filter((s) => schemaLink.some((re) => re.test(s) !== isClaudeCodeLink(s)));
    expect(parted).toEqual([]);
  });

  it('against claude_link_or_empty, they part on "" alone: an empty field is no link, and reads as absent', () => {
    const parted = corpus.filter((s) => schemaLinkOrEmpty.some((re) => re.test(s) !== isClaudeCodeLink(s)));
    expect(parted).toEqual(['']);
  });

  it('takes every good link and refuses every bad one, whatever the schema says', () => {
    for (const s of [...GOOD, ...LONG]) expect(isClaudeCodeLink(s), s.slice(0, 80)).toBe(true);
    for (const s of BAD) expect(isClaudeCodeLink(s), JSON.stringify(s.slice(0, 80))).toBe(false);
  });

  it('refuses a link followed by a newline, which a pattern ending in $ with the m flag, or Python\'s re, would take', () => {
    const withNewline = `${ENV}\n`;
    expect(isClaudeCodeLink(withNewline)).toBe(false);
    expect(new RegExp(CLAUDE_CODE_LINK.source, 'm').test(withNewline)).toBe(true);
    expect(isClaudeCodeLink(`${ENV}\nhttps://evil.example`)).toBe(false);
  });

  it('refuses anything that is not a string', () => {
    for (const x of [undefined, null, 1, true, {}, [ENV], { toString: () => ENV }, new String(ENV)]) {
      expect(isClaudeCodeLink(x)).toBe(false);
      expect(isEnvironmentLink(x)).toBe(false);
      expect(isSessionLink(x)).toBe(false);
      expect(environmentIdOf(x)).toBeNull();
    }
  });
});

describe('the two forms', () => {
  it('a Claude Code link is exactly one of an environment link and a session link, over the whole corpus', () => {
    for (const s of corpus) {
      const env = isEnvironmentLink(s);
      const ses = isSessionLink(s);
      expect(env && ses, s.slice(0, 80)).toBe(false);
      expect(env || ses, s.slice(0, 80)).toBe(isClaudeCodeLink(s));
    }
  });

  it('tells the forms apart', () => {
    expect(isEnvironmentLink(ENV)).toBe(true);
    expect(isSessionLink(ENV)).toBe(false);
    expect(isSessionLink(SESSION)).toBe(true);
    expect(isEnvironmentLink(SESSION)).toBe(false);
  });

  it("environmentIdOf gives an environment link's env_ id, of status.json's environment_id shape, and null for any other text", () => {
    const idShape = new RegExp(statusSchema.properties.environment_id!.pattern!);
    for (const s of corpus) {
      // the label is taken first: `x is string` narrows a string to never on the false branch
      const label = s.slice(0, 80);
      const id = environmentIdOf(s);
      if (isEnvironmentLink(s)) {
        expect(id, label).not.toBeNull();
        expect(idShape.test(id!), label).toBe(true);
        expect(s.endsWith(`?environment=${id}`)).toBe(true);
      } else {
        expect(id, label).toBeNull();
      }
    }
    expect(environmentIdOf(ENV)).toBe('env_01XzAN32jsbL8W1PAFSvitBt');
    expect(environmentIdOf('https://claude.com/code?environment=env_-')).toBe('env_-');
  });

  it("environmentIdOf of each vector's environment_url is the environment_id the writer put beside it", () => {
    const files = vectors.filter((v) => v.kind === 'file' && typeof (v.json as Record<string, unknown> | undefined)?.environment_url === 'string');
    expect(files.length).toBeGreaterThan(0);
    for (const v of files) {
      const j = v.json as { environment_url: string; environment_id: string };
      expect(environmentIdOf(j.environment_url), String(v.vector)).toBe(j.environment_id);
    }
  });
});

describe('linksIn: the links that stand in a text, as hpcw_parse_registration finds them', () => {
  // Claude Code's registration blocks as hpcworker's common.sh (3b22e70) records them above
  // hpcw_parse_registration: `claude remote-control` 2.1.283 fresh, and resumed with --continue
  // (job 40554211, 2026-10-03), terminal codes already removed
  const FRESH = [
    '·✔︎· Connected · phone · HEAD',
    '    Capacity: 1/32 · New sessions will be created in the current directory',
    '    asx10-hazy-meadow',
    `Continue coding in the Claude mobile app or ${ENV}`,
  ].join('\n');
  const RESUMED = [
    'Resuming session session_01N4R9mLRJ5wFbf1oaDe5pyj (43m ago)',
    'Single session · exits when complete',
    `Continue coding in the Claude mobile app or ${SESSION}`,
  ].join('\n');
  // the awk match of hpcw_parse_registration (3b22e70), as test code: either form, anywhere on a line,
  // the id as long as it runs; the environment form there takes any id, where the contract's link wants env_
  const AWK = /https:\/\/claude\.(ai|com)\/code(\?environment=[A-Za-z0-9_-]+|\/session_[A-Za-z0-9_-]+)/g;
  const awk = (text: string) => text.split('\n').flatMap((l) => l.match(AWK) ?? []);

  it('is CLAUDE_CODE_LINK without its two anchors, so the shape is written once', () => {
    expect(CLAUDE_CODE_LINK.source.startsWith('^')).toBe(true);
    expect(CLAUDE_CODE_LINK.source.endsWith('$')).toBe(true);
    expect(CLAUDE_CODE_LINK.source.slice(1, -1)).not.toMatch(/[$^]/);
  });

  it("finds the link of each real registration block, the environment's when fresh and the session's when resumed", () => {
    expect(linksIn(FRESH)).toEqual([ENV]);
    expect(linksIn(RESUMED)).toEqual([SESSION]);
    expect(environmentIdOf(linksIn(FRESH)[0])).toBe('env_01XzAN32jsbL8W1PAFSvitBt');
  });

  it('gives every link in the order printed, so the last is the one the screen offers now after a redraw', () => {
    const later = 'https://claude.com/code?environment=env_02Later';
    const found = linksIn(`${FRESH}\n${RESUMED}\n${FRESH.replace(ENV, later)}`);
    expect(found).toEqual([ENV, SESSION, later]);
    expect(found.at(-1)).toBe(later);
    expect(found.filter(isEnvironmentLink).at(-1)).toBe(later);
  });

  it('takes a link anywhere on a line, up to the first character an id cannot hold, and nothing that only looks like one', () => {
    expect(linksIn(`(${SESSION}).`)).toEqual([SESSION]);
    expect(linksIn(`x${ENV}#frag ${SESSION}?q=1`)).toEqual([ENV, SESSION]);
    for (const t of ['', 'no link here', 'https://claude.ai/oauth/authorize?code=true', 'https://claude.ai/code', 'https://claude.ai/code?environment=xyz', 'http://claude.ai/code/session_01']) {
      expect(linksIn(t), t).toEqual([]);
    }
    expect(linksIn(undefined as unknown as string)).toEqual([]);
  });

  it("finds what the worker's awk finds, but for an environment id without env_, over every block, line and vector of this file", () => {
    const texts = [FRESH, RESUMED, ...GOOD, ...LONG, ...BAD, ...vectorStrings, `${FRESH}\n${RESUMED}`, 'or https://claude.ai/code?environment=xyz and https://claude.ai/code?environment=env_ok'];
    let found = 0;
    for (const t of texts) {
      const ours = linksIn(t);
      expect(ours, t.slice(0, 80)).toEqual(awk(t).filter((l) => isClaudeCodeLink(l)));
      for (const l of ours) expect(isClaudeCodeLink(l), l.slice(0, 80)).toBe(true);
      found += ours.length;
    }
    expect(found).toBeGreaterThan(10);
  });
});
