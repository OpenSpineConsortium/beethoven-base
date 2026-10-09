// How a client reads a run from its files, by the rules of V11_CONTRACT.md section 9.3 that every
// edition applies the same way: R1 (a file about neither the run's job nor its successor is stale and
// ignored), R12 (a live state whose heartbeat is over three minutes old reads as last known) and which
// of the run's links to open (design decision D7, "both": Open goes to the session, New session to the
// environment). The files are status.ts's; the link shapes are links.ts's. Time is the caller's: it
// passes "now" as milliseconds since the epoch, and base reads no clock.
//
// The order of trust between the two files is the browser's (facts.ts, 14.0.0): connection.json, then
// status.json, and in each session_url (the link Claude Code printed last, either form), then
// environment_url. What stays in the editions: the other rules (R2 to R11, R13), which need the
// listing's times, the node file and what the edition has seen, and every sentence about a run.
import { isClaudeCodeLink, isEnvironmentLink } from './links.js';
import type { WorkerState } from './status.js';

/** R12: a live state's heartbeat older than this, in seconds, reads as last known (the job writes every 30 s) */
export const STALE_AFTER_S = 180;

/**
 * The states in which the job rewrites status.json every 30 s, so a silence means its job may be gone:
 * R12's live states without queued, which has no heartbeat yet (R2). hpcworker's own status line
 * applies its three minutes to these five (bin/hpcworker status_line).
 */
export const HEARTBEAT_STATES = ['starting', 'need_login', 'need_consent', 'running', 'online'] as const satisfies readonly WorkerState[];

/** status.schema.json $defs.time with each field captured (test/run.test.ts holds it equal to the schema's, groups aside) */
export const CONTRACT_TIME = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z$/;

function daysIn(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * A contract time, YYYY-MM-DDTHH:MM:SSZ in UTC and nothing else, as milliseconds since the epoch;
 * undefined for "" and for any other text, a date that does not exist (February 30) or a second past 59.
 * Strict where Date.parse is lenient: Date.parse takes local times, other formats and, in some engines,
 * rolls an impossible date over to the next month.
 */
export function timeOf(text: unknown): number | undefined {
  if (typeof text !== 'string') return undefined;
  const m = CONTRACT_TIME.exec(text);
  if (!m) return undefined;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo) || h > 23 || mi > 59 || s > 59) return undefined;
  // Date.UTC reads a year below 100 as 19xx; 400 Gregorian years are exactly 146097 days
  if (y < 100) return Date.UTC(y + 400, mo - 1, d, h, mi, s) - 146097 * 86_400_000;
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

/**
 * R12 on a heartbeat the edition has already read, in milliseconds since the epoch on its own clock:
 * whether it is over STALE_AFTER_S old at `nowMs`. For an edition whose heartbeat is more than the
 * text of updated_at, such as the browser's (the later of updated_at and the listing's modified time,
 * each moved by the grid's clock offset). No heartbeat, or one that is no finite time, is stale:
 * nothing shows the job is alive. One in the future is not (the grid's clock may run ahead).
 */
export function isStaleAt(beatMs: number | undefined, nowMs: number): boolean {
  if (beatMs === undefined || !Number.isFinite(beatMs)) return true;
  return nowMs - beatMs > STALE_AFTER_S * 1000;
}

/**
 * R12: whether a heartbeat written at `updatedAt` is over STALE_AFTER_S old at `nowMs`. A heartbeat
 * that is empty or not a contract time is stale: nothing shows the job is alive. One in the future is
 * not (the grid's clock may run ahead of the client's).
 */
export function isStale(updatedAt: string, nowMs: number): boolean {
  return isStaleAt(timeOf(updatedAt), nowMs);
}

/** R12 on a status file: a heartbeat state whose updated_at is stale; any other state (queued, stopped, preempted, error) never is */
export function isStaleStatus(status: { state?: string; updated_at?: string }, nowMs: number): boolean {
  return (HEARTBEAT_STATES as readonly string[]).includes(status.state ?? '') && isStale(status.updated_at ?? '', nowMs);
}

/** what the link choice reads of a file */
export interface LinkFields {
  job?: string;
  session_url?: string;
  environment_url?: string;
}

/** a run as the link choice sees it: its current job and successor (the status line's job and next_job) and its two files */
export interface RunFiles {
  job?: string;
  next_job?: string;
  status?: LinkFields | null;
  connection?: LinkFields | null;
}

/**
 * R1: whether a file is about the run's job or its queued successor. A file that names no job, or a
 * run that knows none, cannot be judged and is kept.
 */
export function isCurrentFile(file: { job?: string }, run: { job?: string; next_job?: string }): boolean {
  if (!file.job || !run.job) return true;
  return file.job === run.job || (!!run.next_job && file.job === run.next_job);
}

/** every link the run's current files report, in the order they are trusted */
function reported(run: RunFiles): unknown[] {
  const out: unknown[] = [];
  for (const f of [run.connection, run.status]) {
    if (f && isCurrentFile(f, run)) out.push(f.session_url, f.environment_url);
  }
  return out;
}

/**
 * Open: the first Claude Code link the run's current files report, either form, so a worker that
 * resumed a session opens that session; undefined when there is none.
 */
export function openLinkOf(run: RunFiles): string | undefined {
  return reported(run).find(isClaudeCodeLink);
}

/**
 * New session: the first environment link the run's current files report, in the same order of
 * trust, whichever link openLinkOf chose; undefined when there is none. Never a session link: a
 * resumed session serves that one session and starts no other.
 */
export function newSessionLinkOf(run: RunFiles): string | undefined {
  return reported(run).find(isEnvironmentLink);
}
