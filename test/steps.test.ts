// src/steps.ts against hpcworker's `contract` export, pinned in test/hpcworker/ (test data, never
// edited): every pattern, code, exit status, order and sentence typed in the module is held equal to
// lines.json, and every vector the real writer printed is read through the reader that reads it (the
// interface standard's rule 4). A new pull that moves one of them fails here until the module moves.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cleanLine,
  DONE_EXIT,
  exitStatusOf,
  FAIL_CODES,
  failCodeOf,
  KEEPALIVE,
  parseProgressLine,
  parseStepLine,
  PROGRESS_LINE,
  PROGRESS_SENTENCES,
  progressLines,
  readSteps,
  STEP_LINES,
  STEP_ORDER,
  UNKNOWN_CODE_READS_AS,
  type Step,
} from '../src/steps.js';
import { ROOT } from './origin.js';

interface LineSpec {
  id: string;
  pattern: string;
  groups?: string[];
  exit?: number;
}
interface Family {
  lines?: LineSpec[];
  order?: string[];
  rules?: string[];
  failure_codes?: Record<string, number>;
  unknown_code_reads_as?: string;
  keepalive?: string;
  line_pattern?: string;
  sentences?: Array<{ id: string; text: string; argument?: string }>;
}
interface Vector {
  vector: string;
  kind: 'command' | 'file';
  exit?: number;
  stdout?: string[];
  stderr?: string[];
  lines?: string[];
}

const at = (...p: string[]) => join(ROOT, 'test', 'hpcworker', ...p);
const families = (JSON.parse(readFileSync(at('lines.json'), 'utf8')) as { families: Record<string, Family> }).families;
const step = families.step!;
const progress = families.progress!;
const vectors = readdirSync(at('vectors'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(at('vectors', f), 'utf8')) as Vector);
const vector = (name: string): Vector => {
  const v = vectors.find((x) => x.vector === name);
  if (!v) throw new Error(`no vector ${name}`);
  return v;
};
const commands = vectors.filter((v) => v.kind === 'command');
const connects = commands.filter((v) => v.vector.startsWith('connect-') || v.vector === 'gate-connect');
// a step's fields, by the name lines.json gives its group
const FIELD: Record<string, string> = { how: 'how', job: 'job', run_dir: 'runDir', email: 'email', plan: 'plan', code: 'code', sentence: 'sentence' };

describe('the step family, equal to lines.json', () => {
  it('has every step line, by its id and in its order, each pattern equal to the export', () => {
    expect(Object.keys(STEP_LINES)).toEqual(step.lines!.map((l) => l.id));
    for (const l of step.lines!) expect(STEP_LINES[l.id as keyof typeof STEP_LINES].source, l.id).toBe(l.pattern);
    // and no flag: a multiline flag would read a step out of the middle of text that is no step line
    for (const [id, re] of Object.entries(STEP_LINES)) expect(re.flags, id).toBe('');
  });

  it("keeps lines.json's order of the steps", () => {
    expect([...STEP_ORDER]).toEqual(step.order);
  });

  it('has all 11 failure codes, each with the exit status lines.json gives it, in its order', () => {
    expect(Object.entries(FAIL_CODES)).toEqual(Object.entries(step.failure_codes!));
    expect(Object.keys(FAIL_CODES)).toHaveLength(11);
    expect(UNKNOWN_CODE_READS_AS).toBe(step.unknown_code_reads_as);
  });

  it('implements exactly the rules lines.json states for the family, so a new rule fails here until it is read', () => {
    expect(step.rules).toEqual([
      'each step line at most once, in this order',
      'nothing follows a failed line',
      'the exit status is 0 after done, else the failure code\'s',
    ]);
    expect(DONE_EXIT).toBe(0);
  });

  it("removes the login family's keepalive, as lines.json names it", () => {
    expect(KEEPALIVE).toBe(families.login!.keepalive);
    expect(families.login!.lines!.find((l) => l.id === 'keepalive')!.pattern).toBe(`^${KEEPALIVE}$`);
  });

  it("gives each step only the fields its lines.json groups name", () => {
    const seen = new Set<string>();
    for (const v of commands) {
      for (const raw of v.stdout ?? []) {
        const s = parseStepLine(raw);
        if (!s) continue;
        seen.add(s.id);
        const groups = (step.lines!.find((l) => l.id === s.id)!.groups ?? []).map((g) => FIELD[g]);
        for (const k of Object.keys(s).filter((k) => k !== 'id')) expect(groups, `${v.vector}: ${s.id}.${k}`).toContain(k);
      }
    }
    // the vectors show every step line at least once
    expect([...seen].sort()).toEqual(step.lines!.map((l) => l.id).sort());
  });
});

