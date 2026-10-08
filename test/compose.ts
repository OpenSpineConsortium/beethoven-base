// The composition rule module-schema 1 publishes, written again here so the reader's tests can run on
// a deployment hpcworker does not publish a profile for (the synthetic Example University of
// beethoven-sites' export `example-modules`). It is test code, in no export: hpcworker composes the
// profiles every client reads. The rule, as the schema states it and hpcworker's composed profiles
// show: the schema's `product` values first, then the site module's, then the lab module's, each
// module without its own `module_keys`; a key in `additive` gains the items it lacks, an object merges
// key by key, any other value replaces the one before; keys in the order of the schema's `fields`, and
// an object's keys in the order its `keys` list them. The tests first show it gives hpcworker's own
// file byte for byte for every real deployment, so the example's profile is the one hpcworker would
// compose.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ModuleSchema {
  schema_version: number;
  layers: string[];
  product: Record<string, unknown>;
  module_keys: Record<string, string[]>;
  additive: string[];
  fields: Record<string, { type: string; layers: string[]; required: boolean; values?: string[]; keys?: Array<{ name: string; type: string }> }>;
}

export interface Deployment {
  /** the profile's id, which the lab module names */
  id: string;
  site: Record<string, unknown>;
  lab: Record<string, unknown>;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function merge(old: unknown, add: unknown): unknown {
  if (!isObject(old) || !isObject(add)) return copy(add);
  const out = copy(old);
  for (const [k, v] of Object.entries(add)) out[k] = k in out ? merge(out[k], v) : copy(v);
  return out;
}

/** site and lab modules -> the profile, keys in the schema's order */
export function compose(schema: ModuleSchema, site: Record<string, unknown>, lab: Record<string, unknown>): Record<string, unknown> {
  const prof: Record<string, unknown> = {};
  const lay = (key: string, value: unknown) => {
    const was = prof[key];
    if (schema.additive.includes(key) && Array.isArray(was) && Array.isArray(value)) {
      for (const item of value) if (!was.some((x) => JSON.stringify(x) === JSON.stringify(item))) was.push(copy(item));
    } else {
      prof[key] = key in prof ? merge(was, value) : copy(value);
    }
  };
  for (const [k, v] of Object.entries(schema.product)) lay(k, v);
  for (const [layer, mod] of [['site', site], ['lab', lab]] as const) {
    for (const [k, v] of Object.entries(mod)) if (!(schema.module_keys[layer] ?? []).includes(k)) lay(k, v);
  }
  const ordered: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema.fields)) {
    if (!(key in prof)) continue;
    const v = prof[key];
    if (isObject(v) && field.keys) {
      const names = field.keys.map((s) => s.name);
      ordered[key] = Object.fromEntries([...names.filter((n) => n in v).map((n) => [n, v[n]]), ...Object.entries(v).filter(([n]) => !names.includes(n))]);
    } else ordered[key] = v;
  }
  return ordered;
}

/** a composed profile as hpcworker writes it: one space of indent, a final newline */
export const profileText = (prof: Record<string, unknown>): string => JSON.stringify(prof, null, 1) + '\n';

const readJson = (p: string): Record<string, unknown> => JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;

/** every lab of every site in an export's folder (<site>/site.json and <site>/labs/<lab>.json), with the profile id the lab names */
export function deploymentsIn(folder: string): Deployment[] {
  const out: Deployment[] = [];
  for (const name of readdirSync(folder, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const site = readJson(join(folder, name, 'site.json'));
    for (const file of readdirSync(join(folder, name, 'labs')).filter((f) => f.endsWith('.json')).sort()) {
      const lab = readJson(join(folder, name, 'labs', file));
      out.push({ id: String(lab.profile), site, lab });
    }
  }
  return out;
}
