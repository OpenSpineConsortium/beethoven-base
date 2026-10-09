// src/gate.ts against hpcworker's `contract` export, pinned in test/hpcworker/ (test data, never
// edited): the values a gate line is made of, its verbs' line templates and caps (cli.json), the gate's,
// the key's and the version family's lines with their exit statuses (lines.json), and every vector of
// the gate and of `hpcworker version` read through the reader that reads it (the interface standard's
// rule 4). The gate's own acceptance rules, which the export does not carry, are those of
// framework/README.md, "The gate" (hpcworker 3b22e70), written out here as test code.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FRAMEWORK_MIN,
  GATE_EXIT,
  GATE_FILES,
  GATE_LIMIT_WORDS,
  GATE_LIMITS,
  GATE_LINES,
  GATE_VALUES,
  gateCommand,
  gateReadFailure,
  gateRefusal,
  gateRemoteLine,
  KEY_EXPIRED,
  KEY_EXPIRED_EXIT,
  NO_GATE_EXIT,
  NO_GATE_LINE,
  parseFrameworkVersion,
  parseGateVersion,
  PERMISSION_MODES,
  VERSION_LINE,
  type GateLine,
} from '../src/gate.js';
import { ROOT } from './origin.js';

interface LineSpec {
  id: string;
  pattern: string;
  exit?: number;
}
interface Value {
  pattern?: string;
  enum?: string[];
}
interface Vector {
  vector: string;
  kind: 'command' | 'file';
  command?: string;
  exit?: number;
  stdout?: string[];
  stderr?: string[];
  json?: { version?: number };
}

const at = (...p: string[]) => join(ROOT, 'test', 'hpcworker', ...p);
const families = (JSON.parse(readFileSync(at('lines.json'), 'utf8')) as { families: Record<string, { lines: LineSpec[]; rules?: string[] }> }).families;
const cli = JSON.parse(readFileSync(at('cli.json'), 'utf8')) as {
  values: Record<string, Value>;
  gate: { verbs: Array<{ id: string; line: string }>; limits: Record<string, number> };
};
const schema = JSON.parse(readFileSync(at('status.schema.json'), 'utf8')) as { properties: { version: { minimum: number } } };
const vectors = readdirSync(at('vectors'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(at('vectors', f), 'utf8')) as Vector);
const vector = (name: string): Vector => {
  const v = vectors.find((x) => x.vector === name);
  if (!v) throw new Error(`no vector ${name}`);
  return v;
};
const lineOf = (family: string, id: string): LineSpec => {
  const l = families[family]!.lines.find((x) => x.id === id);
  if (!l) throw new Error(`no line ${family}/${id}`);
  return l;
};
const text = (lines: string[] | undefined) => (lines ?? []).join('\n');
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** a cli.json verb line as a pattern: each <value> by its own pattern or enum, each <a|b> by its alternatives */
function template(line: string): RegExp {
  const part = (name: string) => {
    const v = cli.values[name];
    if (!v) return escape(name);
    if (v.pattern) return `(?:${v.pattern.replace(/^\^/, '').replace(/\$$/, '')})`;
    return `(?:${(v.enum ?? []).map(escape).join('|')})`;
  };
  const src = line
    .split(/(<[^>]+>)/)
    .map((tok) => {
      const m = /^<([^>]+)>$/.exec(tok);
      return m ? `(?:${m[1]!.split('|').map(part).join('|')})` : escape(tok);
    })
    .join('');
  return new RegExp(`^${src}$`);
}

/** what the gate itself accepts before it reads a verb (framework/README.md, "The gate") */
function gateAccepts(line: string): boolean {
  if (line.length === 0 || line.length > 200 || !/^[A-Za-z0-9._-]+(?: [A-Za-z0-9._-]+)*$/.test(line)) return false;
  return line.split(' ').every((w) => w.length <= 64 && (w === '-' || !w.startsWith('-')));
}

