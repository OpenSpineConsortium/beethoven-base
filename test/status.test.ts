// src/status.ts against hpcworker's `contract` export, taken with interface/pull.sh into test/hpcworker/:
// status.schema.json, connection.schema.json and worker-status.schema.json, and every vector of what the
// real writer printed for them. The schemas are applied here by a small validator of the keywords they
// use (hpcworker's schemacheck.py names the same set), so each key table of the module is held to its
// schema twice: by its words, lists and patterns, and by the verdict on a corpus of values.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLAUDE_LOGIN_KEYS,
  CONNECTION_KEYS,
  CONSENT_SOURCES,
  LINE_KEYS,
  NEEDS,
  parseWorkerStatus,
  parseWorkerStatusLine,
  readConnectionFile,
  readStatusFile,
  SCHEDULER_KEYS,
  STATUS_KEYS,
  STATUS_LINE_PREFIX,
  STATUS_PATTERNS,
  STOP_REASONS,
  STOPPED_LINE,
  stoppedLine,
  WORKER_STATES,
  type Kind,
  type WorkerStatus,
} from '../src/status.js';
import { KEEPALIVE } from '../src/steps.js';
import { ROOT } from './origin.js';

type Schema = Record<string, unknown>;
const at = (...p: string[]) => join(ROOT, 'test', 'hpcworker', ...p);
const json = (f: string) => JSON.parse(readFileSync(at(f), 'utf8')) as Schema;
const SCHEMAS: Record<string, Schema> = {
  'status.schema.json': json('status.schema.json'),
  'connection.schema.json': json('connection.schema.json'),
  'worker-status.schema.json': json('worker-status.schema.json'),
};
const statusSchema = SCHEMAS['status.schema.json']!;
const connectionSchema = SCHEMAS['connection.schema.json']!;
const workerSchema = SCHEMAS['worker-status.schema.json']!;
const lines = json('lines.json') as { families: Record<string, { rules?: string[]; lines?: { pattern: string }[] }> };

interface Vector {
  vector: string;
  kind: 'file' | 'command';
  file?: string;
  json?: Record<string, unknown>;
  command?: string;
  exit?: number;
  stdout?: string[];
  stderr?: string[];
}
const vectors = readdirSync(at('vectors')).map((f) => json(`vectors/${f}`) as unknown as Vector);
const V = (name: string): Vector => {
  const v = vectors.find((x) => x.vector === name);
  if (!v) throw new Error(`no vector ${name}`);
  return v;
};

// ---- the validator: the keywords the three schemas use, as ECMA-262 JSON Schema reads them ----------------

const props = (s: Schema) => (s.properties ?? {}) as Record<string, Schema>;
const defs = (s: Schema) => (s.$defs ?? {}) as Record<string, Schema>;

