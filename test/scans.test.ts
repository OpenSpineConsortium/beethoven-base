// Each edition's own source scan, run here over the modules its export lists, so a change that an
// edition's build would refuse turns base's gate red first (design section 3: each edition's scan passes
// the modules it takes, as that scan is). base's posture scan (tools/posture.mjs) holds base's own
// rules; these are the editions', re-typed as test code from their text at the refs step 9 read, not
// run from their checkouts:
// - beethoven-desktop 9ce98bb scripts/forbidden.mjs, which its build runs over every file of src/ (base's
//   copy among them, at src/base/) and over the built server: its imports, its RULES with their strip
//   sites, its one exception, each over the code with the comments taken out as it takes them out. Its
//   credential list is hpcworker's rules.json, which desktop reads from its own pinned contract and base
//   from test/hpcworker/.
// - beethoven-extension ae11a00 extension/test/hygiene.test.ts, which reads every file of extension/src/
//   (base's copy among them, at extension/src/base/), comments included: no cookie, no host or match on
//   an Anthropic domain, no key wording, no framework file, the banned word, and the old name but in
//   what it keeps.
// VS Code has no source scan at e7526f9. When an edition's scan changes, this file follows it, at the
// edition's new ref.
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './origin.js';

interface Export {
  id: string;
  paths: string[];
}
const manifest = JSON.parse(readFileSync(join(ROOT, 'interface', 'INTERFACE.json'), 'utf8')) as { exports: Export[] };
const pathsOf = (id: string): string[] => {
  const e = manifest.exports.find((x) => x.id === id);
  if (!e) throw new Error(`no export ${id}`);
  return e.paths;
};
const textOf = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const credentialVariables = (JSON.parse(readFileSync(join(ROOT, 'test', 'hpcworker', 'rules.json'), 'utf8')) as { credential_variables: string[] }).credential_variables;

// ---- beethoven-desktop 9ce98bb, scripts/forbidden.mjs --------------------------------------------------

