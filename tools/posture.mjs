// The posture of base's source (design sections 1 and 3), checked by the gate before every push:
//
//   node tools/posture.mjs [DIR]        (default: src)
//
// Base is pure TypeScript an edition compiles into itself, so each module must hold nothing that does
// I/O, calls a platform, hashes, loads code, or runs when it is imported. It fails, with file:line, on:
// - an import, export-from, import type, import(), require or `import x =` of anything but a module
//   beside it ("./<name>.js", with that ending: the browser's Bundler lane would accept "./<name>"):
//   no node: module, no package, nothing outside the folder; import.meta; a triple-slash directive
//   (a reference path reaches a file past the export check, and a reference lib or types gives a
//   module a library its edition's lane does not have, such as the DOM in the desktop lane);
// - a reference to a platform's globals: fetch, XMLHttpRequest, WebSocket, EventSource, process,
//   Buffer, fs, child_process, crypto, window, document, navigator, chrome, browser, globalThis,
//   storage, timers, console; eval, and new Function; the word subtle anywhere outside a comment;
// - a top-level value that is not a literal or a /*#__PURE__*/ call whose arguments are literals (Vite
//   drops a module's unused literals and pure-marked calls and keeps other top-level calls, design
//   section 3); a statement that runs at load, a let or var (base keeps no state), an enum, a
//   namespace, an ambient declaration. Measured 2026-10-05 with the browser's Vite 8.3.1 on a module
//   imported for one function: of `/*#__PURE__*/ new RegExp(`^(?:${LINK.source})$`)` it dropped the
//   call and kept `${LINK.source}`; it kept `/*#__PURE__*/ new RegExp([...].join('|'))`'s join, a
//   template with a substitution, `[...LIST]` and `LINK.source`; it dropped `/*#__PURE__*/ new
//   RegExp('literal')`, `'abc'.length` and `{ ...{ a: 1 } }`. So a pure call's arguments must be
//   inert too, and the last two, though dropped, are refused with every property read and spread;
// - no API key anywhere (greg, 2026-10-04 13:27Z): the names of an API key or token, apiKeyHelper,
//   ANTHROPIC_BASE_URL and its kin, the Bedrock, Vertex, Foundry and gateway switches, the Console and
//   a Claude credential, except on a line that only takes one away: in strip.ts a line that is one
//   quoted upper-case name and a comma, in redact.ts a line that is one redaction rule (beethoven-
//   desktop's scripts/forbidden.mjs, STRIP_SITES, is the model);
// - anything in the folder that is not a flat, lower-case .ts module (no folder, no .d.ts, no link).
// Comments are not scanned: a comment may name what a line takes away.
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const dir = resolve(process.argv[2] ?? 'src');

