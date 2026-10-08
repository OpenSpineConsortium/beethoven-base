// src/profile.ts against what the providers publish, taken with interface/pull.sh: hpcworker's
// composed profiles (`profiles`) and the schema they follow (`module-schema`), and beethoven-sites'
// real modules (`modules`) and synthetic Example University (`example-modules`). Every assertion about
// a deployment runs once for each one, so a reader that only works for the first university fails on
// the second (Linear BEE-200). The example is composed here by the schema's rule (test/compose.ts),
// after that rule is shown to give hpcworker's own file for every real deployment.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deploymentFor,
  expandPath,
  portalOriginOf,
  PROFILE_KEYS,
  PROFILE_SCHEMA_VERSION,
  readProfile,
  readProfileText,
  restricts,
  sharedRootOf,
  sshTargetOf,
  stateDirOf,
  WORKER_DEFAULT_KEYS,
  type SiteProfile,
} from '../src/profile.js';
import { compose, deploymentsIn, profileText, type ModuleSchema } from './compose.js';
import { ROOT } from './origin.js';

const at = (...p: string[]) => join(ROOT, 'test', ...p);
const schema = JSON.parse(readFileSync(at('module-schema', 'module-schema.json'), 'utf8')) as ModuleSchema;
const published = new Map(
  readdirSync(at('profiles'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.slice(0, -'.json'.length), readFileSync(at('profiles', f), 'utf8')] as const),
);
const real = deploymentsIn(at('site-modules'));
const examples = deploymentsIn(at('site-examples'));
// every deployment the tests know, real and synthetic, each as the file a client would read
const all = [...real, ...examples].map((d) => ({ id: d.id, synthetic: examples.includes(d), raw: compose(schema, d.site, d.lab) }));
const profiles = all.map((d) => {
  const r = readProfile(d.raw);
  if (!r) throw new Error(`${d.id} does not read`);
  return { ...d, profile: r.profile, refused: r.refused };
});
const vars = { user: 'ab1234', home: '/home/ab1234' };

describe('the deployments the tests run on', () => {
  it('are at least one real university and one synthetic one, with different ids', () => {
    expect(real.length).toBeGreaterThan(0);
    expect(examples.length).toBeGreaterThan(0);
    expect(new Set(all.map((d) => d.id)).size).toBe(all.length);
    expect(schema.schema_version).toBe(PROFILE_SCHEMA_VERSION);
  });

  it("compose, by module-schema 1's rule, into hpcworker's own profile for every real deployment, byte for byte", () => {
    expect([...published.keys()].sort()).toEqual(real.map((d) => d.id).sort());
    for (const d of real) expect(profileText(compose(schema, d.site, d.lab)), d.id).toBe(published.get(d.id));
  });

  it('carry no example in any real deployment, and no real deployment among the examples', () => {
    for (const d of examples) expect(published.has(d.id), d.id).toBe(false);
  });

  it("compose an example's objects key by key and its binds by adding, which no real deployment exercises yet", () => {
    for (const d of examples) {
      const p = compose(schema, d.site, d.lab);
      expect(p.worker_defaults, d.id).toEqual({ ...(schema.product.worker_defaults as object), ...((d.lab.worker_defaults as object | undefined) ?? {}) });
      expect((p.binds as string[]).slice(0, (schema.product.binds as string[]).length), d.id).toEqual(schema.product.binds);
    }
  });
});

describe('readProfile, for each deployment', () => {
  it('reads every profile with nothing refused, and keeps each known key exactly as the file holds it', () => {
    for (const d of profiles) {
      expect(d.refused, d.id).toEqual([]);
      const known = Object.fromEntries(Object.entries(d.raw).filter(([k]) => k in PROFILE_KEYS));
      expect(d.profile, d.id).toEqual(known);
      expect(Object.keys(d.profile).length, d.id).toBeGreaterThan(10);
    }
  });

  it("gives each key the type module-schema 1 gives it, and reads only the schema's keys", () => {
    const kind = (t: string) => ({ str: 'str', int: 'int', bool: 'bool', int_or_none: 'int_or_none', str_or_none: 'str_or_none', list: 'list', dict: 'dict' })[t];
    for (const [key, ours] of Object.entries(PROFILE_KEYS)) {
      const field = schema.fields[key];
      expect(field, `${key} is not in module-schema 1`).toBeDefined();
      if (typeof ours === 'string') expect(kind(field!.type), key).toBe(ours);
      else expect([field!.type, field!.values], key).toEqual(['enum', [...ours]]);
    }
    const subs = schema.fields.worker_defaults!.keys!;
    expect(subs.map((s) => s.name)).toEqual(Object.keys(WORKER_DEFAULT_KEYS));
    for (const s of subs) expect(kind(s.type), s.name).toBe(WORKER_DEFAULT_KEYS[s.name as keyof typeof WORKER_DEFAULT_KEYS]);
  });

  it('reads the text of each profile the same as its value', () => {
    for (const d of profiles) expect(readProfileText(profileText(d.raw)), d.id).toEqual({ profile: d.profile, refused: [] });
  });
});