const ALLOWED_IMPORTS = new Set(['node:child_process', 'node:crypto', 'node:fs', 'node:os', 'node:path', 'node:url']);
const STRIP_SITES: Array<[string[], RegExp]> = [
  [['ssh.js', 'ssh.ts'], /^const DROP_ENV = \/(?:\\.|\[(?:\\.|[^\]\\])*\]|[^\/\\[])+\/[a-z]*;$/],
  [['redact.js', 'redact.ts'], /^\[\/(?:\\.|\[(?:\\.|[^\]\\])*\]|[^\/\\[])+\/[a-z]*, '[^']*\[redacted\][^']*'\],$/],
];
const DESKTOP_RULES: Array<[RegExp, string, Array<[string[], RegExp]>?]> = [
  [/\bfetch\s*\(/, 'a network request (fetch)'],
  [/\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b/, 'a network client'],
  [/\beval\s*\(|\bnew\s+Function\s*\(/, 'code from text'],
  [/(?<![.\w])exec(?:Sync)?\s*\(|\bexecFile(?:Sync)?\b|\bfork\s*\(|shell:\s*true/, 'a shell (spawn with shell: false only)'],
  [/\bsshpass\b|\bexpect\s+-|PasswordAuthentication|SSH_ASKPASS|KbdInteractive/i, 'a password handed to ssh'],
  [/setup-token|auth logout/, 'a Claude credential or sign-out', STRIP_SITES],
  [
    new RegExp(`${credentialVariables.join('|')}|apiKeyHelper|console\\.anthropic\\.com|platform\\.claude\\.com|sk-ant-|--console\\b`, 'i'),
    'a Claude credential, an API key, a gateway or a cloud provider for Claude Code',
    STRIP_SITES,
  ],
  [/~\/\.claude\b|\.beethoven\/claude|\.ashley\/claude|claude_config_dir/, "the Claude sign-in's folder"],
  [/\b(?:rmSync|rmdirSync|unlinkSync|unlink|rmdir)\s*\(|\bfs\.rm\b/, 'a deletion'],
  [/\bconsole\.(?:log|info|debug|warn|error)\b/, 'output beside the protocol (stdout is MCP only)'],
  [/['"`](?:forget|watch|restrict)\b/, 'a gate verb this edition never sends'],
];
const EXCEPTIONS: Record<string, string[]> = { '.credentials.json': ['workspace.js', 'workspace.ts'] };

/** desktop's findings for one file, as `<name>:<line>: <what>` */
function desktopScan(name: string, text: string): string[] {
  const out: string[] = [];
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  for (const m of code.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)) {
    const mod = m[1]!;
    if (!mod.startsWith('.') && !ALLOWED_IMPORTS.has(mod)) out.push(`${name}: imports ${mod}`);
  }
  for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]node:child_process['"]/g)) {
    for (const n of m[1]!.split(',').map((x) => x.trim()).filter(Boolean)) if (n !== 'spawn' && !n.startsWith('type ')) out.push(`${name}: imports ${n} from node:child_process`);
  }
  for (const [re, what, sites = []] of DESKTOP_RULES) {
    code.split('\n').forEach((l, i) => {
      if (re.test(l) && !sites.some(([where, line]) => where.includes(basename(name)) && line.test(l.trim()))) out.push(`${name}:${i + 1}: ${what}`);
    });
  }
  for (const [n, where] of Object.entries(EXCEPTIONS)) if (code.includes(n) && !where.includes(basename(name))) out.push(`${name}: names ${n}`);
  return out;
}

// ---- beethoven-extension ae11a00, extension/test/hygiene.test.ts ---------------------------------------

const BANNED = new RegExp(['prov', 'enance'].join(''), 'i');
const KEPT = [/ASHLEY\(\?:REV\)\?1/g, /ASHLEY(?:REV)?1/g, /\/shared\/ashley\//g];

// its checks over a whole file, each with what it finds
const BROWSER_TEXT_RULES: Array<[RegExp, string]> = [
  [/document\s*\.\s*cookie|cookieStore|browser\.cookies|chrome\.cookies/, 'reads a cookie'],
  [/(host_permissions|matches)\s*:[^\n]*(anthropic|claude)\./, 'a host on an Anthropic domain'],
  [/licen[cs]e[ -]key|site key|personal key|trial key|ASHLEY1'|save-key|isSiteKey|USERNAME_RE|licenceIdentity|LICENSE_KEY/, 'key wording'],
  [/document\.cookie/, 'document.cookie'],
  [/['"`]\/framework\/|files\.json|bundledFrameworkVersion/, 'a framework file'],
  [BANNED, 'the banned word'],
];
// its checks line by line, each with what it finds
const BROWSER_LINE_RULES: Array<[(line: string) => boolean, string]> = [
  [(l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l) && /['"`][^'"`]*framework\//.test(l), 'names a framework path in a string'],
  [(l) => /ashley/i.test(KEPT.reduce((s, re) => s.replace(re, ''), l)), 'the old name'],
];

/** the browser's findings for one file, as `<name>: <what>` for a whole-file rule, then `<name>:<line>: <what>` */
function browserScan(name: string, text: string): string[] {
  const out: string[] = [];
  for (const [re, what] of BROWSER_TEXT_RULES) if (re.test(text)) out.push(`${name}: ${what}`);
  text.split('\n').forEach((l, i) => {
    for (const [finds, what] of BROWSER_LINE_RULES) if (finds(l)) out.push(`${name}:${i + 1}: ${what}`);
  });
  return out;
}

describe("desktop's scan (beethoven-desktop 9ce98bb scripts/forbidden.mjs), over desktop's export", () => {
  it('finds nothing in any module desktop takes, comments taken out as desktop takes them out', () => {
    const paths = pathsOf('desktop');
    expect(paths.length).toBeGreaterThan(5);
    expect(credentialVariables.length).toBeGreaterThanOrEqual(15);
    expect(paths.flatMap((p) => desktopScan(p, textOf(p)))).toEqual([]);
  });

  it('has teeth: each rule base posture lacks finds its line in a module', () => {
    expect(desktopScan('src/sshopts.ts', "export const X = ['PasswordAuthentication=no'];")).toEqual(['src/sshopts.ts:1: a password handed to ssh']);
    expect(desktopScan('src/accounts.ts', "const d = 'claude_config_dir';")).toEqual(["src/accounts.ts:1: the Claude sign-in's folder"]);
    expect(desktopScan('src/run.ts', 'const r = exec(line);')).toEqual(['src/run.ts:1: a shell (spawn with shell: false only)']);
    expect(desktopScan('src/run.ts', 'unlink(path);')).toEqual(['src/run.ts:1: a deletion']);
    expect(desktopScan('src/gate.ts', "const v = 'watch';")).toEqual(['src/gate.ts:1: a gate verb this edition never sends']);
    // a key's name stands only on a redaction rule's own line in redact.ts, as desktop's strip site allows
    expect(desktopScan('src/redact.ts', "  [/sk-ant-[A-Za-z0-9_-]+/g, '[redacted]'],")).toEqual([]);
    expect(desktopScan('src/redact.ts', "const k = 'sk-ant-';")).toHaveLength(1);
    // a comment is not code to it
    expect(desktopScan('src/run.ts', '// unlink(path) never runs here')).toEqual([]);
  });

  it('has teeth for every rule, every import rule and its one exception: each finds its line, and no rule goes without a case', () => {
    const cases: Array<[string, string, string[]]> = [
      ['src/x.ts', 'const r = fetch(url);', ['src/x.ts:1: a network request (fetch)']],
      ['src/x.ts', 'const w = new WebSocket(u);', ['src/x.ts:1: a network client']],
      ['src/x.ts', 'const x = new XMLHttpRequest();', ['src/x.ts:1: a network client']],
      ['src/x.ts', 'const v = eval(text);', ['src/x.ts:1: code from text']],
      ['src/x.ts', "const f = new Function('a', 'return a');", ['src/x.ts:1: code from text']],
      ['src/x.ts', 'spawn(cmd, args, { shell: true });', ['src/x.ts:1: a shell (spawn with shell: false only)']],
      ['src/x.ts', "const v = ['claude', 'setup-token'];", ['src/x.ts:1: a Claude credential or sign-out']],
      ['src/x.ts', "const v = 'claude auth logout';", ['src/x.ts:1: a Claude credential or sign-out']],
      ['src/x.ts', `const v = '${credentialVariables[0]}';`, ['src/x.ts:1: a Claude credential, an API key, a gateway or a cloud provider for Claude Code']],
      ['src/x.ts', "const v = 'apiKeyHelper';", ['src/x.ts:1: a Claude credential, an API key, a gateway or a cloud provider for Claude Code']],
      ['src/x.ts', "const env = { SSH_ASKPASS: helper };", ['src/x.ts:1: a password handed to ssh']],
      ['src/x.ts', "const v = '~/.claude';", ["src/x.ts:1: the Claude sign-in's folder"]],
      ['src/x.ts', 'rmSync(dir, { recursive: true });', ['src/x.ts:1: a deletion']],
      ['src/x.ts', 'console.log(x);', ['src/x.ts:1: output beside the protocol (stdout is MCP only)']],
      ['src/x.ts', "const v = 'restrict';", ['src/x.ts:1: a gate verb this edition never sends']],
      ['src/x.ts', "import x from 'lodash';", ['src/x.ts: imports lodash']],
      ['src/x.ts', "import { spawn, execFile } from 'node:child_process';", ['src/x.ts: imports execFile from node:child_process', 'src/x.ts:1: a shell (spawn with shell: false only)']],
      ['src/x.ts', "import { spawn, type ChildProcess } from 'node:child_process';", []],
      ['src/x.ts', "const p = '.credentials.json';", ['src/x.ts: names .credentials.json']],
      // its strip site in redact.ts holds a name, and the same name off the rule's own line does not pass
      ['src/redact.ts', `  [/${credentialVariables[0]}=\\S+/g, '[redacted]'],`, []],
      ['src/redact.ts', `const n = '${credentialVariables[0]}';`, ['src/redact.ts:1: a Claude credential, an API key, a gateway or a cloud provider for Claude Code']],
    ];
    for (const [name, text, want] of cases) expect(desktopScan(name, text), text).toEqual(want);
    const found = new Set(cases.flatMap(([, , want]) => want.map((f) => f.replace(/^[^:]+(?::\d+)?: /, ''))));
    for (const [, what] of DESKTOP_RULES) expect(found, what).toContain(what);
    expect([...found].some((f) => f.startsWith('imports '))).toBe(true);
    expect([...found].some((f) => f.startsWith('names '))).toBe(true);
  });
});

describe("the browser's scan (beethoven-extension ae11a00 extension/test/hygiene.test.ts), over the browser's export", () => {
  it('finds nothing in any module the browser takes, comments included', () => {
    const paths = pathsOf('browser');
    expect(paths.length).toBeGreaterThan(5);
    expect(paths.flatMap((p) => browserScan(p, textOf(p)))).toEqual([]);
  });

  it('has teeth: the old name, the key words and the banned word are found in a comment too', () => {
    expect(browserScan('src/accounts.ts', '// the sign-in folder was ~/.ashley/claude')).toEqual(['src/accounts.ts:1: the old name']);
    expect(browserScan('src/redact.ts', "  [/ASHLEY(?:REV)?1\\.[A-Za-z0-9_-]+/g, '[signed-token]'],")).toEqual([]);
    expect(browserScan('src/gate.ts', '// the lab folder /shared/ashley/ stays')).toEqual([]);
    expect(browserScan('src/x.ts', '// a trial key')).toEqual(['src/x.ts: key wording']);
    expect(browserScan('src/x.ts', `// the ${['prov', 'enance'].join('')} of a file`)).toEqual(['src/x.ts: the banned word']);
  });

  it('has teeth for every rule: a cookie, an Anthropic host, key wording, a framework file or path, the old name, the banned word; and no rule goes without a case', () => {
    const cases: Array<[string, string[]]> = [
      ['const c = cookieStore.get(name);', ['src/x.ts: reads a cookie']],
      ['const c = browser.cookies.getAll({});', ['src/x.ts: reads a cookie']],
      ['const c = document.cookie;', ['src/x.ts: reads a cookie', 'src/x.ts: document.cookie']],
      ["matches: ['https://claude.ai/*'],", ['src/x.ts: a host on an Anthropic domain']],
      ["host_permissions: ['https://api.anthropic.com/*'],", ['src/x.ts: a host on an Anthropic domain']],
      ['// a licence key once', ['src/x.ts: key wording']],
      ["const f = 'files.json';", ['src/x.ts: a framework file']],
      ["const f = bundledFrameworkVersion();", ['src/x.ts: a framework file']],
      ["const p = 'lib/framework/x';", ['src/x.ts:1: names a framework path in a string']],
      ["const p = '/framework/x';", ['src/x.ts: a framework file', 'src/x.ts:1: names a framework path in a string']],
      ['// the old Ashley name', ['src/x.ts:1: the old name']],
      [`// ${['prov', 'enance'].join('')}`, ['src/x.ts: the banned word']],
      // a framework path in a comment line is not a string to it
      ["// see 'lib/framework/x'", []],
    ];
    for (const [text, want] of cases) expect(browserScan('src/x.ts', text), text).toEqual(want);
    // the expected set is the rule tables' own, so a rule added to either without a case turns this red
    const found = new Set(cases.flatMap(([, want]) => want.map((f) => f.replace(/^[^:]+(?::\d+)?: /, ''))));
    expect([...found].sort()).toEqual([...BROWSER_TEXT_RULES, ...BROWSER_LINE_RULES].map(([, what]) => what).sort());
  });
});

describe('a module only VS Code takes, which has no source scan', () => {
  it("passes the browser's scan, and desktop's but for strip.ts's names, each on its own line, which desktop allows only in its ssh.ts and redact.ts", () => {
    const scanned = new Set([...pathsOf('desktop'), ...pathsOf('browser')]);
    const only = pathsOf('vscode').filter((p) => !scanned.has(p));
    expect(only).toEqual(['src/strip.ts']);
    for (const p of only) {
      expect(browserScan(p, textOf(p)), p).toEqual([]);
      // desktop could not take strip.ts as its scan stands: every finding is a name of hpcworker's list on its own line
      const lines = textOf(p).split('\n');
      const found = desktopScan(p, textOf(p));
      expect(found.length, p).toBeGreaterThanOrEqual(credentialVariables.length);
      for (const f of found) {
        expect(f, p).toMatch(/^src\/strip\.ts:\d+: a Claude credential, an API key, a gateway or a cloud provider for Claude Code$/);
        const line = lines[Number(/:(\d+):/.exec(f)![1]) - 1]!;
        expect(line, f).toMatch(/^\s*'[A-Z][A-Z0-9_]*',$/);
      }
    }
  });
});