/** names whose every reference is a platform call, a network, code from text, hashing or output */
/** @type {Map<string, string>} */
const PLATFORM = new Map();
/** @type {Array<[string, string[]]>} */
const GROUPS = [
  ['a network or browser call', ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'navigator']],
  ['a Node platform call', ['process', 'Buffer', 'fs', 'child_process', 'require', '__dirname', '__filename']],
  ['a platform global', ['window', 'document', 'globalThis', 'chrome', 'browser', 'localStorage', 'sessionStorage', 'indexedDB', 'importScripts']],
  ['a timer (a platform call)', ['setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'queueMicrotask', 'requestAnimationFrame']],
  ['cryptography or hashing (base does no hashing)', ['crypto']],
  ['output (base does no I/O)', ['console', 'alert']],
  ['code from text (eval)', ['eval']],
];
for (const [what, names] of GROUPS) for (const n of names) PLATFORM.set(n, what);

// The lines where a name below may stand because it is taken away there, never set, read or offered.
// strip.ts: one quoted upper-case name and a comma (design section 3). redact.ts: one redaction rule,
// a regular expression and its replacement and nothing more; its body takes no bare `/` outside a
// [class], so no code can ride along between two patterns on an allowed line.
const STRIP_SITES = [
  ['strip.ts', /^'[A-Z][A-Z0-9_]*',$/],
  ['redact.ts', /^\[\/(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\[])+\/[a-z]*, '[^']*\[(?:redacted|signed-token|private key redacted)\][^']*'\],$/],
];

/** @type {Array<[RegExp, string, boolean]>} pattern, what it is, whether a strip site may hold it */
const TEXT_RULES = [
  [/['"`]node:/, 'a Node module', false],
  [/\bsubtle\b/, 'cryptography or hashing (base does no hashing)', false],
  [/setup-token|CLAUDE_CODE_OAUTH_[A-Z0-9_]*|auth\s+logout|\.credentials\.json/, 'a Claude credential or sign-out', true],
  [
    /ANTHROPIC_[A-Z0-9_]*(?:API_KEY|AUTH_TOKEN|BASE_URL)|ANTHROPIC_(?:BEDROCK|VERTEX|FOUNDRY|AWS)_[A-Z0-9_]+|CLAUDE_CODE_API_KEY[A-Z0-9_]*|CLAUDE_CODE_USE_[A-Z0-9_]+|CLAUDE_CODE_SKIP_[A-Z0-9_]*_AUTH|AWS_BEARER_TOKEN_BEDROCK|apiKeyHelper|console\.anthropic\.com|platform\.claude\.com|sk-ant-|--console\b/i,
    'an API key, a gateway or a cloud provider for Claude Code',
    true,
  ],
];

/** @type {string[]} */
const findings = [];
/** @param {string} file @param {number} line @param {string} what @param {string} text */
const find = (file, line, what, text) => findings.push(`${relative('.', file) || file}:${line}: ${what}: ${text.trim().slice(0, 120)}`);

/** @type {string[]} */
const modules = [];
let entries;
try {
  entries = readdirSync(dir).sort();
} catch {
  console.error(`posture: no folder ${dir}`);
  process.exit(1);
}
for (const name of entries) {
  const full = join(dir, name);
  const st = lstatSync(full);
  if (st.isSymbolicLink()) find(full, 1, 'a link (base holds plain files only)', name);
  else if (st.isDirectory()) find(full, 1, "a folder (base's modules sit flat in src/)", name);
  else if (!/^[a-z][a-z0-9-]*\.ts$/.test(name) || name.endsWith('.d.ts')) find(full, 1, 'not a module of base (a flat, lower-case .ts file)', name);
  else modules.push(full);
}
if (modules.length === 0 && findings.length === 0) {
  console.error(`posture: no module under ${dir}`);
  process.exit(1);
}

for (const file of modules) scan(file);

if (findings.length > 0) {
  for (const f of findings) console.error(f);
  console.error(`posture: ${findings.length} finding(s)`);
  process.exit(1);
}
console.log(`posture: ${modules.length} file(s) clean`);

/** @param {string} file */
function scan(file) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  /** @param {ts.Node} node */
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  /** @param {ts.Node} node */
  const lineText = (node) => /** @type {string} */ (text.split('\n')[lineOf(node) - 1]);
  /** @param {ts.Node} node @param {string} what */
  const at = (node, what) => find(file, lineOf(node), what, lineText(node));

  for (const d of /** @type {{ parseDiagnostics?: ts.Diagnostic[] }} */ (/** @type {unknown} */ (sf)).parseDiagnostics ?? []) {
    const line = sf.getLineAndCharacterOfPosition(d.start ?? 0).line + 1;
    find(file, line, `does not parse: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`, text.split('\n')[line - 1] ?? '');
  }

  // ---- imports and references -------------------------------------------------------------------
  /** @param {ts.Node} node @param {string} spec */
  const specifier = (node, spec) => {
    if (!/^\.\/[a-z][a-z0-9-]*\.js$/.test(spec)) at(node, `imports ${spec} (base imports nothing but the modules beside it, as "./<name>.js")`);
  };
  // a directive is a comment to the parser, so it is read from the source file's own lists, never the text
  for (const r of [...sf.referencedFiles, ...sf.typeReferenceDirectives, ...sf.libReferenceDirectives]) {
    const line = sf.getLineAndCharacterOfPosition(r.pos).line + 1;
    find(file, line, 'a triple-slash directive (base imports only with import ... from "./<name>.js", under each lane\'s own lib and types)', text.split('\n')[line - 1] ?? '');
  }
  if (sf.hasNoDefaultLib) find(file, 1, 'a triple-slash directive (no-default-lib: each lane keeps its own lib)', '/// <reference no-default-lib="true"/>');
  /** @param {ts.Node} node */
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifier(node, node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node)) {
      at(node, 'an `import x =` (base imports only with import ... from "./<name>.js")');
    } else if (ts.isImportTypeNode(node)) {
      const arg = node.argument;
      const lit = ts.isLiteralTypeNode(arg) && ts.isStringLiteral(arg.literal) ? arg.literal.text : '';
      specifier(node, lit || '(not a string)');
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      at(node, 'a dynamic import() (code loaded at run time)');
    } else if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
      at(node, 'import.meta (a platform call)');
    } else if (ts.isIdentifier(node) && isReference(node)) {
      const what = PLATFORM.get(node.text);
      if (what) at(node, what);
      if (node.text === 'Function' && (ts.isNewExpression(node.parent) || ts.isCallExpression(node.parent)) && node.parent.expression === node) {
        at(node, 'code from text (new Function)');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // ---- what runs when the module is imported ---------------------------------------------------
  const local = topLevelNames(sf);
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) || ts.isExportDeclaration(st) || ts.isEmptyStatement(st)) continue;
    if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) {
      if (hasModifier(st, ts.SyntaxKind.DeclareKeyword)) at(st, 'an ambient declaration (base declares no globals)');
      continue;
    }
    if (ts.isFunctionDeclaration(st)) {
      if (hasModifier(st, ts.SyntaxKind.DeclareKeyword) || (!st.body && !isOverload(sf, st))) at(st, 'an ambient declaration (base declares no globals)');
      continue;
    }
    if (ts.isClassDeclaration(st)) {
      if (hasModifier(st, ts.SyntaxKind.DeclareKeyword)) at(st, 'an ambient declaration (base declares no globals)');
      else if (!inertClass(st, local)) at(st, 'a class whose definition runs code (a static block, a computed name, a non-literal static value or base class)');
      continue;
    }
    if (ts.isVariableStatement(st)) {
      if (hasModifier(st, ts.SyntaxKind.DeclareKeyword)) {
        at(st, 'an ambient declaration (base declares no globals)');
        continue;
      }
      // AwaitUsing is Const | Using, so the kind is compared whole, never bit by bit
      if ((st.declarationList.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const) {
        at(st, 'a top-level let, var or using (base keeps no state)');
        continue;
      }
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) at(d, 'a top-level destructuring (it reads properties when the module loads)');
        else if (!d.initializer || !inert(d.initializer, local, sf)) at(d, 'a top-level value that is not a literal or a /*#__PURE__*/ call');
      }
      continue;
    }
    if (ts.isExportAssignment(st)) {
      if (st.isExportEquals) at(st, 'an `export =` (base is ES modules)');
      else if (!inert(st.expression, local, sf)) at(st, 'a default export that is not a literal or a /*#__PURE__*/ call');
      continue;
    }
    if (ts.isEnumDeclaration(st)) at(st, 'an enum (it compiles to code that runs at load; use a union of literals)');
    else if (ts.isModuleDeclaration(st)) at(st, 'a namespace (it compiles to code that runs at load)');
    else if (!ts.isImportEqualsDeclaration(st)) at(st, 'a statement that runs when the module is imported');
  }

  // ---- names that are taken away, never set, read or offered -----------------------------------
  const code = withoutComments(sf, text).split('\n');
  const site = STRIP_SITES.find(([where]) => where === basename(file));
  code.forEach((line, i) => {
    for (const [re, what, strippable] of TEXT_RULES) {
      if (!re.test(line)) continue;
      if (strippable && site && /** @type {RegExp} */ (site[1]).test(line.trim())) continue;
      find(file, i + 1, what, /** @type {string} */ (text.split('\n')[i]));
    }
  });
}