// every good value of each kind the lines take, and the lines base builds from them
const NAMES = ['worker', 'w', '0', 'A1_b-c', `a${'b'.repeat(31)}`];
const SITES = ['testsite', 'a', 'wayne-state', `a${'0'.repeat(31)}`];
const IDS = [undefined, '0123456789abcdef0123456789abcdef'];
const LINES: GateLine[] = [
  { verb: 'version' },
  ...NAMES.flatMap((name): GateLine[] => [{ verb: 'status', name }, { verb: 'stop', name }, ...GATE_FILES.map((file): GateLine => ({ verb: 'read', name, file }))]),
  ...NAMES.flatMap((name) =>
    SITES.flatMap((site) =>
      IDS.flatMap((installId) =>
        PERMISSION_MODES.flatMap((permissionMode) => [true, false].map((chain): GateLine => ({ verb: 'connect', name, site, ...(installId ? { installId } : {}), permissionMode, chain }))),
      ),
    ),
  ),
];

describe('the values a gate line is made of, equal to cli.json', () => {
  it("has the gate's name, site and install id patterns, the permission modes and the files read takes", () => {
    for (const k of Object.keys(GATE_VALUES) as Array<keyof typeof GATE_VALUES>) {
      expect(GATE_VALUES[k].source, k).toBe(cli.values[k]!.pattern);
      expect(GATE_VALUES[k].flags, k).toBe('');
    }
    expect([...PERMISSION_MODES]).toEqual(cli.values.permission_mode!.enum);
    expect([...GATE_FILES]).toEqual(cli.values.gate_file!.enum);
  });

  it("has the gate's caps and their exit status", () => {
    expect(Object.entries(GATE_LIMITS)).toEqual(Object.entries(cli.gate.limits));
    expect(GATE_LIMITS.exit).toBe(lineOf('gate', 'limit').exit);
  });

  it("names the limit line's words, in the limit pattern's order, as keys only (no quoted word for desktop's scan)", () => {
    const words = /\(([^)]+)\)/.exec(lineOf('gate', 'limit').pattern)![1]!.split('|');
    expect(Object.keys(GATE_LIMIT_WORDS)).toEqual(words);
    expect(Object.values(GATE_LIMIT_WORDS).every((v) => v === true)).toBe(true);
    expect(GATE_LINES.limit.source).toBe(`^HPCW-GATE limit (${Object.keys(GATE_LIMIT_WORDS).join('|')})$`);
    // desktop's scripts/forbidden.mjs (9ce98bb) refuses a quoted gate verb it never sends; the copy holds none
    const code = readFileSync(join(ROOT, 'src', 'gate.ts'), 'utf8').split('\n').filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l));
    expect(code.filter((l) => /['"`](?:forget|watch|restrict)\b/.test(l))).toEqual([]);
  });

  it('builds the verbs both editions send and leaves watch, restrict and forget to the browser, so a new verb fails here until it is placed', () => {
    const built = new Set(LINES.map((l) => l.verb));
    expect(cli.gate.verbs.map((v) => v.id).filter((id) => !built.has(id as GateLine['verb']))).toEqual(['watch', 'restrict', 'forget']);
  });
});

