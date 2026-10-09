// What `hpcworker connect` and a run's progress.log say, as a client reads them: the `HPCW-STEP`
// lines (lines.json family "step"; V11_CONTRACT.md 5.2 and 5.3), the failure codes with the exit
// status each comes with, the rules a whole connect transcript keeps, and progress.log's lines (family
// "progress"; V11 section 11). hpcworker is canonical for every line here: its `contract` export holds
// the patterns, the codes, the sentences and what its real writer printed, and test/steps.test.ts
// holds each one below equal to that export and runs every vector through the reader that reads it.
// A line changes in hpcworker first, then here.
//
// Base reads and names; it writes no line and no word a student reads. A failure's sentence and a
// progress.log line are hpcworker's words, passed through for Details; what a code means for the
// student's next step is meaning.ts, and each edition says it in its own words. The sign-in sitting's
// lines (family "login": HPCW-LOGIN, AUTH-URL, SIGNED-IN) stay in the browser, the one edition that
// runs the sitting itself (design section 2); only the keepalive is here, because every reader of
// these lines removes it.

/** lines.json family "login": the keepalive line, removed wherever it appears inside a line */
export const KEEPALIVE = 'HPCW-LOGIN: still waiting';

// ECMA-48: a control sequence (CSI), an operating system command (OSC), a charset designation (ESC ( or
// ESC ) and one byte, as `tput sgr0` prints ESC ( B), or one escape and a byte of 0x40-0x5F; and before
// them a NUL, which hpcworker's hpcw_strip_codes removes first (`tr -d '\000'`). lines.json names no
// set; this is the union of what hpcw_strip_codes (3b22e70), the browser's ANSI (ae11a00) and desktop's
// cleaner (9ce98bb) strip, so no reader loses a line another one reads. None of them strips ESC 7,
// ESC 8, ESC = or ESC > (design 15.4)
const TERMINAL_CODE = /\x1b(?:\[[0-?]*[ -\/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[()][A-Za-z0-9]|[@-Z\\-_])/g;

/** what a line is read as (lines.json): NULs and then terminal codes stripped, carriage returns dropped, any glued keepalive removed, trimmed */
export function cleanLine(raw: string): string {
  return raw.replace(/\x00/g, '').replace(TERMINAL_CODE, '').replace(/\r/g, '').split(KEEPALIVE).join('').trim();
}

// ---- HPCW-STEP (family "step") --------------------------------------------------------------------

/** each step line by its lines.json id, matched whole on a cleaned line */
export const STEP_LINES = {
  setup: /^HPCW-STEP setup (ready|changed)$/,
  consent: /^HPCW-STEP consent$/,
  queued: /^HPCW-STEP queued ([0-9]+) (new|kept)(?: (.+))?$/,
  signin: /^HPCW-STEP signin$/,
  'signed-in': /^HPCW-STEP signed-in (\S+) (\S+)$/,
  done: /^HPCW-STEP done$/,
  failed: /^HPCW-STEP failed ([a-z-]+)(?: (.*))?$/,
} as const;

/** the order connect prints them in, each at most once (V11 5.2); `failed` may end it at any point */
export const STEP_ORDER = ['setup', 'consent', 'queued', 'signin', 'signed-in', 'done'] as const;

/**
 * Every failure code connect prints after "HPCW-STEP failed", with the exit status it exits with
 * (V11 5.2's table). Framework 17 added signin-billed and signin-method; a framework 16 copy says
 * plain signin there, which still parses.
 */
export const FAIL_CODES = {
  other: 1,
  usage: 2,
  setup: 3,
  restricted: 4,
  refused: 5,
  'signin-node': 6,
  'signin-code': 7,
  'signin-timeout': 7,
  'signin-billed': 7,
  'signin-method': 7,
  signin: 7,
} as const;
export type FailCode = keyof typeof FAIL_CODES;

/** what a code this module does not know reads as: a new code from a newer copy never breaks an older client (design 6.2) */
export const UNKNOWN_CODE_READS_AS = 'other' satisfies FailCode;

/** connect's exit status after "HPCW-STEP done" */
export const DONE_EXIT = 0;

/** a failure word as a code: one of FAIL_CODES, else `other` */
export function failCodeOf(word: string): FailCode {
  return Object.hasOwn(FAIL_CODES, word) ? (word as FailCode) : UNKNOWN_CODE_READS_AS;
}

/** one step line, by its lines.json id, with its groups; "-" (Claude Code did not say) reads as absent */
export type Step =
  | { id: 'setup'; how: 'ready' | 'changed' }
  | { id: 'consent' }
  | { id: 'queued'; job: string; how: 'new' | 'kept'; runDir?: string }
  | { id: 'signin' }
  | { id: 'signed-in'; email?: string; plan?: string }
  | { id: 'done' }
  /** the sentence is hpcworker's, for Details only; it may be empty */
  | { id: 'failed'; code: FailCode; sentence: string };

/** a line already cleaned -> its step, or undefined when it is no step line of this grammar */
function stepOf(line: string): Step | undefined {
  let m: RegExpExecArray | null;
  if ((m = STEP_LINES.setup.exec(line))) return { id: 'setup', how: m[1] === 'changed' ? 'changed' : 'ready' };
  if (STEP_LINES.consent.test(line)) return { id: 'consent' };
  if ((m = STEP_LINES.queued.exec(line))) {
    return { id: 'queued', job: m[1] ?? '', how: m[2] === 'kept' ? 'kept' : 'new', ...(m[3] === undefined ? {} : { runDir: m[3] }) };
  }
  if (STEP_LINES.signin.test(line)) return { id: 'signin' };
  if ((m = STEP_LINES['signed-in'].exec(line))) {
    // "-" for a field Claude Code did not give (lines.json's note): absent, never the word "-"
    const [, email, plan] = m;
    return { id: 'signed-in', ...(email === undefined || email === '-' ? {} : { email }), ...(plan === undefined || plan === '-' ? {} : { plan }) };
  }
  if (STEP_LINES.done.test(line)) return { id: 'done' };
  if ((m = STEP_LINES.failed.exec(line))) return { id: 'failed', code: failCodeOf(m[1] ?? ''), sentence: m[2] ?? '' };
  return undefined;
}

/** one line as connect printed it -> its step, or undefined for any other line (text for a person, never an event) */
export function parseStepLine(raw: string): Step | undefined {
  return stepOf(cleanLine(raw));
}

/** how a connect ended: done, failed with its code and hpcworker's sentence, or neither (the stream closed first) */
export type StepOutcome = { kind: 'done' } | { kind: 'failed'; code: FailCode; sentence: string } | { kind: 'incomplete' };

export interface StepReading {
  /** every step line, in the order read, those after the end included */
  steps: Step[];
  /** the first done or failed line; incomplete when there was neither */
  outcome: StepOutcome;
  /**
   * whether the transcript kept the family's rules: each step line at most once and in STEP_ORDER,
   * no step line after the end, and nothing at all after a failed line. False says the copy on the
   * grid and this reader disagree, a fact for Details and the lab lead; the outcome stands either way.
   */
  inOrder: boolean;
}

/**
 * A whole connect transcript (its standard output, one string per line) read by lines.json's rules for
 * the family: "each step line at most once, in this order", "nothing follows a failed line". Lines
 * that are no step line are skipped (the sitting's lines are the browser's, a ~/.bashrc's are noise).
 */
export function readSteps(lines: readonly string[]): StepReading {
  const steps: Step[] = [];
  let outcome: StepOutcome = { kind: 'incomplete' };
  let inOrder = true;
  let rank = -1;
  let ended = false;
  let failed = false;
  for (const raw of lines) {
    const line = cleanLine(raw);
    if (line === '') continue;
    // "nothing follows a failed line": not a step, and not a word of anything else either
    if (failed) inOrder = false;
    const step = stepOf(line);
    if (step === undefined) continue;
    steps.push(step);
    if (ended) {
      inOrder = false;
      continue;
    }
    if (step.id === 'failed') {
      outcome = { kind: 'failed', code: step.code, sentence: step.sentence };
      ended = true;
      failed = true;
      continue;
    }
    const r = (STEP_ORDER as readonly string[]).indexOf(step.id);
    if (r <= rank) inOrder = false;
    else rank = r;
    if (step.id === 'done') {
      outcome = { kind: 'done' };
      ended = true;
    }
  }
  return { steps, outcome, inOrder };
}

/** "the exit status is 0 after done, else the failure code's": undefined for a connect that never said how it ended */
export function exitStatusOf(outcome: StepOutcome): number | undefined {
  if (outcome.kind === 'done') return DONE_EXIT;
  if (outcome.kind === 'failed') return FAIL_CODES[outcome.code];
  return undefined;
}

// ---- progress.log (family "progress") -----------------------------------------------------------

/** a progress.log line: the time (UTC), one space, the rest */
export const PROGRESS_LINE = /^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z) (.+)$/;

/**
 * The sentences the job and `worker start` write, by lines.json's ids. They are hpcworker's words and
 * serve here as match keys only: base never shows one, and an edition shows its own words for an id.
 * A sentence marked `argument` is followed by ": " and the argument (the link for online, the job's
 * message for error).
 */
export const PROGRESS_SENTENCES = [
  { id: 'asked', text: 'Asked the grid for a computer' },
  { id: 'got-computer', text: 'Got a computer' },
  { id: 'connecting', text: 'Connecting to Claude' },
  { id: 'online', text: 'Online', argument: true },
  { id: 'waiting-signin', text: 'Waiting for your Claude sign-in' },
  { id: 'reconnecting', text: 'Reconnecting' },
  { id: 'renewing', text: 'Renewing' },
  { id: 'ended', text: 'Ended' },
  { id: 'stopped', text: 'Stopped' },
  { id: 'signin-abandoned', text: 'Stopped: waiting for your Claude sign-in timed out' },
  { id: 'error', text: "Couldn't start", argument: true },
] as const;
export type ProgressId = (typeof PROGRESS_SENTENCES)[number]['id'];

export interface ProgressLine {
  /** the line's time as written, YYYY-MM-DDTHH:MM:SSZ */
  at: string;
  /** everything after the time: hpcworker's words, for Details */
  text: string;
  /** the sentence it is; absent for a line that is for Details only */
  id?: ProgressId;
  /** what follows "<sentence>: " for a sentence that takes one ("" when the writer had nothing to put there) */
  argument?: string;
}

/**
 * One line of progress.log -> its time, its text and the sentence it is, by lines.json's rules: "the
 * longest sentence that matches wins", "a sentence with an argument is followed by ': ' and the
 * argument", "any other line is for Details only" (no id). Undefined for a line with no time, which is
 * not progress.log's (a ~/.bashrc's, read through the gate). With lines.json's sentences today no line
 * matches two of them (test/steps.test.ts holds that), so the first rule decides nothing yet; it is
 * kept for a sentence that overlaps another, which gets a test of the rule when it comes.
 */
export function parseProgressLine(raw: string): ProgressLine | undefined {
  const m = PROGRESS_LINE.exec(cleanLine(raw));
  if (!m) return undefined;
  const at = m[1] ?? '';
  const text = m[2] ?? '';
  let best: { id: ProgressId; length: number; argument?: string } | undefined;
  for (const s of PROGRESS_SENTENCES) {
    if (best !== undefined && s.text.length <= best.length) continue;
    if ('argument' in s) {
      // the writer puts ": " and the argument; an empty argument leaves "<sentence>:" once the line is trimmed
      if (text === `${s.text}:`) best = { id: s.id, length: s.text.length, argument: '' };
      else if (text.startsWith(`${s.text}: `)) best = { id: s.id, length: s.text.length, argument: text.slice(s.text.length + 2) };
    } else if (text === s.text) {
      best = { id: s.id, length: s.text.length };
    }
  }
  if (best === undefined) return { at, text };
  return { at, text, id: best.id, ...(best.argument === undefined ? {} : { argument: best.argument }) };
}

/** progress.log's text (or the gate's read of it) -> its lines in order; lines with no time are left out */
export function progressLines(text: string): ProgressLine[] {
  const out: ProgressLine[] = [];
  for (const raw of text.split('\n')) {
    const p = parseProgressLine(raw);
    if (p !== undefined) out.push(p);
  }
  return out;
}
