// The gate, as a client asks it and reads its answers (V12_CONTRACT.md "The gate"; cli.json "gate";
// lines.json families "gate", "key" and "version"). `hpcworker gate` takes exactly one line through
// SSH_ORIGINAL_COMMAND: the browser's key is forced to it on the grid, and desktop runs it over the
// student's own ssh sign-in (gateRemoteLine). Base builds the lines for the verbs both editions send
// (version, status, stop, read, connect) and reads the answers every verb may give first: the gate's
// refusal, its caps, the key's expiry, and read's three failures. watch, restrict and forget stay in
// the browser, the one edition that sends them; desktop's scan refuses them.
//
// hpcworker is canonical for every value, line and number here; test/gate.test.ts holds each one
// equal to its `contract` export and runs the gate's vectors through these readers. A line is built
// only from values that pass their own test, and a value that fails throws: nothing is ever quoted
// around (cli.json). Every reader looks at each line, because sshd runs the forced command through
// the account's shell and a ~/.bashrc that prints, prints first (lines.json's rule for the family).
import { sharedRootOf } from './profile.js';
import { cleanLine } from './steps.js';

/** cli.json values: the words a gate line is made of */
export const GATE_VALUES = {
  /** the gate's worker name: never a leading "-" or "_", so a name can never read as an option */
  gate_name: /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/,
  site: /^[a-z0-9][a-z0-9-]{0,31}$/,
  install_id: /^[0-9a-f]{32}$/,
} as const;
export const PERMISSION_MODES = ['default', 'acceptEdits', 'plan'] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];
/** the run's files `read` hands over; rc.log, the worker's raw terminal, is deliberately not one */
export const GATE_FILES = ['status.json', 'connection.json', 'progress.log', 'node'] as const;
export type GateFile = (typeof GATE_FILES)[number];

/** a gate line base builds; `installId` absent is written "-" (no Remote Control answer to record) */
export type GateLine =
  | { verb: 'version' }
  | { verb: 'status'; name: string }
  | { verb: 'stop'; name: string }
  | { verb: 'read'; name: string; file: GateFile }
  | { verb: 'connect'; name: string; site: string; installId?: string; permissionMode: PermissionMode; chain: boolean };

/** `value` when it passes `test`; otherwise a throw that names the value's kind, never the value */
function placed(kind: string, value: unknown, test: (v: string) => boolean): string {
  if (typeof value !== 'string' || !test(value)) throw new RangeError(`gate line: ${kind} fails its test`);
  return value;
}

const nameOf = (v: unknown) => placed('gate_name', v, (s) => GATE_VALUES.gate_name.test(s));

/**
 * The gate's SSH_ORIGINAL_COMMAND for one line, exactly as cli.json's gate verbs write it. Throws a
 * RangeError, rather than place it, on any value that fails its test (an edition's input is typed by
 * nothing a compiler checks at run time). connect through the gate is always `--login never`, which
 * the gate adds itself: no gate line can start a Claude sign-in.
 */
export function gateCommand(line: GateLine): string {
  switch (line.verb) {
    case 'version':
      return 'version';
    case 'status':
      return `status ${nameOf(line.name)}`;
    case 'stop':
      return `stop ${nameOf(line.name)}`;
    case 'read':
      return `read ${nameOf(line.name)} ${placed('gate_file', line.file, (s) => (GATE_FILES as readonly string[]).includes(s))}`;
    case 'connect': {
      const site = placed('site', line.site, (s) => GATE_VALUES.site.test(s));
      const id = line.installId === undefined ? '-' : placed('install_id', line.installId, (s) => GATE_VALUES.install_id.test(s));
      const mode = placed('permission_mode', line.permissionMode, (s) => (PERMISSION_MODES as readonly string[]).includes(s));
      if (typeof line.chain !== 'boolean') throw new RangeError('gate line: chain fails its test');
      return `connect ${nameOf(line.name)} ${site} ${id} ${mode} ${line.chain ? 'chain' : 'no-chain'}`;
    }
    default:
      throw new RangeError('gate line: not a verb base builds');
  }
}

/**
 * The command desktop runs over the student's own ssh sign-in: the gate of the lab's shared copy, with
 * the line as its SSH_ORIGINAL_COMMAND. `env` rather than VAR=value, since the account's login shell
 * runs it and a csh would not read the assignment; SSH_ORIGINAL_COMMAND also bars any Claude sign-in
 * by itself. The folder must be the profile's shared_install as sharedRootOf passes it (V11 section
 * 4's `<shared>`: absolute, plain characters, no "." or ".." segment), trailing slashes aside; else it
 * throws.
 */