describe('gateCommand', () => {
  it("writes every line as cli.json's template for its verb, and as a line the gate accepts", () => {
    const templates = new Map(cli.gate.verbs.map((v) => [v.id, template(v.line)]));
    expect(LINES.length).toBe(1 + NAMES.length * (2 + GATE_FILES.length) + NAMES.length * SITES.length * IDS.length * PERMISSION_MODES.length * 2);
    for (const l of LINES) {
      const c = gateCommand(l);
      expect(c, JSON.stringify(l)).toMatch(templates.get(l.verb)!);
      expect(gateAccepts(c), c).toBe(true);
      for (const other of cli.gate.verbs.filter((v) => v.id !== l.verb)) expect(templates.get(other.id)!.test(c), `${c} as ${other.id}`).toBe(false);
    }
  });

  it('writes "-" for a connect with no install id, chain or no-chain at the end', () => {
    expect(gateCommand({ verb: 'connect', name: 'worker', site: 'testsite', permissionMode: 'default', chain: true })).toBe('connect worker testsite - default chain');
    expect(gateCommand({ verb: 'connect', name: 'w', site: 's', installId: 'ab'.repeat(16), permissionMode: 'plan', chain: false })).toBe(`connect w s ${'ab'.repeat(16)} plan no-chain`);
  });

  it('writes the lines of the gate vectors exactly, and refuses the one the gate refused (rc.log)', () => {
    const said = (name: string) => /SSH_ORIGINAL_COMMAND='([^']*)'/.exec(vector(name).command ?? '')?.[1];
    expect(gateCommand({ verb: 'version' })).toBe(said('gate-version'));
    expect(gateCommand({ verb: 'status', name: 'worker' })).toBe(said('gate-status'));
    expect(gateCommand({ verb: 'read', name: 'worker', file: 'node' })).toBe(said('gate-read-missing'));
    expect(gateCommand({ verb: 'read', name: 'worker', file: 'progress.log' })).toBe(said('gate-read-progress'));
    expect(gateCommand({ verb: 'connect', name: 'worker', site: 'testsite', permissionMode: 'default', chain: true })).toBe(said('gate-connect'));
    expect(said('gate-refused')).toBe('read worker rc.log');
    expect(() => gateCommand({ verb: 'read', name: 'worker', file: 'rc.log' as never })).toThrow(RangeError);
  });

  it('throws on every bad value instead of placing it, and never names the value in its error', () => {
    const badNames = ['-worker', '_worker', '-', 'wor ker', "wor'ker", 'wor"ker', 'wor\nker', 'worker\n', 'a'.repeat(33), '', 'wörker', 'work.er', 'a;b', '$(id)'];
    const badSites = ['Wayne', 'testSite', '-site', 'site_x', 'a'.repeat(33), 'si te', "si'te", '', 'site\n'];
    const badIds = ['a'.repeat(31), 'a'.repeat(33), 'A'.repeat(32), 'g'.repeat(32), '-', '', `${'a'.repeat(32)}\n`];
    const good = { verb: 'connect', name: 'worker', site: 'testsite', permissionMode: 'default', chain: true } as const;
    const bad: unknown[] = [
      ...badNames.flatMap((name) => [{ verb: 'status', name }, { verb: 'stop', name }, { verb: 'read', name, file: 'node' }, { ...good, name }]),
      ...badSites.map((site) => ({ ...good, site })),
      ...badIds.map((installId) => ({ ...good, installId })),
      ...['bypassPermissions', 'DEFAULT', '', 'default '].map((permissionMode) => ({ ...good, permissionMode })),
      ...['rc.log', '../status.json', 'status.json ', 'STATUS.JSON', ''].map((file) => ({ verb: 'read', name: 'worker', file })),
      { ...good, chain: 'yes' },
      { ...good, chain: undefined },
      { verb: 'status' },
      { verb: 'watch', name: 'worker' },
      { verb: 'restrict', name: 'worker' },
      { verb: 'forget' },
      { verb: 'version; id' },
    ];
    for (const b of bad) {
      let error: unknown;
      try {
        gateCommand(b as GateLine);
      } catch (e) {
        error = e;
      }
      expect(error, JSON.stringify(b)).toBeInstanceOf(RangeError);
      const values = Object.entries(b as Record<string, unknown>).filter(([k, v]) => k !== 'verb' && typeof v === 'string' && v.length > 1).map(([, v]) => v as string);
      for (const v of values) expect((error as Error).message, JSON.stringify(b)).not.toContain(v);
    }
  });
});

describe('gateRemoteLine', () => {
  it("runs the gate of the lab's shared copy with the line as SSH_ORIGINAL_COMMAND, through env", () => {
    const shared = /\(shared copy at (.+)\)/.exec(vector('version-shared').stdout![0]!)![1]!;
    expect(gateRemoteLine(shared, { verb: 'version' })).toBe(`env SSH_ORIGINAL_COMMAND='version' bash '${shared}/bin/hpcworker' gate`);
    expect(gateRemoteLine('/rs/x/shared/beethoven/hpcworker/current//', { verb: 'status', name: 'worker' })).toBe(
      "env SSH_ORIGINAL_COMMAND='status worker' bash '/rs/x/shared/beethoven/hpcworker/current/bin/hpcworker' gate",
    );
  });

  it('throws on a folder sharedRootOf would not pass, and on a bad line', () => {
    for (const p of ['', 'relative/path', '/', '/a/../b', '/a/./b', '/a/..', '//a', "/a'b", '/a b', ' /a', '/a ', '/a;b', '/a\nb', '/a/$HOME', '~/x']) {
      expect(() => gateRemoteLine(p, { verb: 'version' }), JSON.stringify(p)).toThrow(RangeError);
    }
    expect(() => gateRemoteLine('/a/b', { verb: 'status', name: "x' ; id ; '" })).toThrow(RangeError);
  });
});