describe('every command vector, read line by line', () => {
  it('reads each HPCW-STEP line as a step and every other line as text, and keeps the order the real writer printed', () => {
    for (const v of commands) {
      const out = v.stdout ?? [];
      const stepLines = out.filter((l) => cleanLine(l).startsWith('HPCW-STEP '));
      for (const l of out) expect(parseStepLine(l) !== undefined, `${v.vector}: ${l}`).toBe(stepLines.includes(l));
      const r = readSteps(out);
      expect(r.steps, v.vector).toHaveLength(stepLines.length);
      expect(r.inOrder, v.vector).toBe(true);
    }
  });

  it('ends each connect-failed-<code> vector in failed <code>, with the exit status the vector exited with', () => {
    const failed = connects.filter((v) => v.vector.startsWith('connect-failed-'));
    // every code but other has a vector of the real writer
    const codes = failed.map((v) => v.vector.slice('connect-failed-'.length));
    for (const c of Object.keys(FAIL_CODES).filter((c) => c !== 'other')) expect(codes, c).toContain(c);
    for (const v of failed) {
      const code = v.vector.slice('connect-failed-'.length);
      const r = readSteps(v.stdout!);
      const last = v.stdout![v.stdout!.length - 1]!;
      expect(r.outcome, v.vector).toEqual({ kind: 'failed', code, sentence: last.slice(`HPCW-STEP failed ${code} `.length) });
      expect(exitStatusOf(r.outcome), v.vector).toBe(v.exit);
      expect(FAIL_CODES[code as keyof typeof FAIL_CODES], v.vector).toBe(v.exit);
    }
  });

  it('reads connect-first-run, -kept, -never, -returning and the gate\'s connect in order to done, with exit 0', () => {
    const names = ['connect-first-run', 'connect-kept', 'connect-never', 'connect-returning', 'gate-connect'];
    for (const name of names) {
      const v = vector(name);
      const r = readSteps(v.stdout!);
      expect(r.outcome, name).toEqual({ kind: 'done' });
      expect(r.inOrder, name).toBe(true);
      expect(exitStatusOf(r.outcome), name).toBe(v.exit);
      expect(v.exit, name).toBe(0);
      const ranks = r.steps.map((s) => (STEP_ORDER as readonly string[]).indexOf(s.id));
      expect(ranks, name).toEqual([...ranks].sort((a, b) => a - b));
    }
    expect(connects.filter((v) => !v.vector.startsWith('connect-failed-')).map((v) => v.vector).sort()).toEqual([...names].sort());
  });

  it('reads the fields of a first run: setup changed, the job, new and its run folder, the account and plan', () => {
    expect(readSteps(vector('connect-first-run').stdout!).steps).toEqual<Step[]>([
      { id: 'setup', how: 'changed' },
      { id: 'consent' },
      { id: 'queued', job: '40501234', how: 'new', runDir: '/scratch/home/state/worker' },
      { id: 'signin' },
      { id: 'signed-in', email: 'st1234@wayne.edu', plan: 'max' },
      { id: 'done' },
    ]);
    expect(readSteps(vector('connect-kept').stdout!).steps[1]).toEqual({ id: 'queued', job: '40500019', how: 'kept', runDir: '/scratch/home/state/worker' });
  });
});