describe('deploymentFor, for each deployment', () => {
  const list = profiles.map((d) => d.profile);

  it("finds a deployment by its own portal's origin, and by its own login node and port, and only that one", () => {
    for (const d of profiles) {
      const origin = portalOriginOf(d.profile.ood_base_url);
      expect(origin, d.id).toMatch(/^https:\/\/[a-z0-9.-]+$/);
      expect(deploymentFor({ origin: origin! }, list), d.id).toEqual({ found: 'one', profile: d.profile });
      expect(deploymentFor({ origin: `${origin!}/pun/sys/dashboard` }, list), d.id).toEqual({ found: 'one', profile: d.profile });
      const ssh = { sshHost: d.profile.ssh_host!.toUpperCase(), sshPort: d.profile.ssh_port ?? 22 };
      expect(deploymentFor(ssh, list), d.id).toEqual({ found: 'one', profile: d.profile });
      expect(deploymentFor({ origin: origin!, ...ssh }, list), d.id).toEqual({ found: 'one', profile: d.profile });
    }
  });

  it('finds none for another port, another host, a mix of two deployments, or nothing given: never a default and never a guess', () => {
    for (const d of profiles) {
      const port = d.profile.ssh_port ?? 22;
      expect(deploymentFor({ sshHost: d.profile.ssh_host!, sshPort: port === 22 ? 2222 : 22 }, list), d.id).toEqual({ found: 'none' });
      const origin = portalOriginOf(d.profile.ood_base_url)!;
      // a host that only shares a name with the portal: the second-label guess U-12 removes
      expect(deploymentFor({ origin: origin.replace('https://', 'https://other.') }, list), d.id).toEqual({ found: 'none' });
      expect(deploymentFor({ origin: origin.replace('https://', 'http://') }, list), d.id).toEqual({ found: 'none' });
      for (const e of profiles.filter((x) => x !== d)) {
        expect(deploymentFor({ origin, sshHost: e.profile.ssh_host!, sshPort: e.profile.ssh_port ?? 22 }, list), `${d.id} + ${e.id}`).toEqual({ found: 'none' });
      }
    }
    expect(deploymentFor({}, list)).toEqual({ found: 'none' });
    expect(deploymentFor({ origin: 'not an address' }, list)).toEqual({ found: 'none' });
    expect(deploymentFor({ origin: 'https://ondemand.example.org' }, [])).toEqual({ found: 'none' });
  });

  it('answers several when two profiles declare the same place', () => {
    const [a] = list;
    const twin: SiteProfile = { ...a, site: 'twin' };
    expect(deploymentFor({ origin: a!.ood_base_url! }, [a!, twin])).toEqual({ found: 'several', profiles: [a, twin] });
  });
});

describe('what each deployment declares', () => {
  it('a real deployment with a pinned host key gives its ssh door; the example, whose key is not pinned, is refused for it', () => {
    for (const d of profiles) {
      const t = sshTargetOf(d.profile);
      if (d.profile.ssh_host_key) {
        expect(t, d.id).toEqual({ ok: true, host: d.profile.ssh_host, port: d.profile.ssh_port ?? 22, hostKey: d.profile.ssh_host_key });
      } else {
        expect(t, d.id).toEqual({ ok: false, key: 'ssh_host_key', code: 'missing' });
      }
    }
    // the example differs from the first university where a shortcut would hide: another port, no key
    const ex = profiles.find((d) => d.synthetic)!.profile;
    expect(ex.ssh_port).not.toBe(22);
    expect(ex.ssh_host_key).toBe('');
    expect(profiles.some((d) => !d.synthetic && sshTargetOf(d.profile).ok)).toBe(true);
  });

  it("each deployment's run directories expand to the account's own folder, and a lab with no shared copy reads as having none", () => {
    for (const d of profiles) {
      const dir = stateDirOf(d.profile, vars);
      expect(dir, d.id).toBe(d.profile.shared_state_dir!.replace('$USER', vars.user));
      expect(dir, d.id).toContain('/ab1234/');
      expect(sharedRootOf(d.profile.shared_install), d.id).toBe(d.profile.shared_install ? d.profile.shared_install : undefined);
    }
    expect(profiles.filter((d) => !d.profile.shared_install).map((d) => d.synthetic)).toEqual([true]);
  });

  it('no deployment restricts a worker unless its profile says so', () => {
    for (const d of profiles) expect(restricts(d.profile, 'worker'), d.id).toBe(d.profile.restricted === true);
  });
});