describe("the gate's answers, equal to lines.json", () => {
  it("has the gate family's lines by id with their patterns, and each line's exit status", () => {
    expect(Object.keys(GATE_LINES)).toEqual(families.gate!.lines.map((l) => l.id));
    for (const l of families.gate!.lines) expect(GATE_LINES[l.id as keyof typeof GATE_LINES].source, l.id).toBe(l.pattern);
    // and no flag: a multiline flag would find a gate line inside text that is no gate line
    for (const [id, re] of Object.entries(GATE_LINES)) expect(re.flags, id).toBe('');
    expect(Object.entries(GATE_EXIT)).toEqual(families.gate!.lines.filter((l) => l.exit !== undefined).map((l) => [l.id, l.exit]));
    expect(families.gate!.rules).toEqual(['read a gate line by its prefix (HPCW- or {"v":1): a ~/.bashrc may print first']);
  });

  it("has the key family's expired line and its exit, and the version family's line", () => {
    expect(KEY_EXPIRED.source).toBe(lineOf('key', 'expired').pattern);
    expect(KEY_EXPIRED_EXIT).toBe(lineOf('key', 'expired').exit);
    expect(VERSION_LINE.source).toBe(lineOf('version', 'version').pattern);
    expect(KEY_EXPIRED.flags).toBe('');
    expect(VERSION_LINE.flags).toBe('');
  });
});

describe('gateRefusal', () => {
  it('reads gate-refused as refused, with its exit status', () => {
    const v = vector('gate-refused');
    expect(gateRefusal(text(v.stdout), v.exit)).toEqual({ kind: 'refused' });
    expect(gateRefusal(text(v.stdout))).toEqual({ kind: 'refused' });
  });

  it('finds nothing in the answers of verbs that ran', () => {
    for (const name of ['gate-version', 'gate-status', 'gate-connect', 'gate-read-progress', 'gate-read-missing']) {
      const v = vector(name);
      expect(gateRefusal(text(v.stdout), v.exit), name).toBeUndefined();
    }
  });

  it("reads every cap lines.json's limit pattern names, the expired key, and the refusal after a ~/.bashrc's lines", () => {
    const which = /\(([^)]+)\)/.exec(lineOf('gate', 'limit').pattern)![1]!.split('|');
    expect(which).toEqual(['names', 'hourly', 'watch', 'busy']);
    const noise = 'Welcome to the grid\r\n\x1b[1mquota: 80%\x1b[0m\r\n';
    for (const w of which) expect(gateRefusal(`${noise}HPCW-GATE limit ${w}\n`, 123), w).toEqual({ kind: 'limit', which: w });
    expect(gateRefusal(`${noise}HPCW-KEY expired\n`, 125)).toEqual({ kind: 'expired' });
    expect(gateRefusal(`${noise}\x1b[0mHPCW-GATE refused\r\n`, 126)).toEqual({ kind: 'refused' });
  });

  it('counts a line only with its own exit status when one is given; null (no status) never fits', () => {
    expect(gateRefusal('HPCW-GATE refused', 0)).toBeUndefined();
    expect(gateRefusal('HPCW-GATE refused', null)).toBeUndefined();
    expect(gateRefusal('HPCW-GATE limit names', 126)).toBeUndefined();
    expect(gateRefusal('HPCW-KEY expired', 126)).toBeUndefined();
    expect(gateRefusal('HPCW-KEY expired', 125)).toEqual({ kind: 'expired' });
    // exit 125 with no line is not an expiry: the line is what says so
    expect(gateRefusal('', 125)).toBeUndefined();
  });

  it('matches only whole lines', () => {
    for (const s of ['echo HPCW-GATE refused', 'HPCW-GATE refused now', 'HPCW-GATE limit', 'HPCW-GATE limit everything', 'HPCW-KEY expired soon']) expect(gateRefusal(s), s).toBeUndefined();
  });
});

