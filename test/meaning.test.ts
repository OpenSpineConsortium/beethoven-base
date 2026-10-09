// src/meaning.ts against hpcworker's `contract` export, pinned in test/hpcworker/ (test data, never
// edited). Exhaustive by construction: every failure code lines.json lists, every cap its limit pattern
// names (parsed out of the pattern, so a new cap fails here until it has a meaning), every gate and key
// line that comes with an exit status, and the unknown code, each has one next step. The pinned rules
// below are the ones V11 5.3 and V12 state outright; a change to one is a change of what students are
// told to do, made here on purpose.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gateReadFailure, gateRefusal, type GateLimit } from '../src/gate.js';
import {
  FAILURE_MEANING,
  failureMeaning,
  INCOMPLETE_MEANING,
  LIMIT_MEANING,
  NEXT_STEPS,
  outcomeMeaning,
  READ_FAILURE_MEANING,
  readFailureMeaning,
  REFUSAL_MEANING,
  refusalMeaning,
  type NextStep,
} from '../src/meaning.js';
import { FAIL_CODES, readSteps } from '../src/steps.js';
import { ROOT } from './origin.js';

interface LineSpec {
  id: string;
  pattern: string;
  exit?: number;
}
interface Vector {
  vector: string;
  exit?: number;
  stdout?: string[];
  stderr?: string[];
}

const at = (...p: string[]) => join(ROOT, 'test', 'hpcworker', ...p);
const families = (
  JSON.parse(readFileSync(at('lines.json'), 'utf8')) as {
    families: Record<string, { lines: LineSpec[]; failure_codes?: Record<string, number>; unknown_code_reads_as?: string }>;
  }
).families;
const vectors = readdirSync(at('vectors'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(at('vectors', f), 'utf8')) as Vector);
const vector = (name: string): Vector => {
  const v = vectors.find((x) => x.vector === name);
  if (!v) throw new Error(`no vector ${name}`);
  return v;
};
const codes = Object.keys(families.step!.failure_codes!);
const limits = /\(([^)]+)\)/.exec(families.gate!.lines.find((l) => l.id === 'limit')!.pattern)![1]!.split('|') as GateLimit[];
// every meaning the module gives, by where it comes from
const all: Array<[string, NextStep]> = [
  ...Object.entries(FAILURE_MEANING).map(([k, v]): [string, NextStep] => [`failed ${k}`, v]),
  ['incomplete', INCOMPLETE_MEANING],
  ...Object.entries(LIMIT_MEANING).map(([k, v]): [string, NextStep] => [`limit ${k}`, v]),
  ...Object.entries(REFUSAL_MEANING).map(([k, v]): [string, NextStep] => [k, v]),
  ...Object.entries(READ_FAILURE_MEANING).map(([k, v]): [string, NextStep] => [`read ${k}`, v]),
];

describe('every answer has one next step', () => {
  it("covers every failure code lines.json lists, and only those", () => {
    expect(Object.keys(FAILURE_MEANING).sort()).toEqual([...codes].sort());
    expect(codes).toHaveLength(11);
    for (const c of codes) expect(failureMeaning(c), c).toBe(FAILURE_MEANING[c as keyof typeof FAILURE_MEANING]);
  });

  it('gives an unknown code what other means, as lines.json reads it', () => {
    expect(families.step!.unknown_code_reads_as).toBe('other');
    for (const w of ['brand-new-code', 'signin-later', '', '__proto__', 'constructor']) expect(failureMeaning(w), w).toBe(FAILURE_MEANING.other);
  });

  it("covers every cap the gate's limit pattern names, parsed out of the pattern itself", () => {
    expect(limits.length).toBeGreaterThan(0);
    expect(Object.keys(LIMIT_MEANING).sort()).toEqual([...limits].sort());
    for (const w of limits) expect(refusalMeaning({ kind: 'limit', which: w }), w).toBe(LIMIT_MEANING[w]);
  });

  it('covers every gate line and every key line base reads that comes with an exit status', () => {
    // a new gate line with a status fails here until it has a meaning; limit's caps are covered above
    expect(families.gate!.lines.filter((x) => x.exit !== undefined).map((x) => x.id)).toEqual(['refused', 'limit', 'missing', 'not-plain', 'too-large']);
    expect(refusalMeaning({ kind: 'refused' })).toBe(REFUSAL_MEANING.refused);
    // the key family's lines with a status: expired may come before any verb; stuck is forget's, which only the browser sends
    expect(families.key!.lines.filter((x) => x.exit !== undefined).map((x) => x.id)).toEqual(['stuck', 'expired']);
    expect(refusalMeaning({ kind: 'expired' })).toBe(REFUSAL_MEANING.expired);
    for (const f of ['missing', 'not-plain', 'too-large'] as const) expect(readFailureMeaning(f)).toBe(READ_FAILURE_MEANING[f]);
    // and the one answer that is no gate line: a copy without the gate
    expect(refusalMeaning({ kind: 'no-gate' })).toBe(REFUSAL_MEANING['no-gate']);
    expect(Object.keys(REFUSAL_MEANING).sort()).toEqual(['expired', 'no-gate', 'refused']);
  });

  it('uses only the next steps it declares, and each of them for something', () => {
    for (const [what, step] of all) expect(NEXT_STEPS, what).toContain(step);
    for (const s of NEXT_STEPS) expect(all.map(([, v]) => v), s).toContain(s);
  });
});

