// src/diagnostics.ts, the check engine the browser and VS Code editions share. There is nothing of the
// contract here: the engine's source is the two editions' own engines (beethoven-extension ae11a00
// and beethoven-vscode e7526f9, extension/src/core/diagnostics.ts in both), so their tests of the
// engine are ported below (not their tests of their checks), and the old engine itself is kept here,
// statement for statement, to run beside base's on generated graphs: with each edition's words, guard
// and clock handed in, base must write the reports that edition's engine wrote. The rest pins what
// base adds: a graph problem named the same way every time, codes for what the engine decided, no
// sentence, timer or clock of base's own.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  graphProblem,
  GraphError,
  GUARD_PHASES,
  NODE_STATUSES,
  order,
  REASONS,
  REPAIR_OUTCOMES,
  runDiagnostics,
  type CheckResult,
  type DiagNode,
  type DiagReport,
  type DiagWords,
  type GraphNode,
  type GuardStep,
  type NodeReport,
  type NodeStatus,
  type RunOpts,
} from '../src/diagnostics.js';

type Layer = 'laptop' | 'grid';
type Fix = string;
interface Ctx {
  broken: Set<string>;
  repaired: string[];
  calls: string[];
}
type Node = DiagNode<Ctx, Layer, Fix>;
const fresh = (broken: string[] = []): Ctx => ({ broken: new Set(broken), repaired: [], calls: [] });
// a title unlike the id, so a word that names the title is told from one that names the id
const titleOf = (id: string) => id.toUpperCase();
const node = (id: string, deps: string[] = [], extra: Partial<Node> = {}): Node => ({
  id,
  title: titleOf(id),
  layer: 'laptop',
  dependsOn: deps,
  manualFix: `fix ${id}`,
  async check(c) {
    c.calls.push(id);
    return c.broken.has(id) ? { ok: false, detail: `${id} broken` } : { ok: true, detail: `${id} ok` };
  },
  ...extra,
});
const byId = <L extends string, F>(rep: DiagReport<L, F>) => Object.fromEntries(rep.reports.map((r) => [r.id, r])) as Record<string, NodeReport<L, F>>;
const fixing = (id: string): Partial<Node> => ({
  async repair(c) {
    c.broken.delete(id);
    c.repaired.push(id);
    return { ok: true, detail: 'installed' };
  },
});

// ---- each edition's own words, guard and clock, as its engine wrote them ---------------------------
// The three sentences in which the two engines differ, and the four they share, copied from their
// template strings (ae11a00 and e7526f9, runDiagnostics).
const BROWSER_WORDS: DiagWords = {
  blocked: (on) => `waits on "${on.title}"`,
  notApplicable: (on) => `not applicable ("${on.title}" is not)`,
  fullRunOnly: () => 'checked in a full run',
  crashed: (m) => `check crashed: ${m}`,
  repaired: (now, was) => `${now} (was: ${was})`,
  stillFails: (was, repair, again) => `${was}; repair ran (${repair}) but the check still fails: ${again}`,
  repairCrashed: (m) => `repair crashed: ${m}`,
};
const VSCODE_WORDS: DiagWords = {
  ...BROWSER_WORDS,
  blocked: (on) => `waits on ${on.title}`,
  notApplicable: (on) => `not applicable (${on.title} is not)`,
  fullRunOnly: () => 'checked in a full Troubleshoot',
};

/** both engines' withTimeout, unchanged: the timer each edition keeps */
async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<T>((_, rej) => (t = setTimeout(() => rej(new Error(`${what} timed out after ${Math.round(ms / 1000)} s`)), ms)))]);
  } finally {
    if (t) clearTimeout(t);
  }
}
/** each engine's limits as a guard: the run's timeoutMs (90 s unless given) for a check, 300 s for a repair */
const editionGuard =
  (timeoutMs = 90_000) =>
  (work: () => Promise<unknown>, step: GuardStep): Promise<unknown> =>
    step.phase === 'repair' ? withTimeout(work(), 300_000, `repair of ${step.title}`) : withTimeout(work(), timeoutMs, step.title);

// ---- the engine base replaces, as it ran ---------------------------------------------------------
// order() and runDiagnostics() of beethoven-extension ae11a00 extension/src/core/diagnostics.ts, every
// statement as it was; beethoven-vscode e7526f9's are the same statements but for the three sentences
// the `edition` argument chooses and the fix field's name (fixCommand for fixAction). Only the types
// are written short.
type LegacyEdition = 'browser' | 'vscode';
interface LegacyNode {
  id: string;
  title: string;
  layer: string;
  dependsOn: string[];
  check(ctx: Ctx): Promise<CheckResult>;
  repair?(ctx: Ctx): Promise<{ ok: boolean; detail: string }>;
  manualFix: string;
  fixAction?: string;
  fixCommand?: string;
  slow?: boolean;
}
interface LegacyReport {
  id: string;
  title: string;
  layer: string;
  status: NodeStatus;
  detail: string;
  rootCause?: string;
  repair?: string;
  manualFix?: string;
  fixAction?: string;
  fixCommand?: string;
  ms: number;
}
interface LegacyOpts {
  repair?: boolean;
  quick?: boolean;
  timeoutMs?: number;
}

function legacyOrder<N extends { id: string; dependsOn: readonly string[] }>(nodes: N[]): N[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) for (const d of n.dependsOn) if (!byId.has(d)) throw new Error(`diagnostics graph: ${n.id} depends on unknown ${d}`);
  const out: N[] = [];
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (n: N, stack: string[]) => {
    const s = state.get(n.id) ?? 0;
    if (s === 2) return;
    if (s === 1) throw new Error(`diagnostics graph: cycle ${[...stack, n.id].join(' -> ')}`);
    state.set(n.id, 1);
    for (const d of n.dependsOn) visit(byId.get(d)!, [...stack, n.id]);
    state.set(n.id, 2);
    out.push(n);
  };
  for (const n of nodes) visit(n, []);
  return out;
}