describe('readProfile on values a composed profile never holds', () => {
  it('reads no value that is not an object', () => {
    for (const bad of [null, undefined, 1, 'x', [], [{}], true]) expect(readProfile(bad)).toBeUndefined();
    for (const bad of ['', 'not json', '[]', 'null', '"x"']) expect(readProfileText(bad)).toBeUndefined();
  });

  it('leaves out each known key of the wrong type and names it, and ignores keys it does not read', () => {
    const r = readProfile({
      site: 7,
      ssh_port: '22',
      ssh_relay: { url: 'wss://relay.example.org' },
      browser_key_days: null,
      ood_auth: 'kerberos',
      vpn_required: 'yes',
      restricted_workspaces: ['a', 1],
      login_abandon_s: 1.5,
      worker_defaults: { cpus: '4', mem: '16G', hours: 12, extra: true },
      scheduler: 'slurm',
      binds: ['$HOME'],
    });
    expect(r).toEqual({
      profile: { browser_key_days: null, worker_defaults: { mem: '16G', hours: 12 } },
      refused: [
        { key: 'site', code: 'type' },
        { key: 'ood_auth', code: 'type' },
        { key: 'vpn_required', code: 'type' },
        { key: 'ssh_port', code: 'type' },
        { key: 'ssh_relay', code: 'type' },
        { key: 'login_abandon_s', code: 'type' },
        { key: 'restricted_workspaces', code: 'type' },
        { key: 'worker_defaults.cpus', code: 'type' },
      ],
    });
    expect(readProfile({ site: 7 })!.refused).toEqual([{ key: 'site', code: 'type' }]);
    expect(readProfile({ worker_defaults: [] })!.refused).toEqual([{ key: 'worker_defaults', code: 'type' }]);
  });

  it('refuses another schema version and reads the rest', () => {
    expect(readProfile({ schema_version: 2, site: 'x' })).toEqual({ profile: { site: 'x' }, refused: [{ key: 'schema_version', code: 'shape' }] });
    expect(readProfile({ schema_version: 1 })).toEqual({ profile: { schema_version: 1 }, refused: [] });
  });

  it("takes a copy of a list, so the edition's profile never shares one with the parsed file", () => {
    const raw = { restricted_workspaces: ['a'] };
    const r = readProfile(raw)!;
    raw.restricted_workspaces.push('b');
    expect(r.profile.restricted_workspaces).toEqual(['a']);
  });

  it('reads no key the object only inherits', () => {
    const raw = Object.create({ site: 'inherited' }) as Record<string, unknown>;
    expect(readProfile(raw)).toEqual({ profile: {}, refused: [] });
  });
});

