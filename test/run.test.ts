// src/run.ts: R1, R12 and the two link choices of V11_CONTRACT.md section 9.3, run on hpcworker's
// `contract` vectors (test/hpcworker/) read through status.ts, and on runs made here from them. The
// three minutes are not in the export (only V11's text gives them); what pins them here is hpcworker's
// own reading, `-gt 180` in its status line, and V11 R12's "over 3 minutes old".
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONTRACT_TIME,
  HEARTBEAT_STATES,
  isCurrentFile,
  isStale,
  isStaleAt,
  isStaleStatus,
  newSessionLinkOf,
  openLinkOf,
  STALE_AFTER_S,
  timeOf,
  type RunFiles,
} from '../src/run.js';
import { parseWorkerStatus, readConnectionFile, readStatusFile, STATUS_PATTERNS, WORKER_STATES, type WorkerStatus } from '../src/status.js';
import { ROOT } from './origin.js';

const at = (...p: string[]) => join(ROOT, 'test', 'hpcworker', ...p);
interface Vector {
  vector: string;
  json?: Record<string, unknown>;
  stdout?: string[];
}
const vectors = readdirSync(at('vectors')).map((f) => JSON.parse(readFileSync(at('vectors', f), 'utf8')) as Vector);
const V = (name: string): Vector => {
  const v = vectors.find((x) => x.vector === name);
  if (!v) throw new Error(`no vector ${name}`);
  return v;
};

const T = '2026-10-01T12:00:00Z';
const T_MS = Date.UTC(2026, 9, 1, 12, 0, 0);
const ENV = 'https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt';
const ENV2 = 'https://claude.com/code?environment=env_02Other';
const SESSION = 'https://claude.ai/code/session_01N4R9mLRJ5wFbf1oaDe5pyj';
const SESSION2 = 'https://claude.ai/code/session_02Other';

