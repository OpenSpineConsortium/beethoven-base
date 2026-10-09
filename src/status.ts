// What a worker's run folder says, as hpcworker writes it: status.json (the heartbeat, written by the
// job every 30 s and by `worker start`, `worker status` and `worker stop` while the worker is in line),
// connection.json (written when Remote Control registers), and the one JSON line `hpcworker worker
// status --name N --json` and the gate's `status N` print, which carries both files. Their truth is
// hpcworker's `contract` export: status.schema.json, connection.schema.json and
// worker-status.schema.json, with V11_CONTRACT.md sections 6, 7.1, 9 and 10 saying why. Base holds no
// file and reads none: the edition runs the command or downloads the file and hands the text or the
// parsed value here.
//
// The rules of reading, within the contract's `v:1`, where changes are additive only:
// - a field this module does not know is ignored, so a newer writer's addition never breaks a reader;
// - every known field is optional, since an older writer may lack one added since; a field that is
//   present with a value its schema refuses reads as absent and is named in `refused`, so an edition
//   can say in its own diagnostics that the files held something wrong;
// - a link field holds a Claude Code link (links.ts) or reads as absent: an edition never opens a bad
//   link, and the files' "" for "no link yet" reads as absent too, not refused. connection.json's
//   schema asks for a link there, but the job writes "" for a resumed session's environment link and
//   for both before Claude Code printed any (worker.sbatch.tpl at hpcworker 3b22e70, :48-49 and :492);
//   status.json's claude_login is null until the job's first `claude auth status` (:118), which its
//   schema refuses too. Each reads as absent: the writer is the truth of what a file holds, and
//   neither is anything wrong in the files (design section 6.1 asks hpcworker to make the two agree);
// - the JSON line is found by its prefix, {"v":1, after cleanLine (a ~/.bashrc may print first, and a
//   glued keepalive is removed); a line that does not parse, whose v is not 1, or that is a watch
//   keepalive event is no status.
//
// What stays in the editions: running the command and its exit status, the gate's watch verb and its
// keepalive timing, R1 to R13's views (run.ts holds R1, R12 and the link choice), and every sentence:
// the line's `line`, status.json's `message` and `hint` and the stopped line are hpcworker's own words,
// passed through untouched for whichever edition shows them.
import { isClaudeCodeLink } from './links.js';
import { cleanLine } from './steps.js';

/** status.schema.json `state` */
export const WORKER_STATES = ['queued', 'starting', 'need_login', 'need_consent', 'running', 'online', 'stopped', 'preempted', 'error'] as const;
export type WorkerState = (typeof WORKER_STATES)[number];
/** status.schema.json `needs`: the one thing the student must do now, as the job sees it */
export const NEEDS = ['login', 'consent', 'nothing'] as const;
export type Needs = (typeof NEEDS)[number];
/** status.schema.json `consent_source`: Claude Code's own settings file, the marker file, or nowhere */
export const CONSENT_SOURCES = ['claude_config', 'marker', 'none'] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];
/** status.schema.json `stop_reason`, state stopped only */
export const STOP_REASONS = ['request', 'login_abandoned', 'successor_gone'] as const;
export type StopReason = (typeof STOP_REASONS)[number];