describe('gateRefusal: a copy without the gate', () => {
  // every copy before framework 11 has no gate: `hpcworker gate` reaches the dispatcher's last case,
  // `die "unknown command '$1' (hpcworker help)"` (bin/hpcworker:2297 at 3b22e70), which writes
  // "hpcworker: <words>" on standard error and exits 1. lines.json does not carry it (design 6.1 asks
  // for it); the one die line the export does carry shows its shape and status.
  const died = "hpcworker: unknown command 'gate' (hpcworker help)";

  it("is hpcworker's die line, on standard error with exit 1, as the export's one die vector shows", () => {
    const v = vector('worker-status-missing');
    expect(v.exit).toBe(NO_GATE_EXIT);
    expect(v.stdout).toEqual([]);
    expect(v.stderr).toHaveLength(1);
    expect(v.stderr![0]).toMatch(/^hpcworker: [^\n]+ \(hpcworker [a-z ]+\)$/);
    expect(NO_GATE_LINE.test(died)).toBe(true);
    expect(NO_GATE_LINE.flags).toBe('');
  });

  it('reads it from standard error, from standard output when the two were joined, and after a ~/.bashrc', () => {
    expect(gateRefusal('', 1, `${died}\n`)).toEqual({ kind: 'no-gate' });
    expect(gateRefusal('', undefined, died)).toEqual({ kind: 'no-gate' });
    expect(gateRefusal(`Welcome to the grid\r\n${died}\r\n`, 1)).toEqual({ kind: 'no-gate' });
    expect(gateRefusal('', 1, `bash: warning: setlocale: LC_ALL: cannot change locale\r\n\x1b[0m${died}\r\n`)).toEqual({ kind: 'no-gate' });
  });

  it('counts it only with exit 1 when a status is given, and only for the gate itself', () => {
    expect(gateRefusal('', 0, died)).toBeUndefined();
    expect(gateRefusal('', 126, died)).toBeUndefined();
    expect(gateRefusal('', null, died)).toBeUndefined();
    // the browser's enrolment verb is the browser's to read; any other word, or a line not whole, is no answer of this kind
    for (const s of [
      "hpcworker: unknown command 'browser-key' (hpcworker help)",
      "hpcworker: unknown command 'gates' (hpcworker help)",
      "hpcworker: unknown command 'gate'",
      `echo ${died}`,
      `${died} now`,
    ])
      expect(gateRefusal('', 1, s), s).toBeUndefined();
  });

  it('finds nothing on either stream of the verbs that ran', () => {
    for (const name of ['gate-version', 'gate-status', 'gate-connect', 'gate-read-progress', 'gate-read-missing', 'gate-refused']) {
      const v = vector(name);
      expect(gateRefusal(text(v.stdout), v.exit, text(v.stderr))?.kind, name).not.toBe('no-gate');
    }
  });
});

describe('gateReadFailure', () => {
  it('reads gate-read-missing from standard error, with its exit status', () => {
    const v = vector('gate-read-missing');
    expect(gateReadFailure(text(v.stderr), v.exit)).toBe('missing');
    expect(gateReadFailure(text(v.stdout), v.exit)).toBeUndefined();
  });

  it('reads each failure after a ~/.bashrc, only with its own exit status when one is given', () => {
    const noise = 'bash: warning: setlocale: LC_ALL: cannot change locale\r\n';
    for (const f of ['missing', 'not-plain', 'too-large'] as const) {
      expect(gateReadFailure(`${noise}HPCW-GATE ${f}\n`, GATE_EXIT[f]), f).toBe(f);
      expect(gateReadFailure(`${noise}HPCW-GATE ${f}\n`), f).toBe(f);
      expect(gateReadFailure(`HPCW-GATE ${f}`, 0), f).toBeUndefined();
      expect(gateReadFailure(`HPCW-GATE ${f}`, null), f).toBeUndefined();
    }
    expect(gateReadFailure('HPCW-GATE not-plain', 1)).toBeUndefined();
    expect(gateReadFailure('HPCW-GATE missing', 3)).toBeUndefined();
    expect(gateReadFailure('HPCW-GATE refused', 126)).toBeUndefined();
  });
});