describe('timeOf: the contract time, strictly', () => {
  it("reads by status.schema.json's time pattern, character for character once the fields' groups are taken out, and no flag", () => {
    const schema = JSON.parse(readFileSync(at('status.schema.json'), 'utf8')) as { $defs: { time: { pattern: string } } };
    expect(CONTRACT_TIME.source.replace(/[()]/g, '')).toBe(schema.$defs.time.pattern);
    expect(CONTRACT_TIME.source.replace(/[()]/g, '')).toBe(STATUS_PATTERNS.time.source);
    expect((CONTRACT_TIME.source.match(/\(/g) ?? []).length).toBe(6);
    expect(CONTRACT_TIME.flags).toBe('');
  });

  it('reads every time the vectors carry, as Date.parse reads the same text', () => {
    const times = new Set<string>();
    const walk = (v: unknown): void => {
      if (typeof v === 'string') {
        if (STATUS_PATTERNS.time.test(v)) times.add(v);
        if (v.startsWith('{')) walk(JSON.parse(v));
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (typeof v === 'object' && v !== null) Object.values(v).forEach(walk);
    };
    vectors.forEach(walk);
    expect(times.size).toBeGreaterThan(0);
    for (const t of times) {
      expect(timeOf(t), t).toBe(Date.parse(t));
      expect(timeOf(t), t).toBe(T_MS);
    }
  });

  it('agrees with Date.parse on real dates at the edges: leap days, year ends, years below 100', () => {
    for (const t of ['2028-02-29T00:00:00Z', '2000-02-29T23:59:59Z', '2026-12-31T23:59:59Z', '2027-01-01T00:00:00Z', '1970-01-01T00:00:00Z', '0099-12-31T23:59:59Z', '0000-02-29T00:00:00Z', '9999-12-31T23:59:59Z']) {
      expect(timeOf(t), t).toBe(Date.parse(t));
    }
  });

  it('takes the last day of every month, leap and common years alike, and refuses the day after it', () => {
    // the day count from Date.UTC's own calendar (day 0 of the next month is this month's last), so a
    // wrong entry in the module's table fails whichever way it is wrong
    for (const y of [2026, 2028, 2100, 2000]) {
      for (let m = 1; m <= 12; m++) {
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const at = (d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00Z`;
        expect(timeOf(at(last)), at(last)).toBe(Date.UTC(y, m - 1, last));
        if (last < 31) expect(timeOf(at(last + 1)), at(last + 1)).toBeUndefined();
      }
    }
  });

  it('refuses what Date.parse would take: another format, a time zone, fractions, a local time, a rolled-over date', () => {
    const lenient = ['2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00+00:00', '2026-10-01 12:00:00', '2026-10-01', '2026-10-01T12:00:00z', '2026-02-30T12:00:00Z', '2026-10-01T24:00:00Z'];
    for (const t of lenient) {
      expect(Number.isNaN(Date.parse(t)), `Date.parse takes ${t}`).toBe(false);
      expect(timeOf(t), t).toBeUndefined();
    }
  });

  it('refuses dates that do not exist, out-of-range fields and anything that is not the one shape', () => {
    for (const t of ['', ' ', 'yesterday', '2026-02-29T00:00:00Z', '2100-02-29T00:00:00Z', '2026-04-31T00:00:00Z', '2026-06-31T00:00:00Z', '2026-09-31T00:00:00Z', '2026-11-31T00:00:00Z', '2026-13-01T00:00:00Z', '2026-00-10T00:00:00Z', '2026-10-00T00:00:00Z', '2026-10-01T12:60:00Z', '2026-10-01T12:00:60Z', `${T}\n`, ` ${T}`, '+02026-10-01T12:00:00Z', '12026-10-01T12:00:00Z', '2026-10-1T12:00:00Z', '２０２６-10-01T12:00:00Z']) {
      expect(timeOf(t), JSON.stringify(t)).toBeUndefined();
    }
    for (const x of [undefined, null, T_MS, {}, [T]]) expect(timeOf(x)).toBeUndefined();
  });
});

describe('R12: a heartbeat over three minutes old is stale', () => {
  it('is 180 seconds', () => {
    expect(STALE_AFTER_S).toBe(180);
  });

  it('is not stale at 179 s, nor at exactly 180 s; is stale a millisecond later, and at 181 s ("over 3 minutes", hpcworker\'s -gt 180)', () => {
    expect(isStale(T, T_MS + 179_000)).toBe(false);
    expect(isStale(T, T_MS + 180_000)).toBe(false);
    expect(isStale(T, T_MS + 180_001)).toBe(true);
    expect(isStale(T, T_MS + 181_000)).toBe(true);
    expect(isStale(T, T_MS + 86_400_000)).toBe(true);
  });

  it('is not stale for a heartbeat this moment or in the future (a grid clock ahead of the client\'s)', () => {
    expect(isStale(T, T_MS)).toBe(false);
    expect(isStale(T, T_MS - 3_600_000)).toBe(false);
  });

  it('is stale for an empty or unreadable heartbeat: nothing shows the job is alive', () => {
    for (const t of ['', 'never', '2026-10-01T12:00:00.000Z', '2026-02-30T12:00:00Z', `${T}\n`]) expect(isStale(t, T_MS), JSON.stringify(t)).toBe(true);
  });

  it("isStaleAt takes the heartbeat as a time already read, so an edition keeps its own (the browser's heartbeatAt: the later of updated_at and the listing's time, on its clock)", () => {
    expect(isStaleAt(T_MS, T_MS + 180_000)).toBe(false);
    expect(isStaleAt(T_MS, T_MS + 180_001)).toBe(true);
    expect(isStaleAt(T_MS + 3_600_000, T_MS)).toBe(false);
    // the browser's case: updated_at behind, the listing's modified time (its offset applied) fresh
    const updated = T_MS;
    const listed = T_MS + 170_000;
    expect(isStaleAt(Math.max(updated, listed), T_MS + 200_000)).toBe(false);
    expect(isStale(T, T_MS + 200_000)).toBe(true);
    // the same rule as isStale on the text, at every moment
    for (const d of [-1, 0, 1, 179_999, 180_000, 180_001, 3_600_000]) expect(isStaleAt(timeOf(T), T_MS + d), String(d)).toBe(isStale(T, T_MS + d));
  });

  it('isStaleAt counts no heartbeat, or one that is no finite time, as stale: nothing shows the job is alive (the browser counted none as live)', () => {
    for (const b of [undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(isStaleAt(b, T_MS), String(b)).toBe(true);
  });

  it('applies to the five heartbeat states only: the states but queued that a live job rewrites every 30 s', () => {
    expect(HEARTBEAT_STATES.every((s) => (WORKER_STATES as readonly string[]).includes(s))).toBe(true);
    expect(WORKER_STATES.filter((s) => !(HEARTBEAT_STATES as readonly string[]).includes(s))).toEqual(['queued', 'stopped', 'preempted', 'error']);
    const old = T_MS + 600_000;
    for (const state of WORKER_STATES) {
      expect(isStaleStatus({ state, updated_at: T }, old), state).toBe((HEARTBEAT_STATES as readonly string[]).includes(state));
      expect(isStaleStatus({ state, updated_at: T }, T_MS + 60_000), state).toBe(false);
    }
    expect(isStaleStatus({ state: 'online' }, T_MS)).toBe(true);
    expect(isStaleStatus({ updated_at: T }, old)).toBe(false);
    expect(isStaleStatus({ state: 'asleep', updated_at: T }, old)).toBe(false);
  });

  it("on the vectors' files: an online status ten minutes later is stale, a queued one never is", () => {
    const online = readStatusFile(V('status-online').json)!.file;
    const queued = readStatusFile(V('status-queued').json)!.file;
    const stopped = readStatusFile(V('status-stopped').json)!.file;
    expect(isStaleStatus(online, T_MS + 60_000)).toBe(false);
    expect(isStaleStatus(online, T_MS + 600_000)).toBe(true);
    expect(isStaleStatus(queued, T_MS + 86_400_000)).toBe(false);
    expect(isStaleStatus(stopped, T_MS + 86_400_000)).toBe(false);
  });
});

describe('R1: a file about neither the run\'s job nor its successor is ignored', () => {
  it('keeps the run\'s job and its next job, and drops any other', () => {
    const run = { job: '4242', next_job: '40501234' };
    expect(isCurrentFile({ job: '4242' }, run)).toBe(true);
    expect(isCurrentFile({ job: '40501234' }, run)).toBe(true);
    expect(isCurrentFile({ job: '4100' }, run)).toBe(false);
    expect(isCurrentFile({ job: '4100' }, { job: '4242', next_job: '' })).toBe(false);
  });

  it('keeps what it cannot judge: a file naming no job, a run knowing none', () => {
    expect(isCurrentFile({}, { job: '4242' })).toBe(true);
    expect(isCurrentFile({ job: '' }, { job: '4242' })).toBe(true);
    expect(isCurrentFile({ job: '4100' }, {})).toBe(true);
    expect(isCurrentFile({ job: '4100' }, { job: '' })).toBe(true);
  });
});

/** a status line made from the gate-status vector with the vectors' files in it, read through status.ts */
function lineWith(status: unknown, connection: unknown, job = '4242', next_job = ''): WorkerStatus {
  const j = JSON.parse(V('gate-status').stdout![0]!) as Record<string, unknown>;
  const s = parseWorkerStatus(JSON.stringify({ ...j, job, next_job, status, connection }))!;
  expect(s.refused).toEqual([]);
  return s;
}

describe('the link to open and the link for a new session (D7: both)', () => {
  it("on the vectors' online files: both are the environment link the job printed", () => {
    const s = lineWith(V('status-online').json, V('connection-online').json);
    expect(openLinkOf(s)).toBe(ENV);
    expect(newSessionLinkOf(s)).toBe(ENV);
    expect(openLinkOf({ status: readStatusFile(V('status-stopped').json)!.file })).toBe(ENV);
    expect(openLinkOf({ connection: readConnectionFile(V('connection-online').json)!.file })).toBe(ENV);
  });

  it('on the queued vectors: no link at all', () => {
    for (const name of ['gate-status', 'worker-status-queued']) {
      const s = parseWorkerStatus(V(name).stdout![0]!)!;
      expect(openLinkOf(s), name).toBeUndefined();
      expect(newSessionLinkOf(s), name).toBeUndefined();
    }
  });

  it("Open takes the session link first: a worker that resumed a session opens that session (desktop's linkOf took the environment link)", () => {
    const run: RunFiles = { status: { session_url: SESSION, environment_url: ENV } };
    expect(openLinkOf(run)).toBe(SESSION);
    expect(newSessionLinkOf(run)).toBe(ENV);
  });

  it('New session takes only an environment link, wherever it stands, and none when the run has none', () => {
    expect(newSessionLinkOf({ connection: { session_url: SESSION }, status: { session_url: ENV2 } })).toBe(ENV2);
    expect(newSessionLinkOf({ connection: { session_url: SESSION }, status: { session_url: SESSION2 } })).toBeUndefined();
    expect(openLinkOf({ connection: { session_url: SESSION }, status: { session_url: SESSION2 } })).toBe(SESSION);
  });

  it("connection.json is trusted before status.json, as the browser's facts.ts orders them", () => {
    const run: RunFiles = { connection: { session_url: SESSION, environment_url: ENV }, status: { session_url: SESSION2, environment_url: ENV2 } };
    expect(openLinkOf(run)).toBe(SESSION);
    expect(newSessionLinkOf(run)).toBe(ENV);
    expect(openLinkOf({ connection: { environment_url: ENV }, status: { session_url: SESSION2 } })).toBe(ENV);
    expect(openLinkOf({ connection: null, status: { session_url: SESSION2 } })).toBe(SESSION2);
  });

  it('skips a value that is no Claude Code link, even one a reader was not asked to drop', () => {
    const run = { connection: { session_url: 'https://evil.example/code/session_x', environment_url: '' }, status: { session_url: `${SESSION}\n`, environment_url: ENV } };
    expect(openLinkOf(run)).toBe(ENV);
    expect(newSessionLinkOf(run)).toBe(ENV);
    expect(openLinkOf({ status: { session_url: 'javascript:alert(1)' } })).toBeUndefined();
  });

  it("R1: a stale file's link is never chosen; a successor's file is", () => {
    const old = { ...(V('connection-online').json as object), job: '4100', session_url: SESSION, environment_url: ENV };
    const s = lineWith({ ...V('status-online').json, session_url: ENV2, environment_url: ENV2 }, old);
    expect(openLinkOf(s)).toBe(ENV2);
    expect(newSessionLinkOf(s)).toBe(ENV2);
    const renewed = lineWith({ ...V('status-online').json, job: '40501234', session_url: SESSION2 }, null, '4242', '40501234');
    expect(openLinkOf(renewed)).toBe(SESSION2);
    const gone = lineWith({ ...V('status-online').json, job: '4100' }, { ...(V('connection-online').json as object), job: '4100' }, '4242', '');
    expect(openLinkOf(gone)).toBeUndefined();
    expect(newSessionLinkOf(gone)).toBeUndefined();
  });

  it("a run of the browser's own shape (job, next_job, the two files) is read the same", () => {
    const run = { job: '4242', next_job: '40501234', status: readStatusFile(V('status-online').json)!.file, connection: readConnectionFile(V('connection-online').json)!.file, alive_seen: true };
    expect(openLinkOf(run)).toBe(ENV);
  });
});