export function gateRemoteLine(sharedInstall: string, line: GateLine): string {
  const root = sharedRootOf(sharedInstall);
  if (root === undefined || root !== String(sharedInstall).replace(/\/+$/, '')) throw new RangeError('gate line: shared_install fails its test');
  return `env SSH_ORIGINAL_COMMAND='${gateCommand(line)}' bash '${root}/bin/hpcworker' gate`;
}

/** cli.json gate.limits: the caps per account, past which the gate answers `limit` (exit 123) and runs nothing */
export const GATE_LIMITS = { names: 3, connects_per_hour: 12, watches_at_once: 2, exit: 123 } as const;

/** lines.json family "gate", by id, each matched whole on a cleaned line */
export const GATE_LINES = {
  ok: /^HPCW-GATE ok (\S+) ([0-9]{4}-[0-9]{2}-[0-9]{2}|never|-) (\S+) claude=(yes|no|unknown)$/,
  refused: /^HPCW-GATE refused$/,
  limit: /^HPCW-GATE limit (names|hourly|watch|busy)$/,
  missing: /^HPCW-GATE missing$/,
  'not-plain': /^HPCW-GATE not-plain$/,
  'too-large': /^HPCW-GATE too-large$/,
} as const;

/** the exit status each gate line comes with (lines.json); missing, not-plain and too-large are read's, on standard error */
export const GATE_EXIT = { refused: 126, limit: 123, missing: 1, 'not-plain': 3, 'too-large': 3 } as const;

/** lines.json family "key": the one line of it the gate may print before any verb, when the browser key's line expired and was removed */
export const KEY_EXPIRED = /^HPCW-KEY expired$/;
export const KEY_EXPIRED_EXIT = 125;

/**
 * The words the limit line names, as keys (lines.json's limit pattern; test/gate.test.ts holds them
 * equal): worker names, connects in the hour, watches at once, or the caps file could not be used.
 * Keys rather than quoted words, because desktop's scan (scripts/forbidden.mjs) refuses a quoted
 * watch, restrict or forget, the verbs desktop never sends, and this copy is in desktop's source tree.
 */
export const GATE_LIMIT_WORDS = { names: true, hourly: true, watch: true, busy: true } as const;
/** which cap the gate named */
export type GateLimit = keyof typeof GATE_LIMIT_WORDS;

/**
 * What a copy without the gate (every framework before 11) answers `hpcworker gate` with: the
 * dispatcher's `die "unknown command '$1' (hpcworker help)"` (bin/hpcworker at 3b22e70), which writes
 * `hpcworker: ` and its words on standard error and exits 1, in the same words since framework 1. It
 * is no gate line, so lines.json does not carry it yet (design 6.1 asks hpcworker for it); the test
 * holds its shape to the export's one die vector. Only `gate` is read: the browser's enrolment verb
 * stays the browser's.
 */
export const NO_GATE_LINE = /^hpcworker: unknown command 'gate' \(hpcworker help\)$/;
export const NO_GATE_EXIT = 1;

/** what the gate said instead of the verb's answer, or the copy that has none */
export type GateRefusal = { kind: 'refused' } | { kind: 'limit'; which: GateLimit } | { kind: 'expired' } | { kind: 'no-gate' };

/** whether a line's exit status, when the caller gives one, is the one lines.json gives the line (null, a signal, never is) */
function exitFits(exitStatus: number | null | undefined, wanted: number): boolean {
  return exitStatus === undefined || exitStatus === wanted;
}

/**
 * The gate's answer when it stopped the request before the verb ran: refused (no line it accepts), a
 * cap reached, or the browser key's line expired and removed, found on any line of standard output
 * after whatever a ~/.bashrc printed; or no-gate, the copy's die line for a verb it does not know,
 * found on standard error (`stderr`, when the caller has it apart) or on standard output (when the two
 * were joined). With `exitStatus` (a number, or null when the command ended without one), a line
 * counts only with the status lines.json, or the die, gives it.
 */