/**
 * Whether an identifier stands for a variable (not a property name, a member name or a label).
 * @param {ts.Identifier} node
 */
function isReference(node) {
  const p = node.parent;
  if (!p) return true;
  if ((ts.isPropertyAccessExpression(p) || ts.isQualifiedName(p)) && (/** @type {ts.Node} */ (ts.isPropertyAccessExpression(p) ? p.name : p.right)) === node) return false;
  if (
    (ts.isPropertyAssignment(p) ||
      ts.isPropertySignature(p) ||
      ts.isPropertyDeclaration(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isMethodSignature(p) ||
      ts.isGetAccessorDeclaration(p) ||
      ts.isSetAccessorDeclaration(p) ||
      ts.isEnumMember(p)) &&
    p.name === node
  ) {
    return false;
  }
  if ((ts.isLabeledStatement(p) || ts.isBreakStatement(p) || ts.isContinueStatement(p)) && p.label === node) return false;
  if ((ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) && p.propertyName === node) return false;
  return true;
}

/** @param {ts.Node} node @param {ts.SyntaxKind} kind */
function hasModifier(node, kind) {
  return (ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : []).some((m) => m.kind === kind);
}

/** @param {ts.SourceFile} sf @param {ts.FunctionDeclaration} fn an overload signature, followed by the implementation */
function isOverload(sf, fn) {
  const i = sf.statements.indexOf(fn);
  const name = fn.name?.text;
  for (const next of sf.statements.slice(i + 1)) {
    if (!ts.isFunctionDeclaration(next) || next.name?.text !== name) return false;
    if (next.body) return true;
  }
  return false;
}

/** @param {ts.SourceFile} sf @returns {Set<string>} the names this module declares or imports at its top level */
function topLevelNames(sf) {
  const names = new Set();
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.importClause) {
      const c = st.importClause;
      if (c.name) names.add(c.name.text);
      const b = c.namedBindings;
      if (b && ts.isNamespaceImport(b)) names.add(b.name.text);
      if (b && ts.isNamedImports(b)) for (const e of b.elements) names.add(e.name.text);
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) names.add(d.name.text);
    } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) {
      names.add(st.name.text);
    }
  }
  return names;
}

