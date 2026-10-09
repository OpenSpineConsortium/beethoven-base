// What each failure the grid reports means for the student's next step, as a code: connect's failure
// codes (steps.ts, V11_CONTRACT.md 5.2 and 5.3) and the gate's answers (gate.ts, V12_CONTRACT.md "The
// gate"). One meaning per answer, the same in every edition, so a student is never told to sign in
// again by one edition where another says to ask the lab lead. The words, the buttons and what a
// button does are each edition's; base holds no sentence. Each mapping says which contract text it
// follows: V11 5.3's table of what a client does for each code is the first source, and the gate's
// answers follow V12 and hpcworker's own words for them (framework/README.md, "The gate").

import { failCodeOf, type FailCode, type StepOutcome } from './steps.js';
import type { GateLimit, GateReadFailure, GateRefusal } from './gate.js';

/**
 * The next steps, from what the contract tells a client to offer:
 * - retry: ask again now; nothing the grid said asks for a wait;
 * - retry-later: ask again after a while; the grid named a cap, a busy moment or a file not written yet;
 * - sign-in-again: the Claude sign-in sitting again (never a sign-out: Beethoven never runs one);
 * - fix-request: ask for something else (another worker name or workspace); the same request fails again;
 * - ask-lead: only the lab lead can change what stopped it.
 */
export const NEXT_STEPS = ['retry', 'retry-later', 'sign-in-again', 'fix-request', 'ask-lead'] as const;
export type NextStep = (typeof NEXT_STEPS)[number];

/** each of connect's failure codes, by what V11 5.3's table has a client do ("failed <code> …" row) */
export const FAILURE_MEANING = {
  // V11 5.2 step 3 (the Remote Control answer could not be written) and any word a newer copy prints;
  // 5.3: "signin, usage, other: The grid didn't take the request. [Try again]"
  other: 'retry',
  // V11 5.1: unknown flags and bad values, nothing done; 5.3 groups it with other: [Try again]
  usage: 'retry',
  // V11 5.3: "Your grid account can't use the lab's copy yet. Ask your lab lead." [Copy details]
  setup: 'ask-lead',
  // V11 5.2 step 4, the workspace marked restricted; 5.3: "Choose another under More about your data."
  restricted: 'fix-request',
  // V11 5.2 step 5, the scheduler refused the job; 5.3: "The grid didn't take the request." [Try again]
  refused: 'retry',
  // V11 5.2: no computer for the sitting within 600 s, the worker keeps its place; 5.3 [Try again],
  // which tries the sign-in again (the worker is already in line)
  'signin-node': 'sign-in-again',
  // V11 5.3: "That code didn't work. Copy it again from the Claude tab." [Sign in again]
  'signin-code': 'sign-in-again',
  // V11 5.3: "The sign-in timed out." [Sign in again]
  'signin-timeout': 'sign-in-again',
  // V11 5.2 (framework 17): the sitting refused a sign-in that bills by use and opened nothing; 5.3
  // [Sign in again] (hpcworker's sentence: "start the sign-in again, and if it repeats ask your lead")
  'signin-billed': 'sign-in-again',
  // V11 5.2 (framework 17): signed in on the grid, not with a Claude subscription; signing in again
  // changes nothing, since nothing signs out; 5.3: "Ask your lab lead to help you sign in again" [Copy details]
  'signin-method': 'ask-lead',
  // V11 5.2: any other sitting failure; 5.3 groups it with other: [Try again]
  signin: 'retry',
} as const satisfies Record<FailCode, NextStep>;

/** a failure word as connect printed it -> its next step; a word this base does not know means what `other` means */
export function failureMeaning(code: string): NextStep {
  return FAILURE_MEANING[failCodeOf(code)];
}

/** V11 5.3, last row: the stream closed with no done or failed line, "The grid didn't take the request." [Try again] */
export const INCOMPLETE_MEANING = 'retry' satisfies NextStep;

/** how a connect ended -> the next step; undefined after done, which asks nothing of the student */
export function outcomeMeaning(outcome: StepOutcome): NextStep | undefined {
  if (outcome.kind === 'done') return undefined;
  if (outcome.kind === 'failed') return failureMeaning(outcome.code);
  return INCOMPLETE_MEANING;
}

/** each of the gate's caps (V12 "The gate": "Past one: HPCW-GATE limit names|hourly|watch|busy, exit 123, nothing run") */
export const LIMIT_MEANING = {
  // 3 worker names, each counting for 7 days after its last use: a name used before still works
  names: 'fix-request',
  // 12 connects in any hour: the hour has to pass
  hourly: 'retry-later',
  // 2 watches at once, each given back when it ends
  watch: 'retry-later',
  // the caps could not be used (browser_key.sh at hpcworker 3b22e70): most often another request of the
  // account holds the caps file's lock, which passes; but the gate says busy too when a profile is there
  // and its state folder cannot be resolved, or when the .gate folder or the caps file is a link, and
  // waiting fixes neither. One word for both until hpcworker gives the lasting causes their own (design
  // 6.1 and 15.4): later, since the passing cause is the usual one and an edition that sees busy again
  // and again can say so
  busy: 'retry-later',
} as const satisfies Record<GateLimit, NextStep>;

/** the gate's own refusal, the key's expiry, and a copy without the gate */
export const REFUSAL_MEANING = {
  // V12: "Anything else: HPCW-GATE refused, exit 126". Base builds only lines the gate accepts, so a
  // refusal says the lab's copy does not take this edition's line (a copy without the verb), which the
  // lab lead updates
  refused: 'ask-lead',
  // the copy has no gate at all (every framework before 11; gate.ts NO_GATE_LINE): only the lab lead
  // brings the lab's copy forward. An edition's words never call that copy outdated (D6)
  'no-gate': 'ask-lead',
  // V12: "the line is removed and HPCW-KEY expired, exit 125", and this one request stopped. Asked again,
  // it runs: over desktop's own sign-in at once, and for the browser through the grid sign-in that
  // enrols a new key (V12 "The key"), which its transport starts by itself
  expired: 'retry',
} as const satisfies Record<Exclude<GateRefusal['kind'], 'limit'>, NextStep>;

/** a refusal the gate printed before the verb ran -> the next step */
export function refusalMeaning(r: GateRefusal): NextStep {
  return r.kind === 'limit' ? LIMIT_MEANING[r.which] : REFUSAL_MEANING[r.kind];
}

/** read's failures (V12: exit 1 HPCW-GATE missing, 3 not-plain or too-large, on standard error) */
export const READ_FAILURE_MEANING = {
  // the run has not written the file yet (the node file before a computer, progress.log before the start)
  missing: 'retry-later',
  // a link or a folder where the job writes a plain file: the gate never follows it, and nothing the
  // student can do from here changes it
  'not-plain': 'ask-lead',
  // over the gate's 256 KB: progress.log is read from its end, so it is status.json, connection.json or
  // node, each a few lines as the job writes it; waiting does not shrink it
  'too-large': 'ask-lead',
} as const satisfies Record<GateReadFailure, NextStep>;

/** read's failure -> the next step */
export function readFailureMeaning(f: GateReadFailure): NextStep {
  return READ_FAILURE_MEANING[f];
}