/** the schemas' patterns, each the one its schema states (the two link patterns are links.ts's) */
export const STATUS_PATTERNS = {
  name: /^[A-Za-z0-9_-]{1,32}$/,
  job: /^[0-9]+$/,
  digits: /^[0-9]*$/,
  time: /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/,
  time_or_empty: /^(|[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)$/,
  environment_id: /^(|env_[A-Za-z0-9_-]+)$/,
} as const;

/**
 * What a field holds: a JSON string, integer or boolean; an integer of at least `min`; a string of one
 * of STATUS_PATTERNS; a Claude Code link or "" (`link_or_empty`, "" read as absent); the claude_login
 * object (null, the job's value before its first check, read as absent); or one of a list of words.
 */
export type Kind = 'str' | 'int' | 'bool' | { readonly min: number } | keyof typeof STATUS_PATTERNS | 'link_or_empty' | 'login' | readonly string[];

/** status.json's claude_login: what `claude auth status` said, re-checked every 300 s; never a token */
export interface ClaudeLogin {
  loggedIn: boolean;
  email?: string;
  subscriptionType?: string;
  checked_at?: string;
}

/** status.json, every property of status.schema.json */
export interface StatusFile {
  /** the framework version that wrote the file */
  version?: number;
  site?: string;
  run?: string;
  /** the job this file is about; a chain successor has a new id */
  job?: string;
  node?: string;
  pid?: number;
  state?: WorkerState;
  message?: string;
  needs?: Needs;
  hint?: string;
  submitted_at?: string;
  got_computer_at?: string;
  started_at?: string;
  online_at?: string;
  ends_at?: string;
  renewal?: boolean;
  /** the heartbeat (run.ts isStale) */
  updated_at?: string;
  title?: string;
  session_name?: string;
  requested_name?: string;
  /** the link Claude Code printed last, either form; absent when none (run.ts chooses which to open) */
  session_url?: string;
  /** the environment link; absent when none */
  environment_url?: string;
  environment_id?: string;
  claude_login?: ClaudeLogin;
  consent?: boolean;
  consent_source?: ConsentSource;
  workspace_trusted?: boolean;
  rc_alive?: boolean;
  resumed?: boolean;
  tmux?: boolean;
  restarts?: number;
  chain?: boolean;
  /** the queued successor; "" until queued */
  next_job?: string;
  chain_note?: string;
  scheduler_in_worker?: boolean;
  scheduler_note?: string;
  workspace?: string;
  rc_log?: string;
  token_path?: string;
  stop_reason?: StopReason;
  scheduler_state?: string;
  reason?: string;
  expected_start?: string;
  checked_at?: string;
}

/** connection.json, every property of connection.schema.json */
export interface ConnectionFile {
  session_name?: string;
  requested_name?: string;
  session_url?: string;
  environment_url?: string;
  environment_id?: string;
  node?: string;
  job?: string;
  pid?: number;
  started_at?: string;
  token_path?: string;
  workspace?: string;
  rc_log?: string;
  permission_mode?: 'default' | 'acceptEdits' | 'plan';
  /** a number written as a string */
  capacity?: string;
  resumed?: boolean;
  next_job?: string;
  title?: string;
  online_at?: string;
}

/** worker-status.schema.json $defs.scheduler: the one squeue answer, only while status.json says queued */
export interface Scheduler {
  /** Slurm's %T, or GONE when the scheduler no longer lists the job */
  state?: string;
  reason?: string;
  expected_start?: string;
  node?: string;
  checked_at?: string;
}

/** each status.json key with what it holds */
export const STATUS_KEYS = {
  version: { min: 9 },
  site: 'str',
  run: 'name',
  job: 'job',
  node: 'str',
  pid: 'int',
  state: WORKER_STATES,
  message: 'str',
  needs: NEEDS,
  hint: 'str',
  submitted_at: 'time_or_empty',
  got_computer_at: 'time_or_empty',
  started_at: 'time_or_empty',
  online_at: 'time_or_empty',
  ends_at: 'time_or_empty',
  renewal: 'bool',
  updated_at: 'time',
  title: 'str',
  session_name: 'str',
  requested_name: 'str',
  session_url: 'link_or_empty',
  environment_url: 'link_or_empty',
  environment_id: 'environment_id',
  claude_login: 'login',
  consent: 'bool',
  consent_source: CONSENT_SOURCES,
  workspace_trusted: 'bool',
  rc_alive: 'bool',
  resumed: 'bool',
  tmux: 'bool',
  restarts: { min: 0 },
  chain: 'bool',
  next_job: 'digits',
  chain_note: 'str',
  scheduler_in_worker: 'bool',
  scheduler_note: 'str',
  workspace: 'str',
  rc_log: 'str',
  token_path: 'str',
  stop_reason: STOP_REASONS,
  scheduler_state: 'str',
  reason: 'str',
  expected_start: 'time_or_empty',
  checked_at: 'time_or_empty',
} as const satisfies Record<keyof StatusFile, Kind>;

/** status.json's claude_login keys with what each holds (loggedIn is required: without it the object says nothing) */
export const CLAUDE_LOGIN_KEYS = {
  loggedIn: 'bool',
  email: 'str',
  subscriptionType: 'str',
  checked_at: 'time_or_empty',
} as const satisfies Record<keyof ClaudeLogin, Kind>;

/** each connection.json key with what it holds */
export const CONNECTION_KEYS = {
  session_name: 'str',
  requested_name: 'str',
  // the schema's claude_link; the job also writes "" (the module's header says why it reads as absent)
  session_url: 'link_or_empty',
  environment_url: 'link_or_empty',
  environment_id: 'environment_id',
  node: 'str',
  job: 'job',
  pid: 'int',
  started_at: 'time_or_empty',
  token_path: 'str',
  workspace: 'str',
  rc_log: 'str',
  permission_mode: ['default', 'acceptEdits', 'plan'],
  capacity: 'digits',
  resumed: 'bool',
  next_job: 'digits',
  title: 'str',
  online_at: 'time_or_empty',
} as const satisfies Record<keyof ConnectionFile, Kind>;

/** the scheduler object's keys with what each holds */
export const SCHEDULER_KEYS = {
  state: 'str',
  reason: 'str',
  expected_start: 'time_or_empty',
  node: 'str',
  checked_at: 'time',
} as const satisfies Record<keyof Scheduler, Kind>;

/** the status line's own string fields with what each holds; v, status, connection and scheduler are read apart */
export const LINE_KEYS = {
  run: 'name',
  job: 'digits',
  next_job: 'digits',
  state_dir: 'str',
  line: 'str',
} as const satisfies Record<string, Kind>;

/** lines.json family "gate": a status line is read by this prefix, a ~/.bashrc may print first */
export const STATUS_LINE_PREFIX = '{"v":1';

/** a file as read: the known fields that hold what their schema says, and every one that did not */
export interface FileRead<T> {
  file: T;
  /** the keys left out because their value is not what the schema says ("claude_login.email" for one inside) */
  refused: string[];
}

/**
 * `hpcworker worker status --json`'s line, or one status event of the gate's watch, as read. The line's
 * own fields an older writer lacks read as the contract's "none": "" for a string, null for a file.
 */
export interface WorkerStatus {
  v: 1;
  /** the worker's name */
  run: string;
  /** job.id, the run's current job; "" when none */
  job: string;
  /** the queued successor; "" when none */
  next_job: string;
  state_dir: string;
  /** status.json as this call left it, or null when there is none yet */
  status: StatusFile | null;
  connection: ConnectionFile | null;
  /** what this call's one squeue said, or null when it asked nothing */
  scheduler: Scheduler | null;
  /** hpcworker's one sentence for a person; each edition words its own */
  line: string;
  /** on a line of the gate's watch: a status event */
  event?: 'status';
  /** on a watch's status event: the watch's last line */
  final?: boolean;
  /** every field left out because its value is not what the schema says, by its path ("status.session_url") */
  refused: string[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** whether v is what `kind` says; the claude_login object is read apart */
function fits(kind: Kind, v: unknown): boolean {
  if (typeof kind !== 'string') {
    if ('min' in kind) return typeof v === 'number' && Number.isInteger(v) && v >= kind.min;
    return typeof v === 'string' && kind.includes(v);
  }
  switch (kind) {
    case 'str':
      return typeof v === 'string';
    case 'int':
      return typeof v === 'number' && Number.isInteger(v);
    case 'bool':
      return typeof v === 'boolean';
    case 'link_or_empty':
      return v === '' || isClaudeCodeLink(v);
    case 'login':
      return false;
    default:
      return typeof v === 'string' && STATUS_PATTERNS[kind].test(v);
  }
}

/** the known keys of raw that hold what `keys` says; every other known key present goes to refused, under `at` */
function readFields(raw: Record<string, unknown>, keys: Readonly<Record<string, Kind>>, at: string, refused: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, kind] of Object.entries(keys)) {
    if (!Object.hasOwn(raw, key)) continue;
    const v = raw[key];
    if (kind === 'login') {
      if (v === null) continue;
      if (isObject(v) && typeof v.loggedIn === 'boolean') out[key] = readFields(v, CLAUDE_LOGIN_KEYS, `${at}${key}.`, refused);
      else refused.push(`${at}${key}`);
    } else if (!fits(kind, v)) {
      refused.push(`${at}${key}`);
    } else if (!(kind === 'link_or_empty' && v === '')) {
      out[key] = v;
    }
  }
  return out;
}

/** A parsed status.json -> its known fields as status.schema.json types them; undefined when it is not a JSON object. */
export function readStatusFile(raw: unknown): FileRead<StatusFile> | undefined {
  if (!isObject(raw)) return undefined;
  const refused: string[] = [];
  return { file: readFields(raw, STATUS_KEYS, '', refused) as StatusFile, refused };
}

/** A parsed connection.json -> its known fields as connection.schema.json types them; undefined when it is not a JSON object. */
export function readConnectionFile(raw: unknown): FileRead<ConnectionFile> | undefined {
  if (!isObject(raw)) return undefined;
  const refused: string[] = [];
  return { file: readFields(raw, CONNECTION_KEYS, '', refused) as ConnectionFile, refused };
}

/** status, connection or scheduler of the line: an object read by its keys, null when the line says null or leaves it out */
function readPart<T>(raw: Record<string, unknown>, key: string, keys: Readonly<Record<string, Kind>>, refused: string[]): T | null {
  const v = raw[key];
  if (v === undefined || v === null) return null;
  if (!isObject(v)) {
    refused.push(key);
    return null;
  }
  return readFields(v, keys, `${key}.`, refused) as T;
}

/**
 * One line of output -> the worker's status, when it is `worker status --json`'s line or a status event
 * of the gate's watch; undefined for any other line, a keepalive event among them, a line that does not
 * parse, a v other than 1 and a run that is not a worker's name.
 */
export function parseWorkerStatusLine(raw: string): WorkerStatus | undefined {
  const text = cleanLine(raw);
  if (!text.startsWith(STATUS_LINE_PREFIX)) return undefined;
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isObject(j) || j.v !== 1) return undefined;
  if (Object.hasOwn(j, 'event') && j.event !== 'status') return undefined;
  if (!fits(LINE_KEYS.run, j.run)) return undefined;
  const refused: string[] = [];
  const own = readFields(j, LINE_KEYS, '', refused);
  const str = (k: keyof typeof LINE_KEYS): string => (typeof own[k] === 'string' ? (own[k] as string) : '');
  const out: WorkerStatus = {
    v: 1,
    run: str('run'),
    job: str('job'),
    next_job: str('next_job'),
    state_dir: str('state_dir'),
    status: readPart<StatusFile>(j, 'status', STATUS_KEYS, refused),
    connection: readPart<ConnectionFile>(j, 'connection', CONNECTION_KEYS, refused),
    scheduler: readPart<Scheduler>(j, 'scheduler', SCHEDULER_KEYS, refused),
    line: str('line'),
    refused,
  };
  if (j.event === 'status') {
    out.event = 'status';
    if (typeof j.final === 'boolean') out.final = j.final;
    else refused.push('final');
  }
  return out;
}

/** A command's whole standard output -> the first worker status line in it, after whatever printed first; undefined when none. */
export function parseWorkerStatus(stdout: string): WorkerStatus | undefined {
  for (const raw of stdout.split('\n')) {
    const s = parseWorkerStatusLine(raw);
    if (s) return s;
  }
  return undefined;
}

/**
 * `worker NAME: stopped (...)`, the line `worker stop` and the gate's `stop` print (V11 section 7.1:
 * exit 0 and this pattern are the test of success). lines.json does not carry it.
 */
export const STOPPED_LINE = /^worker \S+: stopped \(/;

/** the stopped line in a command's output, cleaned, as hpcworker wrote it; undefined when it printed none */
export function stoppedLine(stdout: string): string | undefined {
  for (const raw of stdout.split('\n')) {
    const line = cleanLine(raw);
    if (STOPPED_LINE.test(line)) return line;
  }
  return undefined;
}