/** @param {ts.Node} node @param {ts.SourceFile} sf whether a /*#__PURE__*\/ (or @__PURE__) comment stands right before it */
function pureMarked(node, sf) {
  // A comment on the same line before the node is the trailing comment of the token before it (only
  // one after a line break counts as leading), so both lists are read.
  const ranges = [...(ts.getTrailingCommentRanges(sf.text, node.pos) ?? []), ...(ts.getLeadingCommentRanges(sf.text, node.pos) ?? [])];
  return ranges.some((r) => /^\/\*\s*[#@]__PURE__\s*\*\/$/.test(sf.text.slice(r.pos, r.end)));
}

/**
 * Whether evaluating `e` when the module loads runs nothing: a literal, a function, a reference to one
 * of the module's own names, an array or object of those, or a pure-marked call or `new` whose
 * arguments are those.
 * @param {ts.Expression} e
 * @param {Set<string>} local
 * @param {ts.SourceFile} sf
 * @returns {boolean}
 */
function inert(e, local, sf) {
  /** @type {ts.Expression} */
  let x = e;
  for (;;) {
    if (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isSatisfiesExpression(x) || ts.isTypeAssertionExpression(x) || ts.isNonNullExpression(x)) {
      if ((ts.isCallExpression(x.expression) || ts.isNewExpression(x.expression)) && pureMarked(x, sf)) return pureCall(x.expression, local, sf);
      x = x.expression;
    } else break;
  }
  if (
    ts.isStringLiteral(x) ||
    ts.isNumericLiteral(x) ||
    ts.isBigIntLiteral(x) ||
    ts.isNoSubstitutionTemplateLiteral(x) ||
    ts.isRegularExpressionLiteral(x) ||
    x.kind === ts.SyntaxKind.TrueKeyword ||
    x.kind === ts.SyntaxKind.FalseKeyword ||
    x.kind === ts.SyntaxKind.NullKeyword ||
    ts.isArrowFunction(x) ||
    ts.isFunctionExpression(x)
  ) {
    return true;
  }
  if (ts.isIdentifier(x)) return x.text === 'undefined' || local.has(x.text);
  if (ts.isPrefixUnaryExpression(x)) {
    return (x.operator === ts.SyntaxKind.MinusToken || x.operator === ts.SyntaxKind.PlusToken) && (ts.isNumericLiteral(x.operand) || ts.isBigIntLiteral(x.operand));
  }
  if (ts.isArrayLiteralExpression(x)) return x.elements.every((el) => ts.isOmittedExpression(el) || (!ts.isSpreadElement(el) && inert(el, local, sf)));
  if (ts.isObjectLiteralExpression(x)) {
    return x.properties.every((p) => {
      if (ts.isPropertyAssignment(p)) return !ts.isComputedPropertyName(p.name) && inert(p.initializer, local, sf);
      if (ts.isShorthandPropertyAssignment(p)) return local.has(p.name.text);
      if (ts.isMethodDeclaration(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p)) return !ts.isComputedPropertyName(p.name);
      return false;
    });
  }
  if (ts.isClassExpression(x)) return inertClass(x, local);
  if ((ts.isCallExpression(x) || ts.isNewExpression(x)) && pureMarked(x, sf)) return pureCall(x, local, sf);
  return false;
}

/** @param {ts.CallExpression | ts.NewExpression} c @param {Set<string>} local @param {ts.SourceFile} sf */
function pureCall(c, local, sf) {
  return (c.arguments ?? []).every((a) => !ts.isSpreadElement(a) && inert(a, local, sf));
}

/**
 * A class whose definition runs nothing beyond itself: no decorator, no static block, no computed
 * member name, static values inert, and a base class that is a plain name.
 * @param {ts.ClassLikeDeclaration} c
 * @param {Set<string>} local
 */
function inertClass(c, local) {
  const sf = c.getSourceFile();
  if (ts.canHaveDecorators(c) && (ts.getDecorators(c) ?? []).length > 0) return false;
  for (const h of c.heritageClauses ?? []) {
    if (h.token === ts.SyntaxKind.ExtendsKeyword && !h.types.every((t) => ts.isIdentifier(t.expression))) return false;
  }
  return c.members.every((m) => {
    if (ts.isClassStaticBlockDeclaration(m)) return false;
    if (m.name && ts.isComputedPropertyName(m.name)) return false;
    if (ts.isPropertyDeclaration(m) && hasModifier(m, ts.SyntaxKind.StaticKeyword) && m.initializer) return inert(m.initializer, local, sf);
    return true;
  });
}

/**
 * The text with every comment blanked (newlines kept, so line numbers hold). The comments are found
 * through the parsed tokens, so a // inside a string or a regular expression is never taken for one.
 * @param {ts.SourceFile} sf
 * @param {string} text
 */
function withoutComments(sf, text) {
  /** @type {Array<[number, number]>} */
  const ranges = [];
  const seen = new Set();
  /** @param {ts.CommentRange[] | undefined} rs */
  const add = (rs) => {
    for (const r of rs ?? []) {
      if (seen.has(r.pos)) continue;
      seen.add(r.pos);
      ranges.push([r.pos, r.end]);
    }
  };
  /** @param {ts.Node} node */
  const tokens = (node) => {
    add(ts.getLeadingCommentRanges(text, node.pos));
    add(ts.getTrailingCommentRanges(text, node.end));
    for (const child of node.getChildren(sf)) tokens(child);
  };
  tokens(sf);
  let out = text;
  for (const [pos, end] of ranges) out = out.slice(0, pos) + out.slice(pos, end).replace(/[^\n]/g, ' ') + out.slice(end);
  return out;
}