async function legacyRun(edition: LegacyEdition, nodes: LegacyNode[], ctx: Ctx, opts: LegacyOpts = {}) {
  const q = edition === 'browser' ? (t: string) => `"${t}"` : (t: string) => t;
  const started = new Date().toISOString();
  const ordered = legacyOrder(nodes);
  const byId = new Map<string, LegacyReport>();
  const reports: LegacyReport[] = [];
  for (const n of ordered) {
    const t0 = Date.now();
    let r: LegacyReport;
    const badDep = n.dependsOn.map((d) => byId.get(d)!).find((d) => d.status === 'fail' || d.status === 'blocked');
    const skippedDep = n.dependsOn.map((d) => byId.get(d)!).find((d) => d.status === 'skipped');
    if (badDep) {
      r = { id: n.id, title: n.title, layer: n.layer, status: 'blocked', detail: `waits on ${q(badDep.title)}`, rootCause: badDep.rootCause ?? badDep.id, ms: 0 };
    } else if (skippedDep) {
      r = { id: n.id, title: n.title, layer: n.layer, status: 'skipped', detail: `not applicable (${q(skippedDep.title)} is not)`, ms: 0 };
    } else if (opts.quick && n.slow) {
      r = { id: n.id, title: n.title, layer: n.layer, status: 'skipped', detail: edition === 'browser' ? 'checked in a full run' : 'checked in a full Troubleshoot', ms: 0 };
    } else {
      let c: CheckResult;
      try {
        c = await withTimeout(n.check(ctx), opts.timeoutMs ?? 90_000, n.title);
      } catch (e) {
        c = { ok: false, detail: `check crashed: ${(e as Error).message}` };
      }
      if (c.skip) r = { id: n.id, title: n.title, layer: n.layer, status: 'skipped', detail: c.detail, ms: Date.now() - t0 };
      else if (c.ok) r = { id: n.id, title: n.title, layer: n.layer, status: c.warn ? 'warn' : 'ok', detail: c.detail, ms: Date.now() - t0 };
      else {
        const fixKey = edition === 'browser' ? 'fixAction' : 'fixCommand';
        r = { id: n.id, title: n.title, layer: n.layer, status: 'fail', detail: c.detail, manualFix: n.manualFix, ...(n[fixKey] ? { [fixKey]: n[fixKey] } : {}), ms: Date.now() - t0 };
        if (opts.repair && n.repair) {
          try {
            const rp = await withTimeout(n.repair(ctx), 300_000, `repair of ${n.title}`);
            r.repair = rp.detail;
            if (rp.ok) {
              const again = await withTimeout(n.check(ctx), opts.timeoutMs ?? 90_000, n.title);
              if (again.ok) r = { ...r, status: 'repaired', detail: `${again.detail} (was: ${c.detail})` };
              else r.detail = `${c.detail}; repair ran (${rp.detail}) but the check still fails: ${again.detail}`;
            }
          } catch (e) {
            r.repair = `repair crashed: ${(e as Error).message}`;
          }
        }
      }
    }
    byId.set(n.id, r);
    reports.push(r);
  }
  const rootCauses = reports.filter((r) => r.status === 'fail');
  return { started, finished: new Date().toISOString(), reports, rootCauses, ok: rootCauses.length === 0 };
}

// ---- the lists base exports -----------------------------------------------------------------------

describe('the codes', () => {
  it('are the six statuses both editions report, and the reasons, repair outcomes and guard phases base adds', () => {
    expect([...NODE_STATUSES]).toEqual(['ok', 'warn', 'fail', 'repaired', 'blocked', 'skipped']);
    expect([...REASONS]).toEqual(['dependency-failed', 'dependency-skipped', 'full-run-only', 'crashed']);
    expect([...REPAIR_OUTCOMES]).toEqual(['repaired', 'failed', 'still-fails', 'crashed', 'recheck-crashed']);
    expect([...GUARD_PHASES]).toEqual(['check', 'repair', 'recheck']);
  });
});

// ---- the order and the graph's problems ----------------------------------------------------------