describe('one step line', () => {
  it('reads "-" for a field Claude Code did not give as absent, never as the word', () => {
    expect(parseStepLine('HPCW-STEP signed-in - -')).toEqual({ id: 'signed-in' });
    expect(parseStepLine('HPCW-STEP signed-in a@b.edu -')).toEqual({ id: 'signed-in', email: 'a@b.edu' });
    expect(parseStepLine('HPCW-STEP signed-in - pro')).toEqual({ id: 'signed-in', plan: 'pro' });
  });

  it('reads a queued line without its optional run folder, and a run folder with spaces to the end of the line', () => {
    expect(parseStepLine('HPCW-STEP queued 7 new')).toEqual({ id: 'queued', job: '7', how: 'new' });
    expect(parseStepLine('HPCW-STEP queued 7 kept /a b/c')).toEqual({ id: 'queued', job: '7', how: 'kept', runDir: '/a b/c' });
  });

  it("keeps a failed line's sentence as written after its one space, white space at its start included", () => {
    expect(parseStepLine('HPCW-STEP failed setup  two')).toEqual({ id: 'failed', code: 'setup', sentence: ' two' });
    expect(parseStepLine('HPCW-STEP failed setup \tx')).toEqual({ id: 'failed', code: 'setup', sentence: '\tx' });
  });

  it("refuses a PBS job id (7890123.pbsserver01, hpcworker's own pbs_parse_submit keeps it whole) as lines.json does today: the queued line is no step (design 6.1)", () => {
    // framework/lib/adapters/pbs.sh at 3b22e70 and its test_adapters.py:83; lines.json's queued
    // pattern takes digits only. When hpcworker widens the pattern this turns red, and steps.ts follows.
    expect(parseStepLine('HPCW-STEP queued 7890123.pbsserver01 new /scratch/w')).toBeUndefined();
    expect(STEP_LINES.queued.test('HPCW-STEP queued 7890123[1].pbsserver01 new')).toBe(false);
    const r = readSteps(['HPCW-STEP setup ready', 'HPCW-STEP queued 7890123.pbsserver01 new /scratch/w', 'HPCW-STEP done']);
    expect(r).toEqual({ steps: [{ id: 'setup', how: 'ready' }, { id: 'done' }], outcome: { kind: 'done' }, inOrder: true });
  });

  it('reads an unknown failure code as other, which exits 1, and keeps the sentence', () => {
    expect(parseStepLine('HPCW-STEP failed brand-new-code what the copy said')).toEqual({ id: 'failed', code: 'other', sentence: 'what the copy said' });
    const r = readSteps(['HPCW-STEP setup ready', 'HPCW-STEP failed brand-new-code']);
    expect(r.outcome).toEqual({ kind: 'failed', code: 'other', sentence: '' });
    expect(exitStatusOf(r.outcome)).toBe(1);
    for (const w of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '']) expect(failCodeOf(w), w).toBe('other');
    for (const c of Object.keys(FAIL_CODES)) expect(failCodeOf(c)).toBe(c);
  });

  it('removes terminal codes, carriage returns and a glued keepalive before matching, and matches nothing else', () => {
    expect(parseStepLine('\x1b[32mHPCW-STEP done\x1b[0m\r')).toEqual({ id: 'done' });
    expect(parseStepLine('\x1b]0;warrior\x07HPCW-STEP consent')).toEqual({ id: 'consent' });
    expect(parseStepLine('\x1b[?2004hHPCW-STEP signin')).toEqual({ id: 'signin' });
    expect(parseStepLine(`HPCW-STEP done${KEEPALIVE}`)).toEqual({ id: 'done' });
    expect(parseStepLine(`${KEEPALIVE}HPCW-STEP setup ready`)).toEqual({ id: 'setup', how: 'ready' });
    expect(parseStepLine(`HPCW-STEP queued 12 new /x${KEEPALIVE}`)).toEqual({ id: 'queued', job: '12', how: 'new', runDir: '/x' });
    expect(cleanLine(`  ${KEEPALIVE}\r `)).toBe('');
    expect(parseStepLine(KEEPALIVE)).toBeUndefined();
    // a whole line only: not after other text, not a bare word, not a near miss
    for (const l of ['echo HPCW-STEP done', 'HPCW-STEP setup', 'HPCW-STEP setup readyish', 'HPCW-STEP queued x new', 'HPCW-STEP signed-in a@b', 'HPCW-STEP failed BAD', 'HPCW-STEP done now']) {
      expect(parseStepLine(l), l).toBeUndefined();
    }
  });
});