describe('the path rules', () => {
  it('expandPath expands ~, $USER, ${USER}, $HOME and ${HOME}, and only where the name ends', () => {
    expect(expandPath('/rs/x/$USER/hpcworker', vars)).toBe('/rs/x/ab1234/hpcworker');
    expect(expandPath('/rs/x/${USER}/runs/', vars)).toBe('/rs/x/ab1234/runs');
    expect(expandPath('~/.hpcworker', vars)).toBe('/home/ab1234/.hpcworker');
    expect(expandPath('~', vars)).toBe('/home/ab1234');
    expect(expandPath('$HOME/a/${HOME}', vars)).toBe('/home/ab1234/a//home/ab1234');
    expect(expandPath('/a/$USERNAME/$USER_DIR/$USER-x/$USER.y', vars)).toBe('/a/$USERNAME/$USER_DIR/ab1234-x/ab1234.y');
    expect(expandPath('/a/~/b', vars)).toBe('/a/~/b');
    expect(expandPath('/a/${USER/b', vars)).toBe('/a/${USER/b');
    expect(expandPath('/a/$SLURM_JOB_ID', vars)).toBe('/a/$SLURM_JOB_ID');
  });

  it('expandPath without a home leaves ~ and $HOME, and never expands a value again', () => {
    expect(expandPath('~/$HOME/$USER', { user: 'u' })).toBe('~/$HOME/u');
    expect(expandPath('/a/$USER/$HOME', { user: '$HOME', home: '/h' })).toBe('/a/$HOME//h');
  });

  it('stateDirOf gives a plain absolute folder or nothing', () => {
    expect(stateDirOf({ shared_state_dir: '/a/$USER/s' }, vars)).toBe('/a/ab1234/s');
    expect(stateDirOf({ shared_state_dir: '$HOME/s' }, vars)).toBe('/home/ab1234/s');
    expect(stateDirOf({ shared_state_dir: '$HOME/s' }, { user: 'u' })).toBeUndefined();
    expect(stateDirOf({ shared_state_dir: '/a/$GROUP/s' }, vars)).toBeUndefined();
    expect(stateDirOf({ shared_state_dir: '/a/../s' }, vars)).toBeUndefined();
    expect(stateDirOf({ shared_state_dir: 'a/s' }, vars)).toBeUndefined();
    expect(stateDirOf({ shared_state_dir: '' }, vars)).toBeUndefined();
    expect(stateDirOf({}, vars)).toBeUndefined();
  });

  it('sharedRootOf takes a plain absolute folder only', () => {
    expect(sharedRootOf('/a/b.c/d_e+f-g/')).toBe('/a/b.c/d_e+f-g');
    expect(sharedRootOf(' /a/b ')).toBe('/a/b');
    for (const bad of [undefined, null, 1, '', '/', 'a/b', '/a/../b', '/a/./b', '/a b', "/a'b", '/a/$USER', '/a//b', '~/a']) expect(sharedRootOf(bad), String(bad)).toBeUndefined();
  });

  it('portalOriginOf gives an https origin, and nothing for anything a reader could take for another host', () => {
    expect(portalOriginOf('https://OnDemand.Example.org')).toBe('https://ondemand.example.org');
    expect(portalOriginOf('https://ondemand.example.org/pun/sys/dashboard?x#y')).toBe('https://ondemand.example.org');
    expect(portalOriginOf('https://ondemand.example.org:443/')).toBe('https://ondemand.example.org');
    expect(portalOriginOf('https://ondemand.example.org:8443')).toBe('https://ondemand.example.org:8443');
    expect(portalOriginOf('HTTPS://a.example.org')).toBe('https://a.example.org');
    for (const bad of [undefined, 1, '', 'http://a.example.org', 'https://', 'https://user@a.example.org', 'https://a.example.org@b.example.org', 'https://a.example.org:0', 'https://a.example.org:65536', 'https://[::1]', 'https://a.example.org.', 'https://-a.example.org', 'https://a_b.example.org', 'ftp://a.example.org', ' javascript:x']) {
      expect(portalOriginOf(bad), String(bad)).toBeUndefined();
    }
  });

  it('sshTargetOf refuses each part of the door on its own', () => {
    const key = `SHA256:${'A'.repeat(43)}`;
    expect(sshTargetOf({ ssh_host: 'login.example.org', ssh_host_key: key })).toEqual({ ok: true, host: 'login.example.org', port: 22, hostKey: key });
    expect(sshTargetOf({})).toEqual({ ok: false, key: 'ssh_host', code: 'missing' });
    expect(sshTargetOf({ ssh_host: '' })).toEqual({ ok: false, key: 'ssh_host', code: 'missing' });
    expect(sshTargetOf({ ssh_host: '-oProxyCommand=x' })).toEqual({ ok: false, key: 'ssh_host', code: 'shape' });
    expect(sshTargetOf({ ssh_host: 'a.example.org', ssh_port: 0, ssh_host_key: key })).toEqual({ ok: false, key: 'ssh_port', code: 'shape' });
    expect(sshTargetOf({ ssh_host: 'a.example.org', ssh_port: 65536, ssh_host_key: key })).toEqual({ ok: false, key: 'ssh_port', code: 'shape' });
    expect(sshTargetOf({ ssh_host: 'a.example.org', ssh_host_key: 'SHA256:short' })).toEqual({ ok: false, key: 'ssh_host_key', code: 'shape' });
    expect(sshTargetOf({ ssh_host: 'a.example.org', ssh_host_key: `MD5:${'A'.repeat(43)}` })).toEqual({ ok: false, key: 'ssh_host_key', code: 'shape' });
  });

  it('restricts reads restricted and the names in restricted_workspaces', () => {
    expect(restricts({}, 'worker')).toBe(false);
    expect(restricts({ restricted: true }, 'worker')).toBe(true);
    expect(restricts({ restricted: false, restricted_workspaces: ['other'] }, 'worker')).toBe(false);
    expect(restricts({ restricted_workspaces: ['worker'] }, 'worker')).toBe(true);
    expect(restricts({ restricted_workspaces: ['*'] }, 'worker')).toBe(true);
  });
});