describe('the version lines', () => {
  it('reads gate-version: the framework, never as the due date, the account and claude', () => {
    expect(parseGateVersion(text(vector('gate-version').stdout))).toEqual({ framework: '18', due: 'never', account: 'st1234', claude: 'unknown' });
  });

  it('reads "-" as no due date, a date as itself, after a ~/.bashrc, and nothing from a line that is not whole', () => {
    expect(parseGateVersion('Last login: today\nHPCW-GATE ok 18 - st1234 claude=yes')).toEqual({ framework: '18', due: null, account: 'st1234', claude: 'yes' });
    expect(parseGateVersion('HPCW-GATE ok ? 2026-11-30 ab1234 claude=no\r\n')).toEqual({ framework: '?', due: '2026-11-30', account: 'ab1234', claude: 'no' });
    for (const s of ['HPCW-GATE ok 18 soon st1234 claude=yes', 'HPCW-GATE ok 18 never st1234 claude=maybe', 'HPCW-GATE ok 18 never st1234', '']) expect(parseGateVersion(s), s).toBeUndefined();
  });

  it('takes the first ok line when there are two: the gate prints one, as the status line reader takes the first', () => {
    expect(parseGateVersion('HPCW-GATE ok 1 - x claude=no\nHPCW-GATE ok 18 never st1234 claude=yes')).toEqual({ framework: '1', due: null, account: 'x', claude: 'no' });
  });

  it("reads version-shared's `hpcworker version`, and an own copy's bare number", () => {
    expect(parseFrameworkVersion(text(vector('version-shared').stdout))).toEqual({ framework: 18, sharedInstall: '/scratch/shared/current' });
    expect(parseFrameworkVersion('17\n')).toEqual({ framework: 17 });
  });

  it("reads only the last line that is not empty once cleaned, so a ~/.bashrc's number before it is never taken", () => {
    expect(parseFrameworkVersion('42\nWelcome\n18 (shared copy at /s/current)\n\n')).toEqual({ framework: 18, sharedInstall: '/s/current' });
    expect(parseFrameworkVersion('18\nWelcome')).toBeUndefined();
    // each line is cleaned first: a carriage return, a colour code, a line of spaces after the number
    expect(parseFrameworkVersion('17\r\n')).toEqual({ framework: 17 });
    expect(parseFrameworkVersion('17\n  \n')).toEqual({ framework: 17 });
    expect(parseFrameworkVersion('\x1b[1m17\x1b[0m\n')).toEqual({ framework: 17 });
    expect(parseFrameworkVersion('Welcome\r\n18 (shared copy at /s/current)\r\n\x1b[0m\r\n')).toEqual({ framework: 18, sharedInstall: '/s/current' });
    // a number too large to hold exactly is no version
    for (const s of ['', 'v18', '18 (own copy)', '18.0', '-1', '99999999999999999999']) expect(parseFrameworkVersion(s), s).toBeUndefined();
  });
});

describe('FRAMEWORK_MIN', () => {
  it('is 17, the first framework whose connect prints every failure code lines.json lists (signin-billed and signin-method came in 17)', () => {
    // raising it is a deliberate change of what the lab lead's diagnostics say, made here on purpose
    expect(FRAMEWORK_MIN).toBe(17);
    const codes = Object.keys((JSON.parse(readFileSync(at('lines.json'), 'utf8')) as { families: { step: { failure_codes: Record<string, number> } } }).families.step.failure_codes);
    expect(codes).toContain('signin-billed');
    expect(codes).toContain('signin-method');
  });

  it('is a whole version no newer than any copy that wrote the vectors, and no older than the oldest status.json the schema admits', () => {
    expect(Number.isSafeInteger(FRAMEWORK_MIN)).toBe(true);
    const written = [
      Number(parseGateVersion(text(vector('gate-version').stdout))!.framework),
      parseFrameworkVersion(text(vector('version-shared').stdout))!.framework,
      ...vectors.filter((v) => v.json?.version !== undefined).map((v) => v.json!.version!),
    ];
    expect(written.length).toBeGreaterThan(2);
    for (const n of written) expect(n).toBeGreaterThanOrEqual(FRAMEWORK_MIN);
    expect(FRAMEWORK_MIN).toBeGreaterThanOrEqual(schema.properties.version.minimum);
  });
});