/** a $ref of these schemas: "#/$defs/x" in the same file, or another file of the export whole */
function deref(ref: string, home: Schema): [Schema, Schema] {
  if (ref.startsWith('#/$defs/')) return [defs(home)[ref.slice('#/$defs/'.length)]!, home];
  const other = SCHEMAS[ref];
  if (!other) throw new Error(`unknown $ref ${ref}`);
  return [other, other];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const KNOWN = new Set(['$schema', '$id', 'title', 'description', 'type', 'required', 'properties', 'additionalProperties', '$defs', '$ref', 'pattern', 'enum', 'const', 'minimum', 'anyOf', 'allOf', 'not']);

function valid(s: Schema, v: unknown, home: Schema): boolean {
  for (const k of Object.keys(s)) if (!KNOWN.has(k)) throw new Error(`the validator does not know ${k}`);
  if (typeof s.$ref === 'string') {
    const [t, h] = deref(s.$ref, home);
    if (!valid(t, v, h)) return false;
  }
  if (s.type !== undefined) {
    const ok = { string: typeof v === 'string', integer: typeof v === 'number' && Number.isInteger(v), boolean: typeof v === 'boolean', object: isObj(v), null: v === null }[s.type as string];
    if (ok === undefined) throw new Error(`the validator does not know type ${String(s.type)}`);
    if (!ok) return false;
  }
  if (s.enum !== undefined && !(s.enum as unknown[]).includes(v)) return false;
  if (Object.hasOwn(s, 'const') && v !== s.const) return false;
  if (typeof s.pattern === 'string' && typeof v === 'string' && !new RegExp(s.pattern, 'u').test(v)) return false;
  if (typeof s.minimum === 'number' && typeof v === 'number' && v < s.minimum) return false;
  if (isObj(v)) {
    for (const r of (s.required ?? []) as string[]) if (!Object.hasOwn(v, r)) return false;
    for (const [k, sub] of Object.entries(props(s))) if (Object.hasOwn(v, k) && !valid(sub, v[k], home)) return false;
    if (s.additionalProperties === false) for (const k of Object.keys(v)) if (!Object.hasOwn(props(s), k)) return false;
  }
  if (Array.isArray(s.anyOf) && !(s.anyOf as Schema[]).some((x) => valid(x, v, home))) return false;
  if (Array.isArray(s.allOf) && !(s.allOf as Schema[]).every((x) => valid(x, v, home))) return false;
  if (isObj(s.not) && valid(s.not, v, home)) return false;
  return true;
}
const validStatus = (v: unknown) => valid(statusSchema, v, statusSchema);
const validConnection = (v: unknown) => valid(connectionSchema, v, connectionSchema);
const validLine = (v: unknown) => valid(defs(workerSchema).status_line!, v, workerSchema);
const validWatchStatus = (v: unknown) => valid(defs(workerSchema).watch_status!, v, workerSchema);
const validKeepalive = (v: unknown) => valid(defs(workerSchema).watch_keepalive!, v, workerSchema);

// ---- the values every field is tried with ----------------------------------------------------------------

const ENV = 'https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt';
const SESSION = 'https://claude.ai/code/session_01N4R9mLRJ5wFbf1oaDe5pyj';
const T = '2026-10-01T12:00:00Z';
const CORPUS: unknown[] = [
  ...[...WORKER_STATES, ...NEEDS, ...CONSENT_SOURCES, ...STOP_REASONS, 'default', 'acceptEdits', 'plan', 'bypassPermissions', 'asleep', 'unknown', 'Online'],
  ...['', ' ', 'x', 'worker', 'na-me_1', 'a'.repeat(32), 'a'.repeat(33), '../x', 'worker\n', '4242', '0', '00', '-1', '4242 ', 'abc', '1e3'],
  ...['env_01X', 'env_', 'env_01X!', 'ENV_01X', 'environment', ENV, SESSION, `${ENV}\n`, 'https://evil.example/code?environment=env_01X', 'http://claude.ai/code/session_1'],
  ...[T, '', '2026-10-01T12:00:00', '2026-10-01 12:00:00', '2026-10-01T12:00:00.000Z', `${T}\n`, ` ${T}`, '2026-10-01T12:00:00z', '2026-99-99T99:99:99Z'],
  ...[0, 1, 4242, 8, 9, 10, 18, -1, 1.5, Number.MAX_SAFE_INTEGER + 2, true, false, null, {}, [], ['worker'], [T]],
  ...[{ loggedIn: true }, { loggedIn: false }, { loggedIn: 'yes' }, { email: 'a@b.edu' }, { loggedIn: true, email: 'a@b.edu', subscriptionType: 'max', checked_at: T }],
  ...[{ loggedIn: true, checked_at: 'yesterday' }, { loggedIn: true, email: 7 }, { loggedIn: true, checked_at: '' }, { loggedIn: true, future: 1 }],
];

/** whether `refused` names key itself or a field inside it */
const names = (refused: string[], key: string) => refused.some((r) => r === key || r.startsWith(`${key}.`));

/**
 * What hpcworker's real writer puts in a field that the field's own schema refuses (hpcworker 3b22e70,
 * framework/jobs/worker.sbatch.tpl): claude_login null until the job's first `claude auth status`
 * (AUTH_JSON=null, :118, written by every write_status before check_auth, :164 to :231), and "" in
 * connection.json's two links, for a resumed session's environment link and for both before Claude
 * Code printed any (:48-49, :492; its test_job.py:260 asserts the ""). Base reads each as absent and
 * never as refused, since nothing was wrong in the files (design section 6.1 asks hpcworker to make
 * writer and schema agree); the schema's refusal is pinned below, so its closing is noticed.
 */
const WRITTEN_THOUGH_REFUSED: Record<string, Record<string, unknown[]>> = {
  'status.json': { claude_login: [null] },
  'connection.json': { session_url: [''], environment_url: [''] },
};
const writtenThoughRefused = (file: string, key: string, value: unknown) => (WRITTEN_THOUGH_REFUSED[file]?.[key] ?? []).some((v) => Object.is(v, value));

// ---- the words, lists and patterns -----------------------------------------------------------------------

describe("the module's lists and patterns are the schemas'", () => {
  it('the state, needs, consent_source and stop_reason lists are status.schema.json enums, in order', () => {
    expect([...WORKER_STATES]).toEqual(props(statusSchema).state!.enum);
    expect([...NEEDS]).toEqual(props(statusSchema).needs!.enum);
    expect([...CONSENT_SOURCES]).toEqual(props(statusSchema).consent_source!.enum);
    expect([...STOP_REASONS]).toEqual(props(statusSchema).stop_reason!.enum);
    expect([...CONNECTION_KEYS.permission_mode]).toEqual(props(connectionSchema).permission_mode!.enum);
  });

  it('every pattern is the one its schema states, character for character', () => {
    const src = (p: unknown) => new RegExp(p as string).source;
    expect(STATUS_PATTERNS.name.source).toBe(src(defs(statusSchema).name!.pattern));
    expect(STATUS_PATTERNS.name.source).toBe(src(props(defs(workerSchema).fields!).run!.pattern));
    expect(STATUS_PATTERNS.job.source).toBe(src(defs(statusSchema).job!.pattern));
    expect(STATUS_PATTERNS.job.source).toBe(src(props(connectionSchema).job!.pattern));
    expect(STATUS_PATTERNS.time.source).toBe(src(defs(statusSchema).time!.pattern));
    expect(STATUS_PATTERNS.time.source).toBe(src(props(defs(workerSchema).scheduler!).checked_at!.pattern));
    expect(STATUS_PATTERNS.time_or_empty.source).toBe(src(defs(statusSchema).time_or_empty!.pattern));
    expect(STATUS_PATTERNS.time_or_empty.source).toBe(src(defs(connectionSchema).time_or_empty!.pattern));
    expect(STATUS_PATTERNS.time_or_empty.source).toBe(src(props(defs(workerSchema).scheduler!).expected_start!.pattern));
    expect(STATUS_PATTERNS.environment_id.source).toBe(src(props(statusSchema).environment_id!.pattern));
    expect(STATUS_PATTERNS.environment_id.source).toBe(src(props(connectionSchema).environment_id!.pattern));
    for (const k of ['capacity', 'next_job']) expect(STATUS_PATTERNS.digits.source, k).toBe(src(props(connectionSchema)[k]!.pattern));
    for (const k of ['job', 'next_job']) expect(STATUS_PATTERNS.digits.source, k).toBe(src(props(defs(workerSchema).fields!)[k]!.pattern));
    for (const re of Object.values(STATUS_PATTERNS)) expect(re.flags, re.source).toBe('');
  });

  it('each minimum is the schema\'s', () => {
    expect(STATUS_KEYS.version.min).toBe(props(statusSchema).version!.minimum);
    expect(STATUS_KEYS.restarts.min).toBe(props(statusSchema).restarts!.minimum);
  });

  it("the status line's prefix is the one lines.json says to read it by", () => {
    expect(lines.families.gate!.rules!.join('\n')).toContain(`(HPCW- or ${STATUS_LINE_PREFIX})`);
  });
});

describe('each key table holds exactly its schema\'s properties, so every required field has its type', () => {
  const same = (table: object, schema: Schema) => {
    expect(Object.keys(table).sort()).toEqual(Object.keys(props(schema)).sort());
    for (const r of (schema.required ?? []) as string[]) expect(Object.keys(table), r).toContain(r);
  };
  it('status.json', () => same(STATUS_KEYS, statusSchema));
  it("status.json's claude_login, whose one required key is the one the reader requires", () => {
    same(CLAUDE_LOGIN_KEYS, props(statusSchema).claude_login!);
    expect(props(statusSchema).claude_login!.required).toEqual(['loggedIn']);
  });
  it('connection.json', () => same(CONNECTION_KEYS, connectionSchema));
  it('the scheduler object', () => same(SCHEDULER_KEYS, defs(workerSchema).scheduler!));
  it('the status line: its string fields in LINE_KEYS, and v, status, connection and scheduler, read apart', () => {
    same({ ...LINE_KEYS, v: 1, status: 1, connection: 1, scheduler: 1 }, defs(workerSchema).fields!);
  });
  it("a watch event's own fields, event and final, are the ones watch_status adds", () => {
    const added = (defs(workerSchema).watch_status!.allOf as Schema[])[1]!;
    expect(Object.keys(props(added)).sort()).toEqual(['event', 'final']);
    expect(added.required).toEqual(['event', 'final']);
    expect(props(added).event!.const).toBe('status');
  });
});

describe("each field's verdict is its schema's, over the corpus", () => {
  /** for one table and the schema of the object it reads: the reader keeps, drops or refuses each value as the schema says */
  function agree(table: Record<string, Kind>, objectSchema: Schema, home: Schema, read: (raw: Record<string, unknown>) => { kept: Record<string, unknown>; refused: string[] }, file = '') {
    let tried = 0;
    for (const [key, kind] of Object.entries(table)) {
      const propSchema = props(objectSchema)[key]!;
      for (const value of CORPUS) {
        const ok = valid(propSchema, value, home);
        const { kept, refused } = read({ [key]: value });
        const label = `${key} = ${JSON.stringify(value)}`;
        // the writer's own values the schema refuses read as absent, quietly
        const written = writtenThoughRefused(file, key, value);
        expect(names(refused, key), label).toBe(!ok && !written);
        if (written) {
          expect(Object.hasOwn(kept, key), label).toBe(false);
          tried++;
          continue;
        }
        // the one value the schema takes and the reader does not keep: "" in a link field, which reads as absent
        const absentOnPurpose = kind === 'link_or_empty' && value === '';
        // claude_login is kept whenever it has a boolean loggedIn, a bad field inside it left out alone
        const keeps = kind === 'login' ? typeof value === 'object' && value !== null && typeof (value as { loggedIn?: unknown }).loggedIn === 'boolean' : ok && !absentOnPurpose;
        expect(Object.hasOwn(kept, key), label).toBe(keeps);
        tried++;
      }
    }
    expect(tried).toBe(Object.keys(table).length * CORPUS.length);
  }

  it('status.json, field by field', () => {
    agree(STATUS_KEYS, statusSchema, statusSchema, (raw) => {
      const r = readStatusFile(raw)!;
      return { kept: r.file as Record<string, unknown>, refused: r.refused };
    }, 'status.json');
  });

  it("status.json's claude_login, field by field, inside an object that has loggedIn", () => {
    agree(CLAUDE_LOGIN_KEYS, props(statusSchema).claude_login!, statusSchema, (raw) => {
      const r = readStatusFile({ claude_login: { loggedIn: true, ...raw } })!;
      const kept = (r.file.claude_login ?? {}) as Record<string, unknown>;
      // loggedIn that is not a boolean refuses the object whole, which is loggedIn's own refusal here
      const refused = r.refused.map((x) => (x === 'claude_login' ? 'loggedIn' : x.replace(/^claude_login\./, '')));
      return { kept: Object.hasOwn(raw, 'loggedIn') ? kept : Object.fromEntries(Object.entries(kept).filter(([k]) => k !== 'loggedIn')), refused };
    });
  });

  it('connection.json, field by field', () => {
    agree(CONNECTION_KEYS, connectionSchema, connectionSchema, (raw) => {
      const r = readConnectionFile(raw)!;
      return { kept: r.file as Record<string, unknown>, refused: r.refused };
    }, 'connection.json');
  });

  it("the status line's scheduler, field by field", () => {
    agree(SCHEDULER_KEYS, defs(workerSchema).scheduler!, workerSchema, (raw) => {
      const s = parseWorkerStatusLine(JSON.stringify({ v: 1, run: 'worker', scheduler: raw }))!;
      return { kept: (s.scheduler ?? {}) as Record<string, unknown>, refused: s.refused.map((x) => x.replace(/^scheduler\./, '')) };
    });
  });

  it("the status line's own string fields, field by field (a bad run is no status at all)", () => {
    const fieldsSchema = defs(workerSchema).fields!;
    for (const [key, kind] of Object.entries(LINE_KEYS)) {
      for (const value of CORPUS) {
        const ok = valid(props(fieldsSchema)[key]!, value, workerSchema);
        const s = parseWorkerStatusLine(JSON.stringify({ v: 1, run: 'worker', [key]: value }));
        const label = `${key} = ${JSON.stringify(value)}`;
        if (key === 'run') {
          expect(s !== undefined, label).toBe(ok);
          continue;
        }
        expect(names(s!.refused, key), label).toBe(!ok);
        expect(s![key as keyof WorkerStatus], label).toBe(ok ? value : '');
        expect(kind).not.toBe('link_or_empty');
      }
    }
  });

  it("the validator itself refuses what hpcworker's own check refuses, so a green verdict means something", () => {
    expect(validStatus({ version: 17, run: 'worker', state: 'asleep' })).toBe(false);
    expect(validKeepalive({ v: 1, event: 'keepalive', at: 'now' })).toBe(false);
    expect(validLine({ v: 1, event: 'keepalive', at: T })).toBe(false);
  });
});

// ---- the vectors ----------------------------------------------------------------------------------------------

describe('every vector the real writer made, through the parser that reads it', () => {
  const fileVectors = vectors.filter((v) => v.kind === 'file' && (v.file === 'status.json' || v.file === 'connection.json'));
  const lineVectors = vectors.filter((v) => /^(worker-status-|gate-status$)/.test(v.vector));

  it('the vectors read are every status-*, connection-*, worker-status-* and gate-status one', () => {
    const wanted = vectors.filter((v) => /^(status-|connection-|worker-status-|gate-status$)/.test(v.vector)).map((v) => v.vector).sort();
    expect([...fileVectors, ...lineVectors].map((v) => v.vector).sort()).toEqual(wanted);
    expect(wanted).toEqual(['connection-online', 'gate-status', 'status-online', 'status-queued', 'status-stopped', 'worker-status-missing', 'worker-status-queued']);
  });

  it('each status.json and connection.json reads as exactly what its JSON says, nothing refused, and passes its schema', () => {
    for (const v of fileVectors) {
      const r = v.file === 'status.json' ? readStatusFile(v.json) : readConnectionFile(v.json);
      expect(r, v.vector).toEqual({ file: v.json, refused: [] });
      expect(v.file === 'status.json' ? validStatus(v.json) : validConnection(v.json), v.vector).toBe(true);
    }
  });

  it("each status command's output reads as its one JSON line, whole, nothing refused", () => {
    for (const v of lineVectors.filter((x) => x.exit === 0)) {
      expect(v.stdout!.length, v.vector).toBe(1);
      const want = JSON.parse(v.stdout![0]!) as Record<string, unknown>;
      expect(validLine(want), v.vector).toBe(true);
      expect(parseWorkerStatus(v.stdout!.join('\n')), v.vector).toEqual({ ...want, refused: [] });
      expect(parseWorkerStatusLine(v.stdout![0]!), v.vector).toEqual({ ...want, refused: [] });
    }
  });

  it('worker-status-missing: nothing on standard output, and its standard error is no status either', () => {
    const v = V('worker-status-missing');
    expect(v.exit).toBe(1);
    expect(parseWorkerStatus(v.stdout!.join('\n'))).toBeUndefined();
    expect(parseWorkerStatus(v.stderr!.join('\n'))).toBeUndefined();
  });

  it('the files inside the line read as the same files read alone', () => {
    const s = parseWorkerStatus(V('gate-status').stdout![0]!)!;
    expect(s.status).toEqual(readStatusFile(JSON.parse(V('gate-status').stdout![0]!).status)!.file);
    expect(s.connection).toBeNull();
    expect(s.scheduler).toEqual({ state: 'PENDING', reason: 'Priority', expected_start: '', node: '', checked_at: T });
  });
});

// ---- finding the line -----------------------------------------------------------------------------------------

describe('the line is found by its prefix, after cleanLine', () => {
  const LINE = V('gate-status').stdout![0]!;
  const WANT = { ...(JSON.parse(LINE) as object), refused: [] };

  it('after a ~/.bashrc printed first, with carriage returns and terminal codes', () => {
    expect(parseWorkerStatus(`Welcome to the grid\nModule warning: apptainer loaded\n${LINE}\n`)).toEqual(WANT);
    expect(parseWorkerStatus(`motd\r\n${LINE}\r\n`)).toEqual(WANT);
    expect(parseWorkerStatus(`\x1b[?2004l\x1b[0m${LINE}\x1b[K\n`)).toEqual(WANT);
    // `tput sgr0` prints a charset designation, ESC ( B, before its reset
    expect(parseWorkerStatus(`\x1b(B\x1b[m${LINE}\n`)).toEqual(WANT);
    expect(stoppedLine('\x1b(B\x1b[mworker w: stopped (request)')).toBe('worker w: stopped (request)');
    expect(parseWorkerStatus(`{not json at all\n${LINE}`)).toEqual(WANT);
  });

  it('with a keepalive glued before, after or inside it', () => {
    expect(parseWorkerStatus(`${KEEPALIVE}${LINE}`)).toEqual(WANT);
    expect(parseWorkerStatus(`${LINE}${KEEPALIVE}`)).toEqual(WANT);
    expect(parseWorkerStatus(`${KEEPALIVE}\n${KEEPALIVE}${LINE}${KEEPALIVE}\n`)).toEqual(WANT);
    const cut = LINE.indexOf('"state_dir"');
    expect(parseWorkerStatus(`${LINE.slice(0, cut)}${KEEPALIVE}${LINE.slice(cut)}`)).toEqual(WANT);
  });

  it('the first status line wins', () => {
    const other = LINE.replace('"run":"worker"', '"run":"thesis"');
    expect(parseWorkerStatus(`${LINE}\n${other}`)!.run).toBe('worker');
    expect(parseWorkerStatus(`${other}\n${LINE}`)!.run).toBe('thesis');
  });

  it('a line that does not start with the prefix is no status, however much JSON it is', () => {
    expect(parseWorkerStatus(LINE.replace('{"v":1,', '{"v": 1, '))).toBeUndefined();
    expect(parseWorkerStatus(LINE.replace('{"v":1,', '{ "v":1,'))).toBeUndefined();
    expect(parseWorkerStatus(`hpcworker: ${LINE}`)).toBeUndefined();
    expect(parseWorkerStatus(LINE.replace(/^\{"v":1,(.*)\}$/, '{$1,"v":1}'))).toBeUndefined();
    // the prefix inside the line, never at its start: a JSON object whose first key is not v
    const inside = LINE.replace('{"v":1,', '{"x":{"v":1},"v":1,');
    expect(inside).toContain(STATUS_LINE_PREFIX);
    expect(JSON.parse(inside)).toMatchObject({ v: 1, run: 'worker' });
    expect(parseWorkerStatus(inside)).toBeUndefined();
    expect(parseWorkerStatusLine(inside)).toBeUndefined();
  });

  it('malformed JSON, a v other than 1, or a run that is no worker name reads as no status', () => {
    expect(parseWorkerStatus(LINE.slice(0, -1))).toBeUndefined();
    expect(parseWorkerStatus(`${LINE},`)).toBeUndefined();
    expect(parseWorkerStatus(`${LINE}${LINE}`)).toBeUndefined();
    expect(parseWorkerStatus('{"v":1')).toBeUndefined();
    expect(parseWorkerStatus('{"v":1}')).toBeUndefined();
    expect(parseWorkerStatus(LINE.replace('{"v":1,', '{"v":10,'))).toBeUndefined();
    expect(parseWorkerStatus(LINE.replace('{"v":1,', '{"v":1.5,'))).toBeUndefined();
    expect(parseWorkerStatus(LINE.replace('{"v":1,', '{"v":2,"w":1,'))).toBeUndefined();
    expect(parseWorkerStatus(LINE.replace('"run":"worker"', '"run":"../worker"'))).toBeUndefined();
    expect(parseWorkerStatus(LINE.replace('"run":"worker"', `"run":"${'w'.repeat(33)}"`))).toBeUndefined();
    expect(parseWorkerStatus(LINE.replace('"run":"worker"', '"run":7'))).toBeUndefined();
    expect(parseWorkerStatus('')).toBeUndefined();
  });

  it("v: a JSON 1.0 is the number 1, so it reads (the prefix is all lines.json asks of the text)", () => {
    expect(parseWorkerStatus(LINE.replace('{"v":1,', '{"v":1.0,'))).toEqual(WANT);
  });
});

describe('the watch: its status events read, its keepalive never does', () => {
  const LINE = V('gate-status').stdout![0]!;
  // hpcworker's watch_json puts its event and final right after "v":1, (bin/hpcworker status_json's PREFIX)
  const event = (final: boolean) => LINE.replace('{"v":1,', `{"v":1,"event":"status","final":${final},`);
  const KEEPALIVE_EVENT = `{"v":1,"event":"keepalive","at":"${T}"}`;

  it('a keepalive event is the schema\'s keepalive and not a status line, and reads as no status', () => {
    expect(validKeepalive(JSON.parse(KEEPALIVE_EVENT))).toBe(true);
    expect(validLine(JSON.parse(KEEPALIVE_EVENT))).toBe(false);
    expect(parseWorkerStatusLine(KEEPALIVE_EVENT)).toBeUndefined();
    expect(parseWorkerStatus(`${KEEPALIVE_EVENT}\n${KEEPALIVE_EVENT}\n`)).toBeUndefined();
  });

  it('even a keepalive that carries every field of a status reads as no status', () => {
    const disguised = LINE.replace('{"v":1,', `{"v":1,"event":"keepalive","at":"${T}",`);
    expect(parseWorkerStatusLine(disguised)).toBeUndefined();
    expect(parseWorkerStatusLine(LINE.replace('{"v":1,', '{"v":1,"event":"progress",'))).toBeUndefined();
  });

  it('a status event reads with its event and final, after keepalives', () => {
    for (const final of [false, true]) {
      const line = event(final);
      expect(validWatchStatus(JSON.parse(line))).toBe(true);
      const want = { ...(JSON.parse(line) as object), refused: [] };
      expect(parseWorkerStatus(`${KEEPALIVE_EVENT}\n${KEEPALIVE_EVENT}\n${line}\n`)).toEqual(want);
    }
  });

  it('a status event without a boolean final keeps its event and names final as refused', () => {
    const s = parseWorkerStatusLine(LINE.replace('{"v":1,', '{"v":1,"event":"status","final":"yes",'))!;
    expect(s.event).toBe('status');
    expect(s.final).toBeUndefined();
    expect(s.refused).toEqual(['final']);
  });

  it('a status line without event is no watch event: final alone is an unknown field', () => {
    const s = parseWorkerStatusLine(LINE.replace('{"v":1,', '{"v":1,"final":true,'))!;
    expect(s).toEqual({ ...(JSON.parse(LINE) as object), refused: [] });
  });
});

// ---- what reads as absent -------------------------------------------------------------------------------------

describe('a field that is not what its schema says reads as absent, and is named', () => {
  const online = V('status-online').json!;
  const conn = V('connection-online').json!;

  it('a status.json link that is not a Claude Code link reads as absent, so no edition can open it', () => {
    const r = readStatusFile({ ...online, session_url: 'https://evil.example/code?environment=env_01X', environment_url: `${ENV}\n` })!;
    expect(r.file.session_url).toBeUndefined();
    expect(r.file.environment_url).toBeUndefined();
    expect(r.refused).toEqual(['session_url', 'environment_url']);
    expect(r.file.state).toBe('online');
  });

  it('a status.json link of "" reads as absent and is not refused: the schema allows it for "no link yet"', () => {
    const r = readStatusFile({ ...online, session_url: '', environment_url: '' })!;
    expect(Object.hasOwn(r.file, 'session_url') || Object.hasOwn(r.file, 'environment_url')).toBe(false);
    expect(r.refused).toEqual([]);
  });

  it('a connection.json link of "" reads as absent and is not refused, as the job writes it; any other bad link is refused', () => {
    const r = readConnectionFile({ ...conn, session_url: '', environment_url: 'javascript:alert(1)' })!;
    expect(Object.hasOwn(r.file, 'session_url') || Object.hasOwn(r.file, 'environment_url')).toBe(false);
    expect(r.refused).toEqual(['environment_url']);
  });

  it("the job's connection.json of a resumed session, and of a registration before any link was printed, reads with nothing refused", () => {
    // worker.sbatch.tpl:48-49 and :492: environment_url is "" unless an environment link was printed, and
    // the first online write may come before any link (hpcworker's test_job.py:260 asserts both "")
    const resumed = { ...conn, session_url: SESSION, environment_url: '', environment_id: '', resumed: true };
    expect(readConnectionFile(resumed)).toEqual({ file: { ...resumed, environment_url: undefined }, refused: [] });
    expect(Object.hasOwn(readConnectionFile(resumed)!.file, 'environment_url')).toBe(false);
    const noLink = { ...conn, session_url: '', environment_url: '', environment_id: '' };
    const r = readConnectionFile(noLink)!;
    expect(r.refused).toEqual([]);
    expect(Object.hasOwn(r.file, 'session_url') || Object.hasOwn(r.file, 'environment_url')).toBe(false);
    expect(r.file.session_name).toBe(conn.session_name);
    // inside the line too
    const LINE = JSON.parse(V('gate-status').stdout![0]!) as Record<string, unknown>;
    expect(parseWorkerStatusLine(JSON.stringify({ ...LINE, connection: resumed }))!.refused).toEqual([]);
  });

  it("the job's first status.json, written before its first `claude auth status` with claude_login null, reads with nothing refused", () => {
    // worker.sbatch.tpl:118 AUTH_JSON=null, :138 "claude_login":%s, :164 write_status starting, before :252 check_auth
    const first = { ...online, state: 'starting', message: 'got a computer; checking the container and the sign-in', needs: 'nothing', online_at: '', session_url: '', environment_url: '', environment_id: '', claude_login: null, rc_alive: false };
    const r = readStatusFile(first)!;
    expect(r.refused).toEqual([]);
    expect(Object.hasOwn(r.file, 'claude_login')).toBe(false);
    expect(r.file.state).toBe('starting');
    // an error written there keeps the null for good (worker.sbatch.tpl:195, the image not readable)
    expect(readStatusFile({ ...first, state: 'error', message: 'the container image is not readable' })!.refused).toEqual([]);
    const LINE = JSON.parse(V('gate-status').stdout![0]!) as Record<string, unknown>;
    expect(parseWorkerStatusLine(JSON.stringify({ ...LINE, status: first }))!.refused).toEqual([]);
  });

  it("is a contract gap: the schemas refuse what the writer writes there, a disagreement this test pins so that its closing is noticed", () => {
    for (const [file, fields] of Object.entries(WRITTEN_THOUGH_REFUSED)) {
      const schema = file === 'status.json' ? statusSchema : connectionSchema;
      for (const [key, values] of Object.entries(fields)) for (const v of values) expect(valid(props(schema)[key]!, v, schema), `${file} ${key} = ${JSON.stringify(v)}`).toBe(false);
    }
    // and no vector shows the job's first write or a resumed session's connection.json
    expect(vectors.some((v) => v.json?.claude_login === null)).toBe(false);
    expect(vectors.some((v) => v.file === 'connection.json' && v.json?.environment_url === '')).toBe(false);
  });

  it("a PBS job id (7890123.pbsserver01, which hpcworker's own pbs_parse_submit keeps whole) is refused as every schema refuses it: a gap this test pins so that its closing is noticed (design 6.1)", () => {
    // framework/lib/adapters/pbs.sh at 3b22e70 and its test_adapters.py:83; the schemas take digits only
    const PBS = '7890123.pbsserver01';
    expect(valid(props(statusSchema).job!, PBS, statusSchema)).toBe(false);
    expect(valid(props(statusSchema).next_job!, PBS, statusSchema)).toBe(false);
    expect(valid(props(defs(workerSchema).fields!).job!, PBS, workerSchema)).toBe(false);
    expect(valid(props(defs(workerSchema).fields!).next_job!, PBS, workerSchema)).toBe(false);
    const r = readStatusFile({ ...online, job: PBS, next_job: `${PBS}x` })!;
    expect(r.refused).toEqual(['job', 'next_job']);
    expect(Object.hasOwn(r.file, 'job')).toBe(false);
    const LINE = JSON.parse(V('gate-status').stdout![0]!) as Record<string, unknown>;
    const s = parseWorkerStatusLine(JSON.stringify({ ...LINE, job: PBS, status: { ...(LINE.status as object), job: PBS } }))!;
    expect(s.job).toBe('');
    expect(s.status!.job).toBeUndefined();
    expect(s.refused).toEqual(['job', 'status.job']);
  });

  it('inside the line, a bad link is named by its path', () => {
    const LINE = V('gate-status').stdout![0]!;
    const j = JSON.parse(LINE) as { status: Record<string, unknown>; connection: unknown };
    j.status.session_url = 'https://claude.ai.evil.example/code/session_x';
    j.connection = { ...conn, environment_url: 'https://claude.ai/code/session_x/../../oauth' };
    const s = parseWorkerStatus(`${STATUS_LINE_PREFIX},${JSON.stringify(j).slice('{"v":1,'.length)}`)!;
    expect(s.status!.session_url).toBeUndefined();
    expect(s.connection!.environment_url).toBeUndefined();
    expect(s.connection!.session_url).toBe(conn.session_url);
    expect(s.refused).toEqual(['status.session_url', 'connection.environment_url']);
  });

  it("an unknown state, needs or consent_source reads as absent: the edition says what it does with one it cannot read", () => {
    const r = readStatusFile({ ...online, state: 'hibernating', needs: 'coffee', consent_source: 'guess', stop_reason: 'boredom' })!;
    for (const k of ['state', 'needs', 'consent_source', 'stop_reason'] as const) expect(r.file[k], k).toBeUndefined();
    expect(r.refused).toEqual(['state', 'needs', 'consent_source', 'stop_reason']);
  });

  it('a claude_login without a boolean loggedIn is refused whole; a bad field inside one that has it, alone', () => {
    expect(readStatusFile({ claude_login: { email: 'a@b.edu' } })).toEqual({ file: {}, refused: ['claude_login'] });
    expect(readStatusFile({ claude_login: { loggedIn: true, email: 7, checked_at: T } })).toEqual({ file: { claude_login: { loggedIn: true, checked_at: T } }, refused: ['claude_login.email'] });
  });

  it('a status, connection or scheduler that is not an object reads as null and is named; null or left out reads as null quietly', () => {
    expect(parseWorkerStatusLine('{"v":1,"run":"worker","status":"online","connection":[],"scheduler":7}')).toMatchObject({ status: null, connection: null, scheduler: null, refused: ['status', 'connection', 'scheduler'] });
    expect(parseWorkerStatusLine('{"v":1,"run":"worker","status":null}')).toMatchObject({ status: null, connection: null, scheduler: null, refused: [] });
  });

  it("anything that is not a JSON object is no file", () => {
    for (const x of [undefined, null, 'status', 1, [], [online]]) {
      expect(readStatusFile(x)).toBeUndefined();
      expect(readConnectionFile(x)).toBeUndefined();
    }
  });
});

describe('within v:1, additions are ignored and an older writer still reads', () => {
  const LINE = V('gate-status').stdout![0]!;

  it('unknown fields are ignored at every level: the line, status.json, connection.json, the scheduler, claude_login', () => {
    const j = JSON.parse(LINE) as Record<string, Record<string, unknown>>;
    const plus = {
      ...j,
      future: { any: 1 },
      status: { ...j.status, future_field: 'x', claude_login: { loggedIn: true, email: 'a@b.edu', token: 'never read' } },
      connection: { ...V('connection-online').json!, future_field: 2 },
      scheduler: { ...j.scheduler, partition: 'secp' },
    };
    const s = parseWorkerStatus(`{"v":1,${JSON.stringify(plus).slice(1).replace('"v":1,', '')}`)!;
    expect(s.refused).toEqual([]);
    expect(s.status).toEqual({ ...j.status, claude_login: { loggedIn: true, email: 'a@b.edu' } });
    expect(s.connection).toEqual(V('connection-online').json);
    expect(s.scheduler).toEqual(j.scheduler);
    expect(Object.hasOwn(s, 'future')).toBe(false);
  });

  it("an older writer's line, without the fields framework 10 added, reads with the contract's none for each", () => {
    const s = parseWorkerStatusLine('{"v":1,"run":"worker","job":"4242","next_job":"","status":{"state":"online","job":"4242"},"connection":null}')!;
    expect(s).toEqual({ v: 1, run: 'worker', job: '4242', next_job: '', state_dir: '', status: { state: 'online', job: '4242' }, connection: null, scheduler: null, line: '', refused: [] });
  });

  it('a status.json with only some fields keeps those and invents none', () => {
    expect(readStatusFile({ state: 'queued', job: '40501234' })).toEqual({ file: { state: 'queued', job: '40501234' }, refused: [] });
    expect(readStatusFile({})).toEqual({ file: {}, refused: [] });
  });
});

// ---- the stopped line -----------------------------------------------------------------------------------------

describe("`worker stop`'s line (V11 section 7.1)", () => {
  it('is found after whatever printed first, cleaned, as hpcworker wrote it', () => {
    expect(stoppedLine('bashrc\nworker worker: stopped (request; the chain ended)\n')).toBe('worker worker: stopped (request; the chain ended)');
    expect(stoppedLine('\x1b[0mworker thesis: stopped (cancelled at the scheduler: 4242,4243; the chain ended)\r\n')).toBe('worker thesis: stopped (cancelled at the scheduler: 4242,4243; the chain ended)');
    expect(stoppedLine(`${KEEPALIVE}worker w: stopped (request)`)).toBe('worker w: stopped (request)');
  });

  it('is nothing else: another verb, the error, a line that only mentions it', () => {
    for (const s of ['', 'worker worker: marked restricted (/x/.restricted)', 'hpcworker: no worker named worker', 'worker worker: stopping', 'the worker worker: stopped (x)', 'worker  worker: stopped (x)', 'worker worker: stopped']) {
      expect(stoppedLine(s), s).toBeUndefined();
    }
  });

  it('is in no line family of lines.json and in no vector: a contract gap this test pins, so its closing is noticed', () => {
    const line = 'worker worker: stopped (request; the chain ended)';
    for (const [name, fam] of Object.entries(lines.families)) for (const l of fam.lines ?? []) expect(new RegExp(l.pattern).test(line), `${name}: ${l.pattern}`).toBe(false);
    expect(vectors.some((v) => /\bstop\b/.test(v.command ?? ''))).toBe(false);
    expect(STOPPED_LINE.flags).toBe('');
  });
});