describe('cleanLine: the union of the terminal codes hpcworker, desktop and the browser strip', () => {
  // hpcworker's hpcw_strip_codes (framework/lib/adapters/common.sh at 3b22e70) and the browser's ANSI
  // (extension/src/core/contract.ts at ae11a00) strip an OSC, a CSI with parameters [0-9;?] and a charset
  // designation; desktop's cleaner (9ce98bb) an OSC, a CSI with parameters [0-?] and one escape and a byte
  // of 0x40-0x5F. A code any of them strips is stripped here, so no edition reads less than it did.
  it("strips a charset designation, ESC ( B as `tput sgr0` prints it, which hpcworker and the browser strip", () => {
    expect(parseStepLine('\x1b(B\x1b[mHPCW-STEP done')).toEqual({ id: 'done' });
    expect(readSteps(['HPCW-STEP setup ready', '\x1b(B\x1b[mHPCW-STEP done'])).toMatchObject({ outcome: { kind: 'done' }, inOrder: true });
    for (const c of ['\x1b(B', '\x1b)0', '\x1b(0', '\x1b(A', '\x1b)B', '\x1b(a', '\x1b)z']) expect(cleanLine(`${c}HPCW-STEP consent${c}`), JSON.stringify(c)).toBe('HPCW-STEP consent');
  });

  it('strips one escape and one byte of 0x40-0x5F (ESC M, ESC D, ESC \\), as desktop does', () => {
    expect(parseStepLine('\x1bMHPCW-STEP done')).toEqual({ id: 'done' });
    for (const c of ['\x1bM', '\x1bD', '\x1bE', '\x1bc', '\x1b\\', '\x1b_']) {
      const want = c === '\x1bc' ? `${c}HPCW-STEP done` : 'HPCW-STEP done';
      expect(cleanLine(`${c}HPCW-STEP done`), JSON.stringify(c)).toBe(want);
    }
  });

  it('strips an OSC ended by BEL or by ST (ESC \\), two of them on one line, and never across an escape inside one', () => {
    expect(parseStepLine('\x1b]0;warrior\x1b\\HPCW-STEP done')).toEqual({ id: 'done' });
    expect(parseStepLine('\x1b]0;a\x1b\\HPCW-STEP done\x1b]0;b\x07')).toEqual({ id: 'done' });
    expect(parseStepLine('\x1b]0;a\x07HPCW-STEP done\x1b]2;b\x1b\\')).toEqual({ id: 'done' });
    // an escape inside an OSC ends it there, as hpcworker's sed and the browser's ANSI end it, so an OSC
    // body never runs over an inner code to a later BEL, whether it is read lazily or greedily
    expect(cleanLine('\x1b]0;a\x1b[1mb\x07HPCW-STEP done')).toBe('0;ab\x07HPCW-STEP done');
    expect(parseStepLine('\x1b]0;a\x1b[1mb\x07HPCW-STEP done')).toBeUndefined();
  });

  it('strips a CSI with intermediate bytes (ESC [0 q, a cursor shape) and with private parameters (ESC [>4;1m)', () => {
    expect(parseStepLine('\x1b[0 qHPCW-STEP done')).toEqual({ id: 'done' });
    expect(parseStepLine('\x1b[>4;1mHPCW-STEP done\x1b[<u')).toEqual({ id: 'done' });
    expect(parseStepLine('\x1b[38:5:1mHPCW-STEP done')).toEqual({ id: 'done' });
  });

  it('strips a CSI whatever its final byte in 0x40-0x7E, a letter or not (ESC [2@, ESC [3~, ESC [5`, ESC [1{)', () => {
    for (const c of ['\x1b[2@', '\x1b[3~', '\x1b[5`', '\x1b[1{', '\x1b[|', '\x1b[0^', '\x1b[_', '\x1b[}', '\x1b[1[', '\x1b[\\', '\x1b[]']) {
      expect(cleanLine(`a${c}b`), JSON.stringify(c)).toBe('ab');
      expect(parseStepLine(`${c}HPCW-STEP done`), JSON.stringify(c)).toEqual({ id: 'done' });
    }
  });

  it('leaves ESC 7, ESC 8, ESC = and ESC >, which none of the three strips (design 15.4), so a line after one reads as text', () => {
    for (const c of ['\x1b7', '\x1b8', '\x1b=', '\x1b>']) expect(parseStepLine(`${c}HPCW-STEP done`), JSON.stringify(c)).toBeUndefined();
  });

  it('drops a carriage return anywhere in a line, not only at its end', () => {
    expect(parseStepLine('HPCW-STEP queued 7 new /a\rb')).toEqual({ id: 'queued', job: '7', how: 'new', runDir: '/ab' });
    expect(parseStepLine('HPCW-STEP setup\r ready')).toEqual({ id: 'setup', how: 'ready' });
    expect(cleanLine('a\rb\r\rc')).toBe('abc');
  });

  it("strips a NUL anywhere, first, as hpcworker's hpcw_strip_codes does with `tr -d '\\000'` before its sed", () => {
    expect(parseStepLine('\x00HPCW-STEP done')).toEqual({ id: 'done' });
    expect(parseStepLine('HPCW-STEP\x00 done\x00')).toEqual({ id: 'done' });
    // removed before the codes, so a NUL inside a code leaves the code whole to be stripped
    expect(parseStepLine('\x1b[3\x002mHPCW-STEP done\x1b[\x00m')).toEqual({ id: 'done' });
    expect(cleanLine('\x00 \x00')).toBe('');
  });

  it('removes every glued keepalive, not only the first', () => {
    expect(parseStepLine(`${KEEPALIVE}HPCW-STEP done${KEEPALIVE}`)).toEqual({ id: 'done' });
    expect(parseStepLine(`HPCW-STEP queued 7 new /a${KEEPALIVE}b${KEEPALIVE}`)).toEqual({ id: 'queued', job: '7', how: 'new', runDir: '/ab' });
    expect(cleanLine(`${KEEPALIVE}${KEEPALIVE}`)).toBe('');
  });
});