describe('what the contract says each answer asks of the student', () => {
  it("V11 5.3's [Sign in again] codes mean the sign-in again; signin-node retries the sign-in, the worker keeping its place", () => {
    for (const c of ['signin-code', 'signin-timeout', 'signin-billed', 'signin-node'] as const) expect(FAILURE_MEANING[c], c).toBe('sign-in-again');
  });

  it('signin-method means the lab lead, since signing in again changes nothing (nothing ever signs out)', () => {
    expect(FAILURE_MEANING['signin-method']).toBe('ask-lead');
  });

  it('the codes V11 5.3 answers with "The grid didn\'t take the request." [Try again] mean retry, as does a connect that never ended', () => {
    for (const c of ['refused', 'signin', 'usage', 'other'] as const) expect(FAILURE_MEANING[c], c).toBe('retry');
    expect(INCOMPLETE_MEANING).toBe('retry');
  });

  it('setup means the lab lead, a restricted workspace another request, and a spent name cap another name', () => {
    expect(FAILURE_MEANING.setup).toBe('ask-lead');
    expect(FAILURE_MEANING.restricted).toBe('fix-request');
    expect(LIMIT_MEANING.names).toBe('fix-request');
  });

  it('no gate answer ever means a Claude sign-in: the gate runs connect with --login never', () => {
    for (const [what, step] of all.filter(([w]) => !w.startsWith('failed ') && w !== 'incomplete')) expect(step, what).not.toBe('sign-in-again');
  });

  it('a cap of time or of a busy moment means later, never now', () => {
    for (const w of ['hourly', 'watch', 'busy'] as const) expect(LIMIT_MEANING[w], w).toBe('retry-later');
  });

  it("V12's expired key means asking again now: the request stopped, and asked again it runs (the browser's transport enrols a new key)", () => {
    expect(REFUSAL_MEANING.expired).toBe('retry');
  });

  it('a refusal, and a copy without the gate, mean the lab lead: only the lab lead brings the lab\'s copy forward (never called outdated, D6)', () => {
    expect(REFUSAL_MEANING.refused).toBe('ask-lead');
    expect(REFUSAL_MEANING['no-gate']).toBe('ask-lead');
  });

  it("read's not-plain and too-large mean the lab lead: the gate never follows a link, and waiting does not shrink a file the job wrote", () => {
    expect(READ_FAILURE_MEANING['not-plain']).toBe('ask-lead');
    expect(READ_FAILURE_MEANING['too-large']).toBe('ask-lead');
    expect(READ_FAILURE_MEANING.missing).toBe('retry-later');
  });
});

describe('the vectors, read and then given their meaning', () => {
  it("gives each connect vector's outcome the meaning of its code, and a done connect none", () => {
    for (const v of vectors.filter((x) => x.vector.startsWith('connect-') || x.vector === 'gate-connect')) {
      const o = readSteps(v.stdout ?? []).outcome;
      if (o.kind === 'done') expect(outcomeMeaning(o), v.vector).toBeUndefined();
      else if (o.kind === 'failed') expect(outcomeMeaning(o), v.vector).toBe(FAILURE_MEANING[o.code]);
      else throw new Error(`${v.vector} never ended`);
    }
    expect(outcomeMeaning({ kind: 'incomplete' })).toBe(INCOMPLETE_MEANING);
    expect(outcomeMeaning({ kind: 'failed', code: 'other', sentence: '' })).toBe(FAILURE_MEANING.other);
    expect(Object.keys(FAIL_CODES)).toEqual(codes);
  });

  it("gives gate-refused and gate-read-missing their meanings through the gate's readers", () => {
    const refused = vector('gate-refused');
    expect(refusalMeaning(gateRefusal((refused.stdout ?? []).join('\n'), refused.exit)!)).toBe('ask-lead');
    const missing = vector('gate-read-missing');
    expect(readFailureMeaning(gateReadFailure((missing.stderr ?? []).join('\n'), missing.exit)!)).toBe('retry-later');
  });

  it("gives read's other failures, which no vector shows, their meanings through the reader, each on standard error with lines.json's exit status", () => {
    for (const f of ['not-plain', 'too-large'] as const) {
      const line = families.gate!.lines.find((l) => l.id === f)!;
      const said = line.pattern.replace(/^\^/, '').replace(/\$$/, '');
      expect(readFailureMeaning(gateReadFailure(`${said}\n`, line.exit)!), f).toBe('ask-lead');
    }
  });

  it('gives a copy without the gate its meaning through the reader, from standard error with exit 1', () => {
    expect(refusalMeaning(gateRefusal('', 1, "hpcworker: unknown command 'gate' (hpcworker help)\n")!)).toBe('ask-lead');
  });
});