export function gateRefusal(stdout: string, exitStatus?: number | null, stderr?: string): GateRefusal | undefined {
  for (const raw of String(stdout).split('\n')) {
    const line = cleanLine(raw);
    if (GATE_LINES.refused.test(line) && exitFits(exitStatus, GATE_EXIT.refused)) return { kind: 'refused' };
    const m = GATE_LINES.limit.exec(line);
    if (m && exitFits(exitStatus, GATE_EXIT.limit)) return { kind: 'limit', which: m[1] as GateLimit };
    if (KEY_EXPIRED.test(line) && exitFits(exitStatus, KEY_EXPIRED_EXIT)) return { kind: 'expired' };
  }
  if (!exitFits(exitStatus, NO_GATE_EXIT)) return undefined;
  for (const raw of `${String(stderr ?? '')}\n${String(stdout)}`.split('\n')) if (NO_GATE_LINE.test(cleanLine(raw))) return { kind: 'no-gate' };
  return undefined;
}

export type GateReadFailure = 'missing' | 'not-plain' | 'too-large';
const READ_FAILURES = ['missing', 'not-plain', 'too-large'] as const satisfies readonly GateReadFailure[];

/**
 * Why `read` handed over no file, from its line on standard error: missing (the run has not written it),
 * not-plain (a link or a folder, never followed) or too-large (over the gate's 256 KB). Undefined when it
 * printed none of them; with `exitStatus`, as gateRefusal.
 */
export function gateReadFailure(stderr: string, exitStatus?: number | null): GateReadFailure | undefined {
  for (const raw of String(stderr).split('\n')) {
    const line = cleanLine(raw);
    for (const f of READ_FAILURES) if (GATE_LINES[f].test(line) && exitFits(exitStatus, GATE_EXIT[f])) return f;
  }
  return undefined;
}

/** `version` through the gate */
export interface GateVersion {
  /** the copy's framework version as it wrote it ("?" when the copy could not read its own VERSION) */
  framework: string;
  /** the day the browser key's oldest line expires (YYYY-MM-DD, UTC); "never" when the site sets no expiry; null when it does and no line of ours is there ("-") */
  due: string | null;
  /** the grid account the gate ran as */
  account: string;
  /** the newest answer `claude auth status` gave any run of the account, from its files */
  claude: 'yes' | 'no' | 'unknown';
}

/**
 * `HPCW-GATE ok <framework> <due|never|-> <account> claude=<yes|no|unknown>`, found on any line after
 * whatever a ~/.bashrc printed; the first such line, since the gate prints one (the status line's
 * reader also takes the first); undefined when none
 */
export function parseGateVersion(stdout: string): GateVersion | undefined {
  for (const raw of String(stdout).split('\n')) {
    const m = GATE_LINES.ok.exec(cleanLine(raw));
    if (!m) continue;
    const [, framework = '', due = '', account = '', claude = ''] = m;
    return { framework, due: due === '-' ? null : due, account, claude: claude as GateVersion['claude'] };
  }
  return undefined;
}

/** lines.json family "version": what `hpcworker version` prints, with the shared copy's folder when the account runs one */
export const VERSION_LINE = /^([0-9]+)(?: \(shared copy at (.+)\))?$/;

export interface FrameworkVersion {
  framework: number;
  /** the lab's shared copy the account runs; absent for the student's own copy */
  sharedInstall?: string;
}

/**
 * `hpcworker version`'s answer. The line has no prefix of its own, so only the last line that is not
 * empty is read: a ~/.bashrc prints before the tool, never after it.
 */
export function parseFrameworkVersion(stdout: string): FrameworkVersion | undefined {
  const lines = String(stdout).split('\n').map(cleanLine).filter((l) => l !== '');
  const m = VERSION_LINE.exec(lines[lines.length - 1] ?? '');
  if (!m) return undefined;
  const framework = Number(m[1]);
  if (!Number.isSafeInteger(framework)) return undefined;
  return m[2] === undefined ? { framework } : { framework, sharedInstall: m[2] };
}

/**
 * The first framework version that writes everything base reads (design 6.5, decision D6): framework
 * 10 brought connect's step lines, progress.log and `worker status --json` version 1, framework 11 the
 * gate, and framework 17 the last addition, the step failure codes signin-billed and signin-method
 * (read at hpcworker 3b22e70: 6eff9e9 raised VERSION to 17; 18 changed no line base reads). It is a
 * fact for base's tests and for the lab lead's section of an edition's diagnostics, stated beside the
 * copy's own number. It never makes the lab's copy "outdated" to a student and never makes an edition
 * replace it: within `v:1` every change is additive, so an older copy still parses (a framework 16 copy
 * says `signin` where 17 says signin-billed or signin-method). The browser's FRAMEWORK_CONNECT_VERSION
 * (10), which nothing reads, is the same kind of fact for connect alone and goes (design 6.5).
 */
export const FRAMEWORK_MIN = 17;