describe('the order', () => {
  it('is topological (VS Code: "order is topological")', () => {
    expect(order([node('c', ['b']), node('b', ['a']), node('a')]).map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the list as it is when every dependency is earlier in it (the browser: its seventeen checks in their order)', () => {
    const list = [node('a'), node('b', ['a']), node('c'), node('d', ['c', 'a']), node('e', ['b', 'd'])];
    expect(order(list).map((n) => n.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it("puts a node's dependencies before it, in its dependsOn order, and keeps the list's order otherwise", () => {
    const list = [node('x'), node('a', ['c', 'b']), node('b'), node('c'), node('y')];
    expect(order(list).map((n) => n.id)).toEqual(['x', 'c', 'b', 'a', 'y']);
    expect(order(list).map((n) => n.id)).toEqual(legacyOrder(list).map((n) => n.id));
  });

  it('returns the nodes it was given, every one once', () => {
    const list = [node('b', ['a']), node('a')];
    const out = order(list);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(list[1]);
    expect(out[1]).toBe(list[0]);
  });

  it('walks a chain far longer than any graph without overflowing the stack (the editions recursed)', () => {
    const chain: GraphNode[] = Array.from({ length: 50_000 }, (_, i) => ({ id: `n${i}`, dependsOn: i === 0 ? [] : [`n${i - 1}`] }));
    const out = order([...chain].reverse());
    expect(out[0]!.id).toBe('n0');
    expect(out[49_999]!.id).toBe('n49999');
    expect(graphProblem([...chain, { id: 'n0x', dependsOn: ['n49999'] }])).toBeUndefined();
  });

  it('of an empty graph is empty', () => {
    expect(order([])).toEqual([]);
    expect(graphProblem([])).toBeUndefined();
  });
});

describe("a graph's problem", () => {
  it('is an unknown dependency: the first node in the list that has one, and its first unknown dependency', () => {
    expect(graphProblem([node('a', ['missing'])])).toEqual({ code: 'unknown', id: 'a', dependency: 'missing' });
    expect(graphProblem([node('a'), node('b', ['a', 'p', 'q']), node('c', ['r'])])).toEqual({ code: 'unknown', id: 'b', dependency: 'p' });
  });

  it('is a cycle, named from the first node met twice back to itself, without the path that led to it', () => {
    expect(graphProblem([node('a', ['b']), node('b', ['a'])])).toEqual({ code: 'cycle', cycle: ['a', 'b', 'a'] });
    expect(graphProblem([node('x', ['a']), node('a', ['b']), node('b', ['a'])])).toEqual({ code: 'cycle', cycle: ['a', 'b', 'a'] });
    expect(graphProblem([node('a', ['a'])])).toEqual({ code: 'cycle', cycle: ['a', 'a'] });
  });

  it('is the cycle the walk from the list meets first, when there are two', () => {
    const two = [node('p', ['q']), node('q', ['p']), node('a', ['b']), node('b', ['a'])];
    expect(graphProblem(two)).toEqual({ code: 'cycle', cycle: ['p', 'q', 'p'] });
    expect(graphProblem([...two.slice(2), ...two.slice(0, 2)])).toEqual({ code: 'cycle', cycle: ['a', 'b', 'a'] });
  });

  it('is a duplicate id before anything else (the editions ran one of the two and dropped the other)', () => {
    expect(graphProblem([node('a'), node('b'), node('a')])).toEqual({ code: 'duplicate', id: 'a' });
    expect(graphProblem([node('a', ['nope']), node('b', ['b']), node('b')])).toEqual({ code: 'duplicate', id: 'b' });
  });

  it('is an unknown dependency before a cycle, wherever each is in the list', () => {
    expect(graphProblem([node('a', ['b']), node('b', ['a']), node('c', ['nope'])])).toEqual({ code: 'unknown', id: 'c', dependency: 'nope' });
  });

  it('is the same every time for the same list', () => {
    const bad = [node('x', ['a']), node('a', ['b']), node('b', ['c']), node('c', ['a'])];
    const first = graphProblem(bad);
    for (let i = 0; i < 5; i += 1) expect(graphProblem(bad)).toEqual(first);
  });

  it('makes order throw a GraphError that carries it, with only its code and ids in the message', () => {
    const bad = [node('a', ['b']), node('b', ['a'])];
    let thrown: unknown;
    try {
      order(bad);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(GraphError);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as GraphError).problem).toEqual(graphProblem(bad));
    expect((thrown as GraphError).message).toBe('diagnostics graph cycle: a -> b -> a');
    expect((thrown as GraphError).name).toBe('GraphError');
    // the two editions' tests: /unknown/ and /cycle/ still match
    expect(() => order([node('a', ['missing'])])).toThrow('diagnostics graph unknown: a -> missing');
    expect(() => order([node('a'), node('a')])).toThrow('diagnostics graph duplicate: a');
  });

  it('refuses the run before any check runs and before any report is made', async () => {
    const ctx = fresh();
    const seen: string[] = [];
    const run = runDiagnostics([node('ok'), node('a', ['b']), node('b', ['a'])], ctx, { onNode: (r) => seen.push(r.id) });
    await expect(run).rejects.toBeInstanceOf(GraphError);
    expect(ctx.calls).toEqual([]);
    expect(seen).toEqual([]);
  });
});

// ---- a run --------------------------------------------------------------------------------------

describe('a run', () => {
  it('blocks the dependants of a failure and names it as their root cause (VS Code)', async () => {
    const ctx = fresh(['ssh']);
    const rep = await runDiagnostics([node('openssh'), node('ssh', ['openssh']), node('grid', ['ssh']), node('worker', ['grid']), node('tokens')], ctx);
    const by = byId(rep);
    expect(by.openssh!.status).toBe('ok');
    expect(by.ssh!.status).toBe('fail');
    expect(by.grid!.status).toBe('blocked');
    expect(by.worker!.status).toBe('blocked');
    expect(by.worker!.rootCause).toBe('ssh');
    expect(by.worker!.waitsOn).toBe('grid');
    expect(by.worker!.reason).toBe('dependency-failed');
    expect(by.tokens!.status).toBe('ok');
    expect(rep.rootCauses.map((r) => r.id)).toEqual(['ssh']);
    expect(rep.ok).toBe(false);
    // a blocked node is never checked
    expect(ctx.calls).toEqual(['openssh', 'ssh', 'tokens']);
  });

  it('lists as root causes the failing nodes only, in the order they ran (the browser: origin-granted, then data-classification)', async () => {
    const rep = await runDiagnostics([node('access'), node('origin', ['access']), node('shell', ['origin']), node('data')], fresh(['origin', 'data']));
    expect(rep.rootCauses.map((r) => r.id)).toEqual(['origin', 'data']);
    expect(rep.rootCauses[0]).toBe(rep.reports[1]);
    expect(rep.reports.map((r) => r.status)).toEqual(['ok', 'fail', 'blocked', 'fail']);
  });

  it('is ok with warnings, skips and repairs, and not ok with a single failure', async () => {
    const warn = node('w', [], { check: async () => ({ ok: true, warn: true, detail: 'ageing' }) });
    const skip = node('s', [], { check: async () => ({ ok: true, skip: true, detail: 'not here' }) });
    const ok = await runDiagnostics([warn, skip, node('x', [], fixing('x'))], fresh(['x']), { repair: true });
    expect(ok.reports.map((r) => r.status)).toEqual(['warn', 'skipped', 'repaired']);
    expect(ok.ok).toBe(true);
    expect(ok.rootCauses).toEqual([]);
    const bad = await runDiagnostics([warn, node('x')], fresh(['x']));
    expect(bad.ok).toBe(false);
  });

  it('names as waitsOn the first failing dependency in dependsOn order, and its root cause', async () => {
    const rep = byId(await runDiagnostics([node('r1'), node('r2'), node('mid', ['r2']), node('n', ['r1', 'mid'])], fresh(['r1', 'r2'])));
    expect(rep.n!.waitsOn).toBe('r1');
    expect(rep.n!.rootCause).toBe('r1');
    const rev = byId(await runDiagnostics([node('r1'), node('r2'), node('mid', ['r2']), node('n', ['mid', 'r1'])], fresh(['r1', 'r2'])));
    expect(rev.n!.waitsOn).toBe('mid');
    expect(rev.n!.rootCause).toBe('r2');
  });

  it('blocks rather than skips a node with both a skipped and a failed dependency, whichever is listed first', async () => {
    const skip = node('na', [], { check: async () => ({ ok: true, skip: true, detail: 'admin only' }) });
    const rep = byId(await runDiagnostics([skip, node('bad'), node('n', ['na', 'bad'])], fresh(['bad'])));
    expect(rep.n!.status).toBe('blocked');
    expect(rep.n!.rootCause).toBe('bad');
  });

  it('passes a skip down to the dependants, with the skipped dependency named (VS Code: "skips propagate")', async () => {
    const na = node('admin-only', [], { check: async () => ({ ok: true, detail: 'student', skip: true }) });
    const rep = byId(await runDiagnostics([na, node('admin-child', ['admin-only']), node('grandchild', ['admin-child'])], fresh()));
    expect(rep['admin-only']!.status).toBe('skipped');
    expect(rep['admin-only']!.reason).toBeUndefined();
    expect(rep['admin-child']).toMatchObject({ status: 'skipped', reason: 'dependency-skipped', waitsOn: 'admin-only' });
    expect(rep.grandchild).toMatchObject({ status: 'skipped', reason: 'dependency-skipped', waitsOn: 'admin-child' });
  });

  it('runs a slow check only in a full run, and skips it and its dependants in a quick sweep (the browser: "a quick run skips the slow checks")', async () => {
    const graph = () => [node('shell', [], { slow: true }), node('files'), node('probe', ['shell'])];
    const quick = byId(await runDiagnostics(graph(), fresh(), { quick: true }));
    expect(quick.shell).toMatchObject({ status: 'skipped', reason: 'full-run-only' });
    expect(quick.files!.status).toBe('ok');
    expect(quick.probe).toMatchObject({ status: 'skipped', reason: 'dependency-skipped', waitsOn: 'shell' });
    const full = byId(await runDiagnostics(graph(), fresh()));
    expect(full.shell!.status).toBe('ok');
    expect(full.probe!.status).toBe('ok');
  });

  it("blocks a slow check whose dependency failed in a quick sweep too: the failure is the news", async () => {
    const rep = byId(await runDiagnostics([node('a'), node('slow', ['a'], { slow: true })], fresh(['a']), { quick: true }));
    expect(rep.slow).toMatchObject({ status: 'blocked', rootCause: 'a' });
  });

  it("reads a check's verdict as both editions did: skip wins over ok, warn counts only with ok", async () => {
    const v = (id: string, r: CheckResult) => node(id, [], { check: async () => r });
    const rep = byId(
      await runDiagnostics(
        [v('skip-fail', { ok: false, skip: true, detail: 'a' }), v('warn-fail', { ok: false, warn: true, detail: 'b' }), v('warn-ok', { ok: true, warn: true, detail: 'c' }), v('plain', { ok: true, detail: 'd' })],
        fresh(),
      ),
    );
    expect(Object.values(rep).map((r) => [r.status, r.detail])).toEqual([
      ['skipped', 'a'],
      ['fail', 'b'],
      ['warn', 'c'],
      ['ok', 'd'],
    ]);
  });

  it('reads skip and warn only when exactly true, where both engines took any truthy value: the one place base parts from them', async () => {
    // a check is typed to answer a boolean; one that answers 1 or 'y' is read as if it had answered
    // nothing there, so a stray value never hides a result as skipped (design 15.1 and 15.2)
    const loose: Array<[string, unknown]> = [
      ['skip-one', { ok: true, skip: 1, detail: 'a' }],
      ['warn-y', { ok: true, warn: 'y', detail: 'b' }],
      ['skip-y-fail', { ok: false, skip: 'y', detail: 'c' }],
    ];
    const ours = await runDiagnostics(loose.map(([id, r]) => node(id, [], { check: async () => r as CheckResult })), fresh());
    expect(ours.reports.map((x) => [x.status, x.detail])).toEqual([
      ['ok', 'a'],
      ['ok', 'b'],
      ['fail', 'c'],
    ]);
    for (const edition of ['browser', 'vscode'] as const) {
      const legacy = loose.map(([id, r]): LegacyNode => ({ id, title: id, layer: 'laptop', dependsOn: [], manualFix: '', check: async () => r as CheckResult }));
      expect((await legacyRun(edition, legacy, fresh())).reports.map((x) => x.status), edition).toEqual(['skipped', 'warn', 'skipped']);
    }
  });

  it("copies the node's manual fix and fix into a failure's report, and into no other", async () => {
    const rep = byId(await runDiagnostics([node('a', [], { fix: 'sign-in' }), node('b', [], { fix: 'open-shell' }), node('c'), node('d', ['a'], { fix: 'x' })], fresh(['a', 'c'])));
    expect(rep.a).toMatchObject({ status: 'fail', manualFix: 'fix a', fix: 'sign-in' });
    expect(rep.c).toMatchObject({ status: 'fail', manualFix: 'fix c' });
    expect('fix' in rep.c!).toBe(false);
    for (const id of ['b', 'd']) {
      expect('manualFix' in rep[id]!, id).toBe(false);
      expect('fix' in rep[id]!, id).toBe(false);
    }
  });

  it("carries each node's title and layer into its report", async () => {
    const rep = await runDiagnostics([node('a', [], { layer: 'grid' }), node('b', ['a'])], fresh(['a']));
    expect(rep.reports.map((r) => [r.id, r.title, r.layer])).toEqual([
      ['a', 'A', 'grid'],
      ['b', 'B', 'laptop'],
    ]);
  });

  it('runs one check at a time, in order, so a later check can read what an earlier one learned', async () => {
    const log: string[] = [];
    const learned: Record<string, string> = {};
    const step = (id: string, deps: string[] = []) =>
      node(id, deps, {
        async check() {
          log.push(`start ${id}`);
          await new Promise((r) => setTimeout(r, 5));
          learned[id] = `${id} learned`;
          log.push(`end ${id}`);
          return { ok: true, detail: deps.map((d) => learned[d]).join(',') };
        },
      });
    const rep = await runDiagnostics([step('a'), step('b'), step('c', ['a', 'b'])], fresh());
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
    expect(rep.reports[2]!.detail).toBe('a learned,b learned');
  });

  it('hands each report to onNode as it is made, with how many are done of how many', async () => {
    const seen: Array<[NodeReport<Layer, Fix>, number, number]> = [];
    const rep = await runDiagnostics([node('a'), node('b', ['a']), node('c')], fresh(['a']), { onNode: (r, done, total) => seen.push([r, done, total]) });
    expect(seen.map(([r, done, total]) => [r.id, done, total])).toEqual([
      ['a', 1, 3],
      ['b', 2, 3],
      ['c', 3, 3],
    ]);
    seen.forEach(([r], i) => expect(r).toBe(rep.reports[i]));
  });

  it('of no node is ok and empty', async () => {
    const rep = await runDiagnostics([], fresh());
    expect(rep).toMatchObject({ reports: [], rootCauses: [], ok: true });
  });
});

// ---- repairs ------------------------------------------------------------------------------------

describe('a repair', () => {
  it('runs, is re-checked, and unblocks the rest (VS Code: "a safe repair runs")', async () => {
    const ctx = fresh(['ext']);
    const rep = await runDiagnostics([node('ext', [], fixing('ext')), node('uses-ext', ['ext'])], ctx, { repair: true });
    const by = byId(rep);
    expect(by.ext).toMatchObject({ status: 'repaired', repair: 'installed', repairOutcome: 'repaired', detail: 'ext ok' });
    expect(by['uses-ext']!.status).toBe('ok');
    expect(rep.ok).toBe(true);
    expect(ctx.repaired).toEqual(['ext']);
    expect(ctx.calls).toEqual(['ext', 'ext', 'uses-ext']);
  });

  it('that does not fix it keeps the failure and says so (VS Code: "still fails")', async () => {
    const x = node('x', [], { repair: async () => ({ ok: true, detail: 'tried' }) });
    const rep = await runDiagnostics([x], fresh(['x']), { repair: true, words: VSCODE_WORDS });
    expect(rep.reports[0]).toMatchObject({ status: 'fail', repairOutcome: 'still-fails', repair: 'tried' });
    expect(rep.reports[0]!.detail).toMatch(/still fails/);
    expect(rep.rootCauses).toHaveLength(1);
  });

  it('that says it could not keeps the failure and its detail, and is not re-checked', async () => {
    const ctx = fresh(['x']);
    const rep = await runDiagnostics([node('x', [], { repair: async () => ({ ok: false, detail: 'no rights' }) })], ctx, { repair: true });
    expect(rep.reports[0]).toMatchObject({ status: 'fail', detail: 'x broken', repair: 'no rights', repairOutcome: 'failed' });
    expect(ctx.calls).toEqual(['x']);
  });

  it('that throws, or answers with nothing, keeps the failure as a crashed repair', async () => {
    const throws = node('t', [], {
      repair: async () => {
        throw new Error('disk full');
      },
    });
    const empty = node('e', [], { repair: async () => undefined as unknown as { ok: boolean; detail: string } });
    // an answer whose ok is not a boolean is no answer either, truthy or not
    const yes = node('y', [], { repair: async () => ({ ok: 'yes', detail: 'y' }) as unknown as { ok: boolean; detail: string } });
    const one = node('o', [], { repair: async () => ({ ok: 1, detail: 'o' }) as unknown as { ok: boolean; detail: string } });
    const noOk = node('n', [], { repair: async () => ({ detail: 'n' }) as unknown as { ok: boolean; detail: string } });
    const rep = byId(await runDiagnostics([throws, empty, yes, one, noOk], fresh(['t', 'e', 'y', 'o', 'n']), { repair: true, words: BROWSER_WORDS }));
    expect(rep.t).toMatchObject({ status: 'fail', detail: 't broken', repair: 'repair crashed: disk full', repairOutcome: 'crashed' });
    expect(rep.e).toMatchObject({ status: 'fail', repair: 'repair crashed: ', repairOutcome: 'crashed' });
    for (const id of ['y', 'o', 'n']) expect(rep[id], id).toMatchObject({ status: 'fail', detail: `${id} broken`, repair: 'repair crashed: ', repairOutcome: 'crashed' });
  });

  it('whose re-check throws keeps the failure, worded as a crashed repair as both editions did, and coded apart', async () => {
    let n = 0;
    const x = node('x', [], {
      async check() {
        n += 1;
        if (n === 2) throw new Error('gone');
        return { ok: false, detail: 'x broken' };
      },
      repair: async () => ({ ok: true, detail: 'restarted' }),
    });
    const rep = await runDiagnostics([x], fresh(), { repair: true, words: BROWSER_WORDS });
    expect(rep.reports[0]).toMatchObject({ status: 'fail', detail: 'x broken', repair: 'repair crashed: gone', repairOutcome: 'recheck-crashed' });
  });

  it('whose re-check passes with a warning is repaired: the check after a repair is judged by ok alone, as both editions did', async () => {
    const warned = () => {
      let fixed = false;
      return {
        check: async (): Promise<CheckResult> => (fixed ? { ok: true, warn: true, detail: 'x slow' } : { ok: false, detail: 'x broken' }),
        repair: async () => {
          fixed = true;
          return { ok: true, detail: 'restarted' };
        },
      };
    };
    const rep = await runDiagnostics([node('x', [], warned())], fresh(), { repair: true, words: BROWSER_WORDS });
    expect(rep.reports[0]).toMatchObject({ status: 'repaired', repairOutcome: 'repaired', repair: 'restarted', detail: 'x slow (was: x broken)' });
    const old = await legacyRun('browser', [{ id: 'x', title: 'X', layer: 'laptop', dependsOn: [], manualFix: '', ...warned() }], fresh(), { repair: true });
    expect(old.reports[0]).toMatchObject({ status: 'repaired', detail: 'x slow (was: x broken)' });
  });

  it('runs only when the run asks for repairs, and never for a slow check left out of a quick sweep', async () => {
    const ctx = fresh(['a', 's']);
    const off = await runDiagnostics([node('a', [], fixing('a'))], ctx);
    expect(off.reports[0]).toMatchObject({ status: 'fail' });
    expect(off.reports[0]!.repairOutcome).toBeUndefined();
    expect(ctx.repaired).toEqual([]);
    await runDiagnostics([node('s', [], { slow: true, ...fixing('s') })], ctx, { repair: true, quick: true });
    expect(ctx.repaired).toEqual([]);
  });

  it('runs for a check that crashed too, and a repaired crash keeps its reason', async () => {
    let fixed = false;
    const x = node('x', [], {
      async check() {
        if (!fixed) throw new Error('no socket');
        return { ok: true, detail: 'socket back' };
      },
      async repair() {
        fixed = true;
        return { ok: true, detail: 'restarted' };
      },
    });
    const rep = await runDiagnostics([x], fresh(), { repair: true, words: BROWSER_WORDS });
    expect(rep.reports[0]).toMatchObject({ status: 'repaired', reason: 'crashed', detail: 'socket back (was: check crashed: no socket)' });
  });

  it("goes through the guard as its own step, and so does the check after it", async () => {
    const steps: GuardStep[] = [];
    const guard = (work: () => Promise<unknown>, step: GuardStep) => {
      steps.push(step);
      return work();
    };
    await runDiagnostics([node('a', [], fixing('a')), node('b', ['a'])], fresh(['a']), { repair: true, guard });
    expect(steps).toEqual([
      { id: 'a', title: 'A', phase: 'check' },
      { id: 'a', title: 'A', phase: 'repair' },
      { id: 'a', title: 'A', phase: 'recheck' },
      { id: 'b', title: 'B', phase: 'check' },
    ]);
  });
});

// ---- crashes, the guard and the clock -----------------------------------------------------------

describe('a check that crashes', () => {
  it('fails alone, as crashed, and blocks its dependants (VS Code: "crashes ... become failures")', async () => {
    const crash = node('crash', [], {
      async check() {
        throw new Error('boom');
      },
    });
    const rep = byId(await runDiagnostics([crash, node('child', ['crash']), node('other')], fresh(), { words: VSCODE_WORDS }));
    expect(rep.crash).toMatchObject({ status: 'fail', reason: 'crashed', detail: 'check crashed: boom', manualFix: 'fix crash' });
    expect(rep.child).toMatchObject({ status: 'blocked', rootCause: 'crash' });
    expect(rep.other!.status).toBe('ok');
  });

  it('is caught whether it throws before its first await, throws a string, or throws something else', async () => {
    const sync = node('sync', [], {
      check: () => {
        throw new Error('at once');
      },
    });
    const text = node('text', [], {
      async check() {
        throw 'plain words';
      },
    });
    const other = node('other', [], {
      async check() {
        throw 42;
      },
    });
    const notText = node('not-text', [], {
      async check() {
        throw { message: 42 };
      },
    });
    const rep = byId(await runDiagnostics([sync, text, other, notText], fresh()));
    expect(rep.sync).toMatchObject({ status: 'fail', reason: 'crashed', detail: 'at once' });
    expect(rep.text).toMatchObject({ status: 'fail', reason: 'crashed', detail: 'plain words' });
    expect(rep.other).toMatchObject({ status: 'fail', reason: 'crashed', detail: '' });
    // only a message that is text is the detail; another one is never turned into text
    expect(rep['not-text']).toMatchObject({ status: 'fail', reason: 'crashed', detail: '' });
    // a guard that calls the work later, outside its own call, still gets the throw before the first
    // await as a rejection, so the run settles and the check fails alone
    const later = (work: () => Promise<unknown>) =>
      new Promise<unknown>((resolve, reject) => {
        setTimeout(() => {
          work().then(resolve, reject);
        }, 0);
      });
    const deferred = byId(await runDiagnostics([sync, node('after')], fresh(), { guard: later }));
    expect(deferred.sync).toMatchObject({ status: 'fail', reason: 'crashed', detail: 'at once' });
    expect(deferred.after!.status).toBe('ok');
  });

  it('includes one that answers with no verdict: the run goes on (the editions stopped the whole run on it)', async () => {
    const none = node('none', [], { check: async () => undefined as unknown as CheckResult });
    const odd = node('odd', [], { check: async () => ({ ok: 'yes', detail: 'x' }) as unknown as CheckResult });
    const nul = node('nul', [], { check: () => null as unknown as CheckResult });
    const rep = byId(await runDiagnostics([none, odd, nul, node('after')], fresh(), { words: BROWSER_WORDS }));
    for (const id of ['none', 'odd', 'nul']) expect(rep[id], id).toMatchObject({ status: 'fail', reason: 'crashed', detail: 'check crashed: ' });
    expect(rep.after!.status).toBe('ok');
  });

  it("gives an answer's detail as '' when it is not text", async () => {
    const rep = await runDiagnostics([node('a', [], { check: async () => ({ ok: true, detail: 7 }) as unknown as CheckResult })], fresh());
    expect(rep.reports[0]).toMatchObject({ status: 'ok', detail: '' });
  });
});

describe("the edition's guard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('turns a check that never answers into a timed-out failure (VS Code: "timeouts become failures")', async () => {
    const hang = node('hang', [], { check: () => new Promise<CheckResult>(() => {}) });
    const rep = await runDiagnostics([hang, node('next')], fresh(), { guard: editionGuard(200), words: VSCODE_WORDS });
    expect(rep.reports[0]).toMatchObject({ status: 'fail', reason: 'crashed', detail: 'check crashed: HANG timed out after 0 s' });
    expect(rep.reports[1]!.status).toBe('ok');
  });

  it('is the only time limit: base sets no timer, and without a guard a check that has not answered holds the run', async () => {
    vi.useFakeTimers();
    let answer: ((r: CheckResult) => void) | undefined;
    const late = node('late', [], { check: () => new Promise<CheckResult>((res) => (answer = res)) });
    let finished = false;
    const run = runDiagnostics([late], fresh()).then((r) => {
      finished = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(finished).toBe(false);
    answer?.({ ok: true, detail: 'there' });
    expect((await run).reports[0]).toMatchObject({ status: 'ok', detail: 'there' });
  });

  it('is called as a method of the options, so an edition may keep its limits on them', async () => {
    const opts: RunOpts<Layer, Fix> & { limits: string[] } = {
      limits: [],
      guard(work, step) {
        this.limits.push(step.phase);
        return work();
      },
    };
    await runDiagnostics([node('a')], fresh(), opts);
    expect(opts.limits).toEqual(['check']);
  });
});

describe("the edition's clock", () => {
  it('gives started and finished as ISO times and each node the span of its first check, repairs not counted', async () => {
    let t = Date.UTC(2026, 9, 8, 12, 0, 0);
    const a = node('a', [], {
      async check() {
        t += 250;
        return { ok: true, detail: 'a' };
      },
    });
    let fixed = false;
    const b = node('b', ['a'], {
      async check() {
        t += 100;
        return fixed ? { ok: true, detail: 'b now' } : { ok: false, detail: 'b broken' };
      },
      async repair() {
        t += 1000;
        fixed = true;
        return { ok: true, detail: 'fixed' };
      },
    });
    const rep = await runDiagnostics([a, b, node('c', [], { slow: true })], fresh(), { now: () => t, repair: true, quick: true });
    expect(rep.started).toBe('2026-10-08T12:00:00.000Z');
    expect(rep.reports.map((r) => [r.id, r.status, r.ms])).toEqual([
      ['a', 'ok', 250],
      ['b', 'repaired', 100],
      ['c', 'skipped', 0],
    ]);
    expect(rep.finished).toBe('2026-10-08T12:00:01.450Z');
  });

  it("is the only clock: without one, no time is recorded", async () => {
    const rep = await runDiagnostics([node('a'), node('b', ['a'])], fresh(['a']));
    expect(rep.started).toBe('');
    expect(rep.finished).toBe('');
    expect(rep.reports.map((r) => r.ms)).toEqual([0, 0]);
  });

  it('that runs backwards, gives no finite time or a time no Date holds records nothing wrong', async () => {
    let t = 10_000;
    const back = await runDiagnostics(
      [
        node('a', [], {
          async check() {
            t -= 500;
            return { ok: true, detail: 'a' };
          },
        }),
      ],
      fresh(),
      { now: () => t },
    );
    expect(back.reports[0]!.ms).toBe(0);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 9e15, -9e15]) {
      const rep = await runDiagnostics([node('a')], fresh(), { now: () => bad });
      expect(rep.started, String(bad)).toBe('');
      expect(rep.reports[0]!.ms, String(bad)).toBe(0);
    }
    expect((await runDiagnostics([], fresh(), { now: () => 8.64e15 })).started).toBe('+275760-09-13T00:00:00.000Z');
  });
});

// ---- the words ----------------------------------------------------------------------------------

describe('the words', () => {
  /** one of each thing the engine decides: blocked, skipped two ways, crashed, repaired, still failing, a crashed repair */
  const everything = (): Node[] => {
    let fixed = false;
    return [
      node('bad'),
      node('after-bad', ['bad']),
      node('na', [], { check: async () => ({ ok: true, skip: true, detail: 'not here' }) }),
      node('after-na', ['na']),
      node('slow', [], { slow: true }),
      node('boom', [], {
        async check() {
          throw new Error('kaput');
        },
      }),
      node('mend', [], {
        check: async () => (fixed ? { ok: true, detail: 'mended' } : { ok: false, detail: 'torn' }),
        async repair() {
          fixed = true;
          return { ok: true, detail: 'sewn' };
        },
      }),
      // its re-check says something else than its check, so which one each word gets is seen
      node('stuck', [], {
        check: (() => {
          let n = 0;
          return async () => ({ ok: false, detail: n++ === 0 ? 'stuck broken' : 'still stuck' });
        })(),
        repair: async () => ({ ok: true, detail: 'pushed' }),
      }),
      node('wreck', [], {
        async repair() {
          throw new Error('fell apart');
        },
      }),
    ];
  };
  const run = (words?: Partial<DiagWords>) => runDiagnostics(everything(), fresh(['bad', 'stuck', 'wreck']), { repair: true, quick: true, ...(words ? { words } : {}) });
  const details = (rep: DiagReport<Layer, Fix>) => Object.fromEntries(rep.reports.map((r) => [r.id, r.repair === undefined ? r.detail : `${r.detail} | ${r.repair}`]));

  it("of the browser give the details its engine wrote, letter for letter", async () => {
    expect(details(await run(BROWSER_WORDS))).toEqual({
      bad: 'bad broken',
      'after-bad': 'waits on "BAD"',
      na: 'not here',
      'after-na': 'not applicable ("NA" is not)',
      slow: 'checked in a full run',
      boom: 'check crashed: kaput',
      mend: 'mended (was: torn) | sewn',
      stuck: 'stuck broken; repair ran (pushed) but the check still fails: still stuck | pushed',
      wreck: 'wreck broken | repair crashed: fell apart',
    });
  });

  it('of VS Code give the details its engine wrote, letter for letter', async () => {
    const d = details(await run(VSCODE_WORDS));
    expect(d['after-bad']).toBe('waits on BAD');
    expect(d['after-na']).toBe('not applicable (NA is not)');
    expect(d.slow).toBe('checked in a full Troubleshoot');
    expect(d.boom).toBe('check crashed: kaput');
    expect(d.stuck).toBe('stuck broken; repair ran (pushed) but the check still fails: still stuck | pushed');
  });

  it("left out, base writes no sentence: '' for its own verdicts, else what the edition's check, repair or throw said", async () => {
    expect(details(await run())).toEqual({
      bad: 'bad broken',
      'after-bad': '',
      na: 'not here',
      'after-na': '',
      slow: '',
      boom: 'kaput',
      mend: 'mended | sewn',
      stuck: 'stuck broken | pushed',
      wreck: 'wreck broken | fell apart',
    });
  });

  it('give stillFails the first check, the repair and the re-check, in that order', async () => {
    const d = details(await run({ stillFails: (was, repair, again) => `${was}|${repair}|${again}` }));
    expect(d.stuck).toBe('stuck broken|pushed|still stuck | pushed');
  });

  it('may be given in part, each left out falling back on its own', async () => {
    const d = details(await run({ blocked: (on) => `wait for ${on.id}` }));
    expect(d['after-bad']).toBe('wait for bad');
    expect(d['after-na']).toBe('');
  });

  it("are called as methods of the edition's object, so its own `this` holds", async () => {
    const words = {
      lead: 'needs',
      blocked(this: { lead: string }, on: { id: string; title: string }) {
        return `${this.lead} ${on.title}`;
      },
    };
    const rep = await runDiagnostics([node('a'), node('b', ['a'])], fresh(['a']), { words });
    expect(rep.reports[1]!.detail).toBe('needs A');
  });

  it("name the deciding dependency by id and title, and the reports carry codes besides", async () => {
    const seen: string[] = [];
    const rep = byId(await runDiagnostics(everything(), fresh(['bad', 'stuck', 'wreck']), { repair: true, quick: true, words: { blocked: (on) => (seen.push(`${on.id}/${on.title}`), '') } }));
    expect(seen).toEqual(['bad/BAD']);
    expect(Object.values(rep).map((r) => [r.id, r.status, r.reason ?? '-', r.repairOutcome ?? '-'])).toEqual([
      ['bad', 'fail', '-', '-'],
      ['after-bad', 'blocked', 'dependency-failed', '-'],
      ['na', 'skipped', '-', '-'],
      ['after-na', 'skipped', 'dependency-skipped', '-'],
      ['slow', 'skipped', 'full-run-only', '-'],
      ['boom', 'fail', 'crashed', '-'],
      ['mend', 'repaired', '-', 'repaired'],
      ['stuck', 'fail', '-', 'still-fails'],
      ['wreck', 'fail', '-', 'crashed'],
    ]);
  });
});

// ---- beside the editions' own engine -------------------------------------------------------------

/** a small seeded generator (mulberry32), so every run of this test draws the same graphs */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type CheckKind = 'ok' | 'warn' | 'fail' | 'skip' | 'skip-fail' | 'crash';
type RepairKind = 'none' | 'fixes' | 'claims' | 'declines' | 'throws' | 'recheck-throws';
interface Spec {
  id: string;
  deps: string[];
  check: CheckKind;
  repair: RepairKind;
  slow: boolean;
  fix?: string;
}
interface SpecCtx extends Ctx {
  fixed: Set<string>;
  throwNext: Set<string>;
  /** checks a repair claimed to mend and did not: their re-check words it apart from their first check */
  poked: Set<string>;
}

function draw(rand: () => number): Spec[] {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const n = 1 + Math.floor(rand() * 10);
  const specs: Spec[] = [];
  for (let i = 0; i < n; i += 1) {
    const deps: string[] = [];
    for (let k = Math.floor(rand() * 4); k > 0 && i > 0; k -= 1) deps.push(`n${Math.floor(rand() * i)}`);
    specs.push({
      id: `n${i}`,
      deps,
      check: pick(['ok', 'ok', 'warn', 'fail', 'fail', 'skip', 'skip-fail', 'crash'] as const),
      repair: pick(['none', 'none', 'fixes', 'claims', 'declines', 'throws', 'recheck-throws'] as const),
      slow: rand() < 0.25,
      ...(rand() < 0.5 ? { fix: `fix-${i}` } : {}),
    });
  }
  // the list in another order than the one it was drawn in, so the order's walk does real work
  for (let i = specs.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [specs[i], specs[j]] = [specs[j] as Spec, specs[i] as Spec];
  }
  return specs;
}

function behaviour(s: Spec) {
  return {
    async check(c: SpecCtx): Promise<CheckResult> {
      c.calls.push(s.id);
      if (c.throwNext.delete(s.id)) throw new Error(`${s.id} gone`);
      if (c.fixed.has(s.id)) return { ok: true, detail: `${s.id} mended` };
      switch (s.check) {
        case 'ok':
          return { ok: true, detail: `${s.id} fine` };
        case 'warn':
          return { ok: true, warn: true, detail: `${s.id} ageing` };
        case 'fail':
          return { ok: false, detail: c.poked.has(s.id) ? `${s.id} still broken` : `${s.id} broken` };
        case 'skip':
          return { ok: true, skip: true, detail: `${s.id} not here` };
        case 'skip-fail':
          return { ok: false, skip: true, detail: `${s.id} not here either` };
        case 'crash':
          throw new Error(`${s.id} blew up`);
      }
    },
    async repair(c: SpecCtx): Promise<{ ok: boolean; detail: string }> {
      switch (s.repair) {
        case 'fixes':
          c.fixed.add(s.id);
          return { ok: true, detail: `${s.id} reinstalled` };
        case 'claims':
          c.poked.add(s.id);
          return { ok: true, detail: `${s.id} poked` };
        case 'declines':
          return { ok: false, detail: `${s.id} needs a person` };
        case 'recheck-throws':
          c.throwNext.add(s.id);
          return { ok: true, detail: `${s.id} restarted` };
        default:
          throw new Error(`${s.id} repair fell over`);
      }
    },
  };
}

const specCtx = (): SpecCtx => ({ ...fresh(), fixed: new Set(), throwNext: new Set(), poked: new Set() });

function baseNodes(specs: Spec[]): DiagNode<SpecCtx, Layer, Fix>[] {
  return specs.map((s) => {
    const b = behaviour(s);
    return {
      id: s.id,
      title: titleOf(s.id),
      layer: 'grid',
      dependsOn: s.deps,
      manualFix: `fix ${s.id} by hand`,
      check: b.check,
      ...(s.repair !== 'none' ? { repair: b.repair } : {}),
      ...(s.fix ? { fix: s.fix } : {}),
      slow: s.slow,
    };
  });
}

function legacyNodes(specs: Spec[], edition: LegacyEdition): LegacyNode[] {
  return specs.map((s) => {
    const b = behaviour(s);
    return {
      id: s.id,
      title: titleOf(s.id),
      layer: 'grid',
      dependsOn: s.deps,
      manualFix: `fix ${s.id} by hand`,
      check: (c: Ctx) => b.check(c as SpecCtx),
      ...(s.repair !== 'none' ? { repair: (c: Ctx) => b.repair(c as SpecCtx) } : {}),
      ...(s.fix ? { [edition === 'browser' ? 'fixAction' : 'fixCommand']: s.fix } : {}),
      slow: s.slow,
    };
  });
}

/** what both reports hold: everything but the times and base's codes, with the fix under one name */
const comparable = (r: LegacyReport | NodeReport<Layer, Fix>) => {
  const legacy = r as LegacyReport;
  const now = r as NodeReport<Layer, Fix>;
  return {
    id: r.id,
    title: r.title,
    layer: r.layer,
    status: r.status,
    detail: r.detail,
    rootCause: r.rootCause,
    repair: r.repair,
    manualFix: r.manualFix,
    fix: legacy.fixAction ?? legacy.fixCommand ?? now.fix,
  };
};

describe("beside each edition's own engine", () => {
  it('base writes the same reports on 400 drawn graphs, every way of running them, with that edition\'s words, guard and clock', async () => {
    const rand = seeded(20261008);
    let compared = 0;
    const seen = new Set<string>();
    for (let g = 0; g < 400; g += 1) {
      const specs = draw(rand);
      for (const edition of ['browser', 'vscode'] as const) {
        for (const [quick, repair] of [
          [false, false],
          [false, true],
          [true, false],
          [true, true],
        ] as const) {
          const legacyCtx = specCtx();
          const baseCtx = specCtx();
          const old = await legacyRun(edition, legacyNodes(specs, edition), legacyCtx, { quick, repair });
          const now = await runDiagnostics(baseNodes(specs), baseCtx, {
            quick,
            repair,
            words: edition === 'browser' ? BROWSER_WORDS : VSCODE_WORDS,
            guard: editionGuard(),
            now: Date.now,
          });
          const where = `graph ${g} ${edition} quick=${quick} repair=${repair}`;
          expect(now.reports.map(comparable), where).toEqual(old.reports.map(comparable));
          expect(now.rootCauses.map((r) => r.id), where).toEqual(old.rootCauses.map((r) => r.id));
          expect(now.ok, where).toBe(old.ok);
          // the same checks and repairs ran, in the same order
          expect(baseCtx.calls, where).toEqual(legacyCtx.calls);
          expect([...baseCtx.fixed], where).toEqual([...legacyCtx.fixed]);
          for (const r of now.reports) for (const code of [r.status, r.reason, r.repairOutcome]) if (code) seen.add(code);
          compared += 1;
        }
      }
    }
    expect(compared).toBe(3200);
    // the drawing reached every verdict, reason and repair outcome, or this test proves less than it says
    expect([...NODE_STATUSES, ...REASONS, ...REPAIR_OUTCOMES].filter((code) => !seen.has(code))).toEqual([]);
  });

  it('base refuses exactly the graphs the editions refused, but for duplicates, and names the same problem', async () => {
    const rand = seeded(7);
    const refused = { unknown: 0, cycle: 0 };
    for (let g = 0; g < 600; g += 1) {
      const specs = draw(rand);
      const nodes = legacyNodes(specs, 'browser');
      // break one graph in three: a dependency on no node, or an edge back that may close a cycle
      const victim = nodes[Math.floor(rand() * nodes.length)] as LegacyNode;
      const roll = rand();
      if (roll < 0.15) victim.dependsOn = [...victim.dependsOn, 'nowhere'];
      else if (roll < 0.35) victim.dependsOn = [...victim.dependsOn, (nodes[Math.floor(rand() * nodes.length)] as LegacyNode).id];
      let old: string | undefined;
      try {
        legacyOrder(nodes);
      } catch (e) {
        old = (e as Error).message;
      }
      const problem = graphProblem(nodes);
      expect(problem === undefined, `graph ${g}: ${old}`).toBe(old === undefined);
      if (problem?.code === 'unknown') expect(old).toBe(`diagnostics graph: ${problem.id} depends on unknown ${problem.dependency}`);
      // the editions printed the whole path from where the walk began; base keeps its cycle, the end of it
      if (problem?.code === 'cycle') expect(old?.endsWith(` ${problem.cycle.join(' -> ')}`) || old === `diagnostics graph: cycle ${problem.cycle.join(' -> ')}`).toBe(true);
      expect(problem?.code).not.toBe('duplicate');
      if (problem?.code === 'unknown' || problem?.code === 'cycle') refused[problem.code] += 1;
      else expect(order(nodes).map((n) => n.id), `graph ${g}`).toEqual(legacyOrder(nodes).map((n) => n.id));
    }
    // the drawing must have made both kinds, or this test proves nothing
    expect(refused.unknown).toBeGreaterThan(30);
    expect(refused.cycle).toBeGreaterThan(30);
  });
});