describe("a transcript that breaks the family's rules", () => {
  const ok = vector('connect-returning').stdout!;

  it('is flagged when a step comes out of order or twice, and keeps its outcome', () => {
    const swapped = [ok[2]!, ok[0]!, ok[1]!, ...ok.slice(3)];
    expect(readSteps(swapped)).toMatchObject({ inOrder: false, outcome: { kind: 'done' } });
    const twice = [ok[0]!, ok[0]!, ...ok.slice(1)];
    expect(readSteps(twice)).toMatchObject({ inOrder: false, outcome: { kind: 'done' } });
  });

  it('is flagged when anything follows a failed line, a step or any other text, and the first failure stands', () => {
    const failed = vector('connect-failed-refused').stdout!;
    expect(readSteps([...failed, 'HPCW-STEP done'])).toMatchObject({ inOrder: false, outcome: { kind: 'failed', code: 'refused' } });
    expect(readSteps([...failed, 'HPCW-STEP failed other again'])).toMatchObject({ inOrder: false, outcome: { kind: 'failed', code: 'refused' } });
    expect(readSteps([...failed, 'Connection to grid closed.'])).toMatchObject({ inOrder: false, outcome: { kind: 'failed', code: 'refused' } });
    // a keepalive or an empty line is no line at all once cleaned
    expect(readSteps([...failed, KEEPALIVE, '', '\r'])).toMatchObject({ inOrder: true, outcome: { kind: 'failed', code: 'refused' } });
  });

  it('is flagged when a step line follows done, and done stands', () => {
    expect(readSteps([...ok, 'HPCW-STEP failed refused late'])).toMatchObject({ inOrder: false, outcome: { kind: 'done' } });
    // other text after done breaks no rule of the family
    expect(readSteps([...ok, 'logout'])).toMatchObject({ inOrder: true, outcome: { kind: 'done' } });
  });

  it('is incomplete when it never says done or failed, with no exit status', () => {
    const cut = vector('connect-first-run').stdout!.slice(0, -1);
    const r = readSteps(cut);
    expect(r).toMatchObject({ inOrder: true, outcome: { kind: 'incomplete' } });
    expect(exitStatusOf(r.outcome)).toBeUndefined();
    expect(readSteps([])).toEqual({ steps: [], outcome: { kind: 'incomplete' }, inOrder: true });
  });
});

describe('progress.log, equal to lines.json', () => {
  it("has lines.json's line pattern, its sentences by id, text and argument in order, and its three rules", () => {
    expect(PROGRESS_LINE.source).toBe(progress.line_pattern);
    expect(PROGRESS_LINE.flags).toBe('');
    expect(PROGRESS_SENTENCES.map((s) => [s.id, s.text, 'argument' in s])).toEqual(progress.sentences!.map((s) => [s.id, s.text, s.argument !== undefined]));
    expect(progress.rules).toEqual([
      'the longest sentence that matches wins',
      'a sentence with an argument is followed by ": " and the argument',
      'any other line is for Details only',
    ]);
  });

  it('reads progress-queued and progress-stopped to their ids, with the link as online\'s argument', () => {
    expect(progressLines(vector('progress-queued').lines!.join('\n'))).toEqual([{ at: '2026-10-01T12:00:00Z', text: 'Asked the grid for a computer', id: 'asked' }]);
    const stopped = progressLines(vector('progress-stopped').lines!.join('\n'));
    expect(stopped.map((p) => p.id)).toEqual(['asked', 'got-computer', 'connecting', 'online', 'stopped']);
    expect(stopped[3]!.argument).toBe('https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt');
    for (const [i, p] of stopped.entries()) expect(`${p.at} ${p.text}`).toBe(vector('progress-stopped').lines![i]);
  });

  it("reads the gate's read of progress.log the same, after whatever a ~/.bashrc printed first", () => {
    const v = vector('gate-read-progress');
    expect(progressLines(['Welcome to the grid', '\x1b[1mmotd\x1b[0m', ...v.stdout!].join('\r\n'))).toEqual([{ at: '2026-10-01T12:00:00Z', text: 'Asked the grid for a computer', id: 'asked' }]);
  });

  it("reads the abandoned sign-in and a plain stop each to its own id, and any other 'Stopped: ...' as Details only", () => {
    const t = '2026-10-01T12:00:00Z ';
    expect(parseProgressLine(`${t}Stopped: waiting for your Claude sign-in timed out`)?.id).toBe('signin-abandoned');
    expect(parseProgressLine(`${t}Stopped`)?.id).toBe('stopped');
    expect(parseProgressLine(`${t}Stopped: by the lab`)).toEqual({ at: '2026-10-01T12:00:00Z', text: 'Stopped: by the lab' });
  });

  it("matches no line to two of lines.json's sentences, so 'the longest wins' decides nothing today; a sentence that overlaps another turns this red, and the rule gets its test then", () => {
    // lines.json's own matching, written again here: whole, or "<sentence>:" and "<sentence>: <argument>" for one that takes it
    const matches = (s: { text: string; argument?: string }, line: string) => (s.argument === undefined ? line === s.text : line === `${s.text}:` || line.startsWith(`${s.text}: `));
    const candidates = progress.sentences!.flatMap((s) => [s.text, `${s.text}:`, `${s.text}: x`, `${s.text}: ${s.text}`]);
    for (const line of candidates) expect(progress.sentences!.filter((s) => matches(s, line)).length, line).toBeLessThanOrEqual(1);
  });

  it('reads an argument only after ": ", and an empty one the writer left as "<sentence>:" once trimmed', () => {
    const t = '2026-10-01T12:00:00Z ';
    expect(parseProgressLine(`${t}Couldn't start: the image is missing`)).toEqual({ at: '2026-10-01T12:00:00Z', text: "Couldn't start: the image is missing", id: 'error', argument: 'the image is missing' });
    expect(parseProgressLine(`${t}Couldn't start: `)).toEqual({ at: '2026-10-01T12:00:00Z', text: "Couldn't start:", id: 'error', argument: '' });
    // everything after ": ", white space at its start included
    expect(parseProgressLine(`${t}Online:  x`)?.argument).toBe(' x');
    expect(parseProgressLine(`${t}Couldn't start: \tno image`)?.argument).toBe('\tno image');
    // a sentence that takes an argument, written without one, is no line the writer prints: Details only
    expect(parseProgressLine(`${t}Online`)).toEqual({ at: '2026-10-01T12:00:00Z', text: 'Online' });
    expect(parseProgressLine(`${t}Online:x`)).toEqual({ at: '2026-10-01T12:00:00Z', text: 'Online:x' });
    // a sentence with no argument takes none
    expect(parseProgressLine(`${t}Renewing: now`)).toEqual({ at: '2026-10-01T12:00:00Z', text: 'Renewing: now' });
  });

  it('reads every sentence of lines.json to its own id, and any other timed line as Details only', () => {
    for (const s of PROGRESS_SENTENCES) {
      const text = 'argument' in s ? `${s.text}: x` : s.text;
      expect(parseProgressLine(`2026-01-02T03:04:05Z ${text}`)?.id, s.id).toBe(s.id);
    }
    expect(parseProgressLine('2026-01-02T03:04:05Z Something new')).toEqual({ at: '2026-01-02T03:04:05Z', text: 'Something new' });
    for (const l of ['Asked the grid for a computer', '2026-01-02 03:04:05 Got a computer', '2026-01-02T03:04:05Z', '2026-01-02T03:04:05Z ', '']) expect(parseProgressLine(l), l).toBeUndefined();
  });
});
