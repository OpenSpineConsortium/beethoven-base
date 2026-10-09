# beethoven-base: revised design

2026-10-04, for greg. It answers your ask of 20:04Z: "can you migrate the common codebases to a
separate repo, beethoven-base, and just have the beethoven-vscode, beethoven-extension, and
beethoven-desktop extensions contain their specific unique code? that way i can add features to all
of them by updating the base repo?" It replaces the first design in
`staging/desktop-thread/beethoven-base-design-and-critiques.json`. Both critiques were checked
against the code. Where a critique was right, the design changed; where it was wrong, section 11
says why.

| Repository | Ref read | Note |
|---|---|---|
| hpcworker | f0b949b (local `claude/project-thread-fx3wkp`), ed94b6b | origin's branch is at b35952a; ed94b6b is on no branch |
| beethoven-extension | d6db850 (origin `claude/project-thread-fx3wkp`) | 15.0.0 in progress, on top of 2ee899e |
| beethoven-desktop | d014a82 | |
| beethoven-vscode | origin/main 80f79db, aa44696 (account setting) | you merged three dependabot PRs at 20:58Z, after 24a9896 |
| beethoven-research | origin/main 8dd5be2, b7b8650 | bee moved to beethoven-agents in 95792e6 |
| beethoven-base | 70780e6 | README only |

Moved since this was written (checked 2026-10-04 after 21:52Z). hpcworker PR #3 merged at 21:52Z as
5492d4d: f0b949b, 6171be9 (nine more queue-report fixes) and 86caaa2 (the same patch as ed94b6b), with
VERSION still 17. beethoven-extension's origin branch is at 9aa1171, which merges wip/mac-W and
wip/mac-R onto d6db850. beethoven-vscode main is at cc76efd, where a199f19 puts `@types/vscode` back
to 1.100.0. bee at beethoven-agents 0de7913 has the same 27 `CREDENTIAL_VARS` and the same label rule
as at b7b8650.

A prototype of the modules was built in scratch from the code named in section 2, to measure the
posture checks and the compilers. It is not kept and is not the code for pull request #2.

**Rebuilt to the interface standard, 2026-10-08.** greg's order of 2026-10-07 11:35Z,
"encapsulating each repo so that it is independent and not directly accessing any code of another
repo in the Beethoven ecosystem. Make sure it obeys the standard API-type interfacing.", produced the
ecosystem's interface standard, version 1 (`INTERFACES.md` in the hub,
`OpenSpineConsortium/beethoven`). The skeleton as first built broke three of its rules:
`tools/pull-hpcworker.mjs` read an hpcworker checkout, `tools/vendor.mjs` wrote into an edition's
checkout, and each edition would have run base's `vendor/check.mjs` (rule 1); what each edition took
was in `editions/*.json`, not in `interface/INTERFACE.json` (rule 2); and an edition would have taken
base through base's own command at a release tag, not with its own `interface/pull.sh` at a merged
commit (rule 3). Those parts are gone. Sections 1, 3, 4, 5, 10, 13 and 14 describe the rebuilt
design, section 6.1 the contract as hpcworker now publishes it and section 6.4 the credential list it
carries; section 12, greg's decision record, is unchanged; the other sections are as written on
2026-10-04 except where they named the removed parts or what each edition takes (section 2's lead-in
and its site-profiles bullet).

**Built, 2026-10-08 (step 9).** The 13 modules and the three exports are in `src/` and
`interface/INTERFACE.json`, each module tested against hpcworker's `contract` export or
beethoven-agents' `registry` export, both pinned under `test/`. The modules were written from the
editions' code at desktop 9ce98bb, browser ae11a00 and VS Code e7526f9, against hpcworker 3b22e70
and beethoven-agents a40a71a; where they follow the contract, they follow it over an edition, and
where the editions differ from each other they take the stricter side. Section 2 now says, after its
table, where the built modules differ from it; section 6.1 answers which cases the export covers;
section 15 lists, per edition, what changes for its students and its code when it takes its export,
and the choices step 9 made where the contract is silent. Sections 1 to 6, 9 to 11, 13 and 14 are
updated for it, and section 15 is new; section 12 is unchanged. The step's first review is folded in:
what it found that belongs to hpcworker is in section 6.1's requests, and what it changes for an
edition is in section 15.

## 1. The decision

- beethoven-base is a small TypeScript library of 13 modules. Each module has two or more real
  consumers today, or is a rule every edition must apply the same way. The estimate here was about
  550 lines; as built at step 9, after its second review, the modules are 2,639 lines, 1,493 of them
  code (counted from the parse tree, comments and blank lines left out). The rest is comments, which
  say why on every export, and blank lines; the code is longer than the estimate because each file is
  read field by field, and every list the contract carries is typed out so a test can hold it equal to
  the export.
- It holds no UI, no sentence a student reads, no platform call, no I/O, no hashing and no import
  beyond its own files.
- Base offers one export per edition in `interface/INTERFACE.json` (`desktop`, `browser` and
  `vscode`, kind `files`, version 1 each, since step 9), each listing the modules that edition
  takes. Each edition takes its export as a pinned copy inside its source root, with its own
  `interface/pull.sh`, from GitHub at a commit base's `main` contains, and checks it with no secret
  against an `ORIGIN` record in its own boundary test (the interface standard, rule 3). No tool of
  base's runs in an edition, and the puller never deletes.
- No edition holds a secret for base. The only secret an edition holds is `RULESETS_TOKEN`, for
  `rulesets.yml` only, as desktop does today. beethoven-base may hold two GitHub credentials for
  code, each in a protected environment. Neither is a Claude key, and no workflow anywhere runs
  Claude Code.
- hpcworker stays canonical for everything it writes, and publishes it as its `contract` export:
  machine-readable schemas, rules and vectors from its real writer, with a test that fails on drift
  (section 6.1).
- The VS Code edition moves onto hpcworker for its Remote Control worker. The `claude -p` queue does
  not go into hpcworker; where it goes is decision D1.
- A safety step came first and did not wait for base: grid scripts 9 is on VS Code's main as 4fe5ffd,
  with its third review e20c814, and grid scripts 10 (f7f012b, 92a032a) followed, all before e7526f9,
  the ref step 9 read (section 8). Main's version 5.0.0 was set earlier, at 710d74e; whether 5.0.0 is
  published, and with which grid scripts, is not yet measured.

## 2. Contents

Each row is one module in base `src/`; "yes" means that edition's export lists it (section 4). Lines
are at the refs above; VS Code's are at aa44696.

| Module | Holds | Comes from | Desktop | Browser | VS Code now | VS Code at 7.0.0 |
|---|---|---|---|---|---|---|
| links.ts | The two Claude Code link shapes, with exact-match tests | desktop contract.ts:16-23 (same as browser contract.ts:997-1019) | yes | yes | yes: extension.ts:730 opens `session_url` unchecked | yes |
| steps.ts | `HPCW-STEP` parser with all 11 failure codes, exit codes, the progress.log line | browser contract.ts:387-443, 585-598 | yes: replaces contract.ts:166-197; :177 reads signin-billed and signin-method as "other" | yes | no | yes |
| status.ts | `status --json` types, the `{"v":1` prefix parser, the stopped line | desktop contract.ts:95-151, 199-203 | yes | yes | no | yes |
| gate.ts | The lines for version, status, stop, read and connect; the remote line; refusals with exit codes 123, 125, 126; the version line with its due date | desktop contract.ts:25-93, browser contract.ts:1133-1193 | yes | yes; watch, restrict and forget stay in its contract.ts | no | yes |
| run.ts | R12: stale after 3 minutes. Both link choices: session first, environment first | browser worker.ts:128, facts.ts:114-128 | yes: replaces linkOf :153-164 and the 5 minutes at tools.ts:104 | yes | no | yes |
| meaning.ts | Each failure code and gate limit mapped to a next step (retry, sign in again, ask the lead…); no sentences | V11 5.3 | yes | yes | no | yes |
| profile.ts | The profile keys clients read, `expandPath` (on a word boundary), `sharedRootOf`; pure, no fs | desktop profile.ts:44-79, browser contract.ts:166-212 | yes | yes | no | yes |
| redact.ts | The redaction and credential rules, plus new rules for `hf_`, `gh?_` and `github_pat_` | desktop redact.ts (rules byte-identical to the browser's core/redact.ts) | yes | yes | yes: diagReport.ts:37 | yes |
| accounts.ts | accounts.json parser by bee's rules: label `[a-z0-9-]`, 1 to 32 characters, no leading hyphen; absolute paths; known keys only; at most 64 KB (desktop's own limit; bee sets none) | desktop accounts.ts:12-20, 64-109; VS Code accounts.ts:47-75 | yes | no: it cannot read a file | yes | yes |
| sshopts.ts | The OpenSSH `-o` options; `fingerprintMatches(pinned, seen)` | desktop ssh.ts:101-110, VS Code shell.ts:135 | yes | no: own client | yes | yes |
| signin.ts | The four-key subscription rule (loggedIn, authMethod, apiProvider, no apiKeySource) | hpcworker common.sh:236-252 | no: status.json carries no authMethod (worker.sbatch.tpl:245) | yes: the probe | yes: wizard.ts:533-535 ignores apiKeySource | yes |
| strip.ts | The exact list of Claude, key, gateway and provider variables (section 6.4) | hpcworker worker.sbatch.tpl:215-217 | no: ssh.ts:156 drops them all by pattern | no: it spawns nothing | yes: services.ts:21 has 9 of 15 | yes |
| diagnostics.ts | The check engine: dependency order, "blocked" with its root cause, slow checks only on a full run; generic over layer and fix | browser diagnostics.ts:78-163; VS Code diagnostics.ts (same algorithm) | no | yes | yes | yes |

**As built at step 9 (2026-10-08).** Lines are total and, in brackets, code. Where a module
differs from its row above:

| Module | Lines | Imports | What differs from the row |
|---|---|---|---|
| links.ts | 55 (20) | none | The contract's `claude_link` pattern, anchored, so an edition can no longer splice it into a larger RegExp as desktop and the browser do with `ENVIRONMENT_URL` today; `linksIn` finds the links a text holds, in the order printed, with an unanchored copy of the same pattern made inside the function (the browser's rc.log registration, section 15.2). VS Code's cell is out of date: at e7526f9 extension.ts:825-827 checks `isClaudeCodeLink` before `openExternal`; what is still unchecked is diagNodes.ts:428, which prints `session_url` in a diagnostic's text. |
| steps.ts | 251 (153) | none | Also the step order and a transcript's rules (a step repeated, text after `failed`), and `cleanLine`, which strips the union of what hpcworker's `hpcw_strip_codes`, the browser's and desktop's cleaners strip: desktop's set, the charset designations (ESC ( B) of the other two, and the NUL hpcworker removes first. A job id is digits only, as the export says, though hpcworker's PBS adapter prints more (section 6.1). Of the 11 failure codes, 10 have a vector of the real writer; `other` has none. |
| status.ts | 425 (311) | links, steps | Also connection.json and the status events of the gate's watch. It reads each file field by field against the schemas, drops a bad field and names it in `refused`, and reads a status line only after `cleanLine` and only with lines.json's `{"v":1` prefix. Where the writer and its schemas disagree it reads the writer: a link field's "" (connection.schema.json asks for a link) and `claude_login` null before the job's first check (status.schema.json asks for an object) read as absent and are not refused (section 6.1). |
| gate.ts | 234 (118) | steps, profile | Imports profile.ts for `sharedRootOf`, so desktop's remote line has one path rule (V11 section 4's `<shared>`). Counts a refusal, a cap or a read failure with the exit status lines.json gives it, when the caller gives one (without one, the line alone counts), and the key's expiry only with its line. Reads `hpcworker: unknown command 'gate'`, the line `die` prints on standard error with exit 1, on either stream as `no-gate`: a lab's copy without the gate (the browser's `old-copy`). The first `ok` version line wins. `FRAMEWORK_MIN` is 17. The cap words are keys of `GATE_LIMIT_WORDS`, not quoted words, for desktop's scan (section 3). |
| run.ts | 124 (56) | links, status | Also R1, `CONTRACT_TIME` (the schema's time pattern with its fields captured, held equal to it) and `isStaleAt`, R12 on a heartbeat the edition has already timed (the browser's, section 15.2). Stale only past 180 s (V11 R12, hpcworker's status_line and the browser's facts.ts; its worker.ts is stale at exactly 180 s). Reads connection.json before status.json and `session_url` before `environment_url` in each, as facts.ts does: `openLinkOf` is Open, `newSessionLinkOf` (an environment link only) is New session (D7). |
| meaning.ts | 120 (48) | steps, gate | Five next steps: retry, retry-later, sign-in-again, fix-request, ask-lead. Also read's three failures, and `no-gate` as ask-lead. `busy` stays retry-later though some of its causes do not pass (section 15.4). |
| profile.ts | 310 (205) | none | Merged before step 9 (PR #2). |
| redact.ts | 101 (44) | none | `redact`'s rules take every credential shape `redactCredentials`' rules take: the JSON credential fields, the `ANTHROPIC_` and `CLAUDE_CODE_` key variables and the private-key block come before the 40-character rule, which stopped at each `+` and `/` of a key (sections 15.1 and 15.2). Since the second review both sets also take a JSON `token` or `secret` field, a key variable written as a quoted JSON key (settings.json's `env` block) and an HTTP Basic credential after an Authorization header (section 15.4). Both functions are for text: a structured value is redacted string by string, never as serialised JSON (section 15.1). VS Code's consumer is gridApi.ts's `redactCredentials`. diagReport.ts's `scrub` (TOKEN_LIKE at :43, not :37) is another rule set, with a `<token>` mark, a JWT rule and 8-character minimums, and stays VS Code's (section 15.4). |
| accounts.ts | 272 (152) | none | Reads by the registry schema's types (bee's own parsing coerces "1" and "no"; base refuses them), refuses a folder with a `..` step or a control character, keeps the file's order on a tie, and returns codes, never an unknown key's name. A refusal bee might not make carries `beeMayTake`, and `beeRefusesToo` says whether bee's own list would name a fault (desktop's pointer, section 15.1). |
| sshopts.ts | 164 (61) | none | The union of desktop's and VS Code's options, the stricter side where they differ (`StrictHostKeyChecking=yes`, `GSSAPIAuthentication=no`, `ConnectTimeout=20` on the sign-in too), and a known_hosts path refused where ssh would split or expand it. It also closes every other source of host keys: `GlobalKnownHostsFile` is the pinned file, `VerifyHostKeyDNS=no`, `NoHostAuthenticationForLocalhost=no`, and `KnownHostsCommand=none` when the edition passes the version `ssh -V` printed and it is 8.5 or later (section 15.4). It owns connection sharing too: `ControlPath=none` and `ControlMaster=no` unless the edition names its own control path (desktop's), so no master another ssh opened carries a call. `tool` gives scp's and sftp's `-P` for the port, where ssh's is `-p`. |
| signin.ts | 106 (41) | none | Follows rules.json's text where hpcworker's `hpcw_claude_signin` differs from it: `apiProvider` null or empty reads as other (section 15.4). A parsed answer is judged by its own keys, then printed and read as text, so a nested key counts as the worker counts it; a parse has already lost a repeated key, so an edition passes the text. `signinAnswered` tells an answer that says not signed in from no answer at all, both `none` (VS Code's "did not answer", section 15.3). VS Code's cell is out of date: at e7526f9 wizard.ts:547 refuses an answer that carries `apiKeySource`. |
| strip.ts | 90 (40) | none | rules.json's 15 names, not yet section 6.4's 33; the two Remote Control variables only on request. `withoutCredentials` returns the environment with the names removed, and `credentialOverrides` returns `{NAME: undefined}` for a caller that merges over its own environment, as VS Code's `run()` does (section 15.3). VS Code's cell is out of date: at e7526f9 services.ts:24 already holds all 15, in rules.json's order. |
| diagnostics.ts | 387 (244) | none | The engine's sentences, its timeout and its clock come from the edition (`words`, `guard`, `now`); the fix field is `fix`; a check that answers no verdict fails alone as crashed; duplicate ids are refused; `skip` and `warn` count only when exactly true (section 15.4). |

The exports are the table's columns: desktop and the browser as marked; VS Code links, redact,
accounts, sshopts, signin, strip and diagnostics, none of which imports another, with steps, status,
gate, run, meaning and profile joining at 7.0.0.

**What stays in its edition, and why.**

- **The browser's sign-in lines** (`LOGIN_LINES`, `parseLoginLine`, `isClaudeAuthUrl`, browser
  contract.ts:328-372): only the browser signs in this way. Desktop and VS Code use `hpcworker
  claude login` in a terminal, and the gate pins `--login never` (browser_key.sh:582).
- **The browser key**: the `HPCW-KEY` lines, `browserKeyAdded` and the verbs forget, watch and
  restrict (contract.ts:1105-1129, 1179-1283). Desktop's scan refuses those verbs (forbidden.mjs:53).
- **The probe** (`ProbeFile`, `probeVerdict`, contract.ts:830-889) and **the portal command lines**
  (`commands`, `installShared`, `consentRecord`): one consumer each, the browser.
- **signed.ts**: one consumer; VS Code verifies with grid/license.js on node:crypto.
- **Terms**: the only shared code is one CRLF line in each edition (VS Code terms.ts:121, browser
  terms.ts:152). The records differ, and base does no hashing.
- **site.ts**: the editions read different services.json keys with different caches. The browser
  accepts any https `access_check` (access.ts:318, 350); only `request_page` must be on the
  vendor's site (access.ts:216, 352).
- **Account-name rules**: three identities (the portal's dashboard name, desktop's unix login for
  `ssh -l`, VS Code's Wayne AccessID). No one rule fits all three.
- **Floors**: one clock per class of action. Only desktop breaks it, keying its clock by worker name
  (grid.ts:235, 251), and desktop fixes that itself. A floors module joins base only if VS Code
  needs one at its move.
- **Sentences a student reads** (WORDS, steps.ts, describeSteps): each edition's. Base holds only
  meaning.ts.
- **Site profiles (JSON)**: they stay where they are, taken from hpcworker's `profiles` export by
  desktop's and the browser's own `interface/pull.sh` (VS Code holds none before 7.0.0 and adopts the
  standard at step 13); both copies of wayne.json equal hpcworker's today (diff). Under `src/base`
  they would fail the browser's old-name test, which walks `src/**/*.json` (hygiene.test.ts:33):
  wayne.json:56 has `.ashley-remote-consent`, and its notes (:88) say "shared/ashley and". Re-run
  here with the test's own `KEPT` rule: both lines are findings.

**Real size, checked** against the line ranges above (the estimate of 2026-10-04). Before VS Code
moves, base replaces about 550 duplicated lines: desktop about 350 (all 203 of contract.ts, all 38
of redact.ts, profile.ts:44-79 and the parse parts of accounts.ts) and VS Code about 205
(diagnostics.ts minus its layer types, accounts.ts:47-75, services.ts:21-26, wizard.ts:533-535,
shell.ts:135). At 7.0.0 VS Code also takes steps, status, gate, run, meaning and profile, about 280
lines it would otherwise write by that estimate; as built at step 9 those six modules are 1,463
lines, 891 of them code. Critique 2's figure of about 850 counted the terms core, floors and the step
sentences, which stay out. For scale, the client code is 37,141 lines: browser src 25,046, VS Code
src and grid 9,516, desktop src 2,579.

## 3. Base passes both editions' posture checks as they are

**Measured on the prototype** (not kept, so only the strip.ts count below was re-run here):

- **Desktop.** `scripts/forbidden.mjs`, unchanged, passed the desktop list: "11 files clean", over
  the source and over the JS emitted by desktop's NodeNext tsc 5.9.3 (that count includes a floors
  module dropped since). Over every module it gave 9 findings, all in strip.ts: the credential rule
  (:42) and the API-key rule (:46). Desktop does not take strip.ts, so no rule changes. If it ever
  does, the scan gains one `STRIP_SITES` entry for strip.ts allowing a line that is one quoted
  upper-case name and a comma, since such a line holds nothing but a name being taken away.
  Re-run here on a strip.ts of the 33 names in that form: the same 9 findings (2 and 7), and 0
  with that entry added.
- **Browser.** The browser list typechecked under WXT's options (Bundler, Preserve,
  verbatimModuleSyntax, noUncheckedIndexedAccess, DOM; tsc 5.9.3). The hygiene test's source checks
  (the old-name test with its `KEPT` rules, "accepts no key", cookies, framework files, host
  permissions), run over that list, found 0 findings.
- **VS Code.** Its lane is Node16 CommonJS. The list passed under TypeScript 7.0.2, which VS Code's
  main now pins, and under 5.9.3; esbuild bundled it, and the bundle ran.

**Re-measured at step 9, on the built modules.** The source rules of desktop's
`scripts/forbidden.mjs` (9ce98bb) and of the browser's `test/hygiene.test.ts` (ae11a00), rewritten
from their text in scratch (nothing of either repository run), were applied to the export each
edition takes. One finding: desktop's rule against a quoted gate verb it never sends (`watch`,
`restrict`, `forget`) caught gate.ts's type of the cap names, `'watch'` among them, a cap and not a
verb. gate.ts now writes the cap words as keys (`GATE_LIMIT_WORDS`), its test pins that no quoted verb
is left, and both scans are clean. strip.ts is in neither export, so desktop's `STRIP_SITES` entry is
still not needed. Each export was also compiled alone, laid out as its edition holds it, under its
lane's options (desktop and the browser under 5.9.3, VS Code under 5.9.3 and 7.0.2): exit 0 each. The
scratch scripts are not kept. Neither the editions' bundlers nor their suites have run the copies:
not yet measured (steps 10, 11 and 13).

**Held in base's gate since the first review.** Base's posture scan does not hold every rule the
editions' scans hold: desktop's rules against a password handed to ssh, the sign-in's folder, a shell
and a deletion, and the browser's old-name and key-word rules, which read comments too, reach past it.
`test/scans.test.ts` types both scans again from their text at those refs (desktop's credential names
from the pinned rules.json, as desktop reads them from its own pinned contract) and runs each over the
export its edition takes, so a change an edition's scan would refuse turns base's gate red first. A
case per rule, per import rule and per exception shows each has teeth, and the test fails when a rule
has no case: each of the browser's cookie, Anthropic-host and framework rules and desktop's fetch,
eval, console and network-client rules, switched off in turn, turned it red. A mutation of
sshopts.ts, signin.ts and gate.ts was caught.
The same test holds that the one module only VS Code takes, strip.ts, passes the browser's scan and
not desktop's: every desktop finding there is a quoted credential name on its own line, the
`STRIP_SITES` entry above. When an edition's scan changes, that test follows it at the new ref.

**Where the record lives.** Under the standard no tool of base's goes into an edition, only the
modules, and the copy's `ORIGIN` sits inside the copy's folder, beside them (`src/base/ORIGIN` in
desktop, `extension/src/base/ORIGIN` in the browser and VS Code). Those folders are scanned:
desktop's forbidden.mjs walks `src` but reads only `.js`, `.cjs`, `.mjs` and `.ts` files (desktop
main 9ce98bb), so it passes over `ORIGIN`; the browser's hygiene test walks src, test, mock-ood and
store-assets/src (hygiene.test.ts:33, 104, 117-126, read at the refs above); VS Code has no source
scan, and its tools/release_check.mjs reads only the built .vsix. Whether the browser's walk and
each bundler pass over a file named `ORIGIN` is not yet measured.

**Hashing rule: base does no hashing.** It imports nothing, neither node:crypto nor WebCrypto. VS
Code's `sha256` (terms.ts:120) and desktop's `fingerprintOf` (ssh.ts:243) stay synchronous in their
editions; base offers only the pure `fingerprintMatches`. Ed25519 stays in the browser's signed.ts.
Base needs only ES2022 language features, so desktop's `runtimes.node >=18.0.0`
(bundle/manifest.json:45-46) holds.

**The Vite rule.** Measured with the browser's own Vite 8.3.1 on a module imported for one function:
it dropped literals, regex literals, `new RegExp`, `new Set` and calls to some local functions; it
kept top-level `Object.freeze([...])`, `[...].map(...)` and `[...].join(...)`, and dropped those
three when marked `/*#__PURE__*/`. Re-measured here with the same Vite: a local function returning a
constant, an array or an object was dropped, but a call whose body builds a string from its argument
or a `new RegExp` of it was kept, minified or not. So in base a top-level value is a literal or a
pure-marked call, and base's posture scan enforces it. The per-edition exports keep other editions'
modules, such as sshopts.ts, out of the browser's copy altogether. The browser's package test gains
a scan of the built bundle for every strip-list name and `apiKeyHelper`; it has none today.

## 4. How editions take base

**The interface standard governs** (`INTERFACES.md` in the hub, version 1). Base declares what it
offers in `interface/INTERFACE.json`; an edition takes it only as a pinned, checked copy, with its own
puller; neither repository reads the other's checkout or runs the other's code.

**Exports.** From step 9 base's `interface/INTERFACE.json` lists three exports, one per edition:
`desktop`, `browser` and `vscode`. Each is kind `files`: TypeScript source the edition carries byte
for byte inside its own source tree and compiles. The standard has no TypeScript kind, and `files` is
the existing one that says what happens to them. Each export's `paths` list the modules it takes under
`src/`, one per module, as the section 2 table says, and each has an integer `version`. A module's
relative imports must be in the same export: `tools/exports.mjs`, run in the gate, fails an export
that leaves one out, naming the file and the import; an export path that matches no tracked file; and
an edition's export path outside `src/`. The posture scan allows a module no other way to name a file
(only `./<name>.js`, no triple-slash directive). That checks what an export holds, not that it
compiles alone: the typecheck lanes compile all of `src/` together under each edition's options.
Until step 9 `exports` was `[]`, and then `profile.ts` alone in `desktop` and `browser`; step 9
lists all three exports, version 1 each.

**Layout in the edition.** Desktop takes its export into `src/base/`, the browser and VS Code into
`extension/src/base/`. Each module lands at its path below `src/` (`src/links.ts` at
`src/base/links.ts`), with the copy's `ORIGIN` beside them; the puller places each file below the
folder all of the export's paths share, and the export check keeps an edition's paths under `src/`.
The copy has no package.json, so VS Code's CommonJS is untouched.

**The pull.** The edition runs its own `interface/pull.sh` (its own puller: the standard's rule 3 says
what a puller must do, not its text, and desktop's and the browser's differ; VS Code has none until
step 13) through the person's own `gh` sign-in. It takes only a commit base's default branch
contains (a merged change, never a pull request's branch), reads base's `INTERFACE.json` at that
commit, refuses an export or a version base does not offer there, fetches only the files the export
lists, fetches every file before it places any, and writes `ORIGIN`:

```
repository OpenSpineConsortium/beethoven-base
commit <40 hex>
export desktop 1
sha256 <64 hex> links.ts
```

It never deletes. A module the new copy lacks is listed for a person to remove in the reviewed pull
request, and the edition's boundary test fails until it is gone, so tsc never keeps compiling a
module base dropped. Base's own `interface/pull.sh` is desktop's, ported by hand, with refusals
desktop's lacks (an import folder outside `test/<name>`, a link on the way to a file it would write,
a `.part` name in the export or already in the folder); it took base's six imports from GitHub,
first on 2026-10-08.

**The check.** The edition's own boundary test, in its own test run, with no secret and no network,
fails when a file differs from `ORIGIN`, when the folder holds a file `ORIGIN` does not list, and
when `ORIGIN`'s export or version is not the one the import names. The edition's conformance tests
then say whether its code still reads the copy.

**Versions, not tags.** What an edition acts on is its export's integer `version` and the commit in
its `ORIGIN`. A change an edition must act on (a name removed, renamed or retyped, a code whose
meaning changes) raises the export's version in the same pull request as the code; an additive one
keeps it. There are no release tags.

**What the earlier design had that the standard does not give**, recorded as risks in section 13:

- the refusal of an `ORIGIN` older than the one on the pull request's base branch, which caught a
  rebase that took the older side;
- `check --source`, which rebuilt the copy from base's own checkout, so that an edited copy with a
  rewritten `ORIGIN` was caught. The standard defines no audit for it. Desktop's
  `bash interface/pull.sh --pinned src/base` (base's port has the same) takes again what `ORIGIN`
  names and refuses if it differs. The browser's puller has no such form: its `--at-origin` writes
  the files and `ORIGIN` again without comparing, so only `git diff` afterwards shows the edit. VS
  Code has no puller until step 13. A person runs each with their own sign-in, and no CI can;
- the refusal of a link anywhere in the copy's path. Desktop's and the browser's pullers create
  folders, redirect and move through a link (read at 9ce98bb and ae11a00, not run here), so a link in
  the edition's copy folder takes a pull outside the edition's repository; base's own puller refuses
  one before it writes;
- the refusal of a file whose change neither `ORIGIN` nor the edition's `HEAD` held. Every puller,
  base's own included, writes over a copied file that was edited and not committed, without a word.

**The beethoven-qa precedent.** beethoven-qa keeps its own pinned-copy command and record under the
standard (the standard's rule 3 names that exception). Base does not, so that desktop and the browser
take base the way they already take hpcworker's exports, with their own `interface/pull.sh`, and VS
Code, which adopts the standard at step 13, takes it the same way.

**Lag.** From step 14 a report on base's main reads, through GitHub's API and never a checkout, each
edition's `interface/INTERFACE.json` on its main, the manifest the standard makes machine-readable,
and nothing else of the edition: the copy's `ORIGIN` is in no edition's exports, so it is private to
the edition (the standard's rules 2 and 4). The report fails when an edition's import of base names an
export version older than the one base offers. It cannot see how far behind base's main a copy is
within one version, since only `ORIGIN` holds the commit. It needs a read-only token (section 5);
without one, the same report runs from a session's own sign-in. Each edition also shows the export
version and commit of its copy in its own lab-lead diagnostics.

**Propagation.** After a merge that changes an export, a session runs each edition's
`interface/pull.sh` in that edition's own checkout, with its own sign-in, and opens one pull request
per edition (the standard's "How a provider changes an export", step 3). Base's workflows read, run
and check out no edition's code; automated propagation, if you ever choose it under D8, runs in each
edition (section 5).

## 5. Credentials

**No edition holds a secret for base.** The copy is checked with no credential. Nothing fetches base
at build time, in a store package or in your Mac release script: a person takes a new copy with the
edition's `interface/pull.sh` and their own `gh` sign-in. The one secret an edition holds is
`RULESETS_TOKEN`, for `rulesets.yml` only (desktop CLAUDE.md:101), below.

**`RULESETS_TOKEN`, what it can actually do.** Administration read and write on a fine-grained
token covers repository settings (GitHub's permission model; not exercised here): rulesets and
branch protection, so it can remove the rule guarding main; deploy keys, and a write deploy key can
push code; visibility, so it can make a private repository public; and collaborators. At 20:14Z you
made it an organisation secret visible to all repositories, so any push or same-repository
pull_request workflow in any OpenSpineConsortium repository can read it. "Manages settings and
cannot read code" (told to you at 20:17Z and in the 20:40Z `state/repos/beethoven-base.md`; its
21:24Z version, :17, now lists these powers) describes how it is used, not what it can do.
It is never used for code. Recommendation: delete the organisation secret; in each repository that
applies rulesets, create an Environment `rulesets` with deployment branches `main` only and store
the token there; give `rulesets.yml`'s job `environment: rulesets`; limit the token to those
repositories and give it an expiry.

**`BASE_REPORT_TOKEN`**, read-only, for the lag report: fine-grained, Contents read on the three
editions and nothing else, with an expiry, stored only in beethoven-base in an Environment `report`
with deployment branches `main` only. A token cannot be limited to one file: the permission reaches
each edition's code, and only the report's own code keeps it to `interface/INTERFACE.json`.

**`BASE_PROPAGATE_TOKEN`** is optional (D8), and the decision is not to make it now. Its first design
ran a job in base on a published `v*` release that checked out each edition and ran base's own Node
script there. Under the standard neither holds: there are no release tags, and a workflow that checks
out another repository, or fetches and runs another repository's script, breaks rule 1. A puller
also needs its own repository's checkout: it reads that repository's `interface/INTERFACE.json` and
writes into its folders. So if D8 ever changes, propagation runs in each edition: a workflow of the
edition's own that runs its own `interface/pull.sh` in its own checkout and opens the pull request
there. Base's workflows read, run and check out no edition's code. Where that credential lives and
what it may do (reading base's export from the edition, how the edition's workflow is started) is
designed again then; nothing of it is in base.

Two caveats. GitHub documents required reviewers on private repositories as Enterprise-only; this
organisation's plan is not checked. On GitHub Free, private repositories have no environment secrets
or deployment branches at all (Pro, Team or Enterprise), so every environment in this section depends
on the plan. And as your token it would carry your OrganizationAdmin bypass (desktop
`.github/rulesets/main.json:5-9`, `bypass_mode: always`), so it could push to an edition's main past
the checks; only the environment and the workflow's own code would stop that. A GitHub App would not
be on the bypass list.

**hpcworker holds nothing.** Base takes hpcworker's `contract` export with its own
`interface/pull.sh`, run with a person's own gh sign-in. No hpcworker workflow writes to base.

**CLAUDE.md lines to change**, each by the section 10 pull request that makes it true:

| File:line | Change |
|---|---|
| hpcworker CLAUDE.md:58 and beethoven-extension CLAUDE.md:58 ("no CI on a key or (a) token held as a secret") | Add: "(a Claude key or token; the GitHub credentials beethoven-base's protected environments hold, for code only, are not that, and no workflow runs Claude Code)". Desktop :31 and VS Code :36 (main) already say "that runs Claude Code". |
| hpcworker CLAUDE.md:298-303 | Add: the `contract` export carries vectors from the real writer; beethoven-base holds the one client implementation of the shared parsers; the profiles stay canonical here. |
| hpcworker CLAUDE.md:305 ("three lanes, none holding a secret") | No change: nothing in hpcworker holds one. |
| hpcworker CLAUDE.md:178-179 ("never called outdated by it") | No change under D6's recommendation. |
| beethoven-extension CLAUDE.md:329-334 | contract.ts keeps the browser's own lines; the shared parsers come from `extension/src/base`. |
| beethoven-extension CLAUDE.md:339 ("No secrets exist…") | Add: the base copy is checked by the extension's boundary test, which needs none. At step 12 (the kit) the line also names `RULESETS_TOKEN`, held in the `rulesets` environment for `rulesets.yml` only. |
| beethoven-desktop CLAUDE.md:42-43 ("only imports are Node's own modules") | Add: "and the pinned copy of beethoven-base in src/base, compiled with it, which imports nothing". |
| beethoven-desktop CLAUDE.md:89, :101 | Add: the base copy is checked by the boundary test, in CI. `RULESETS_TOKEN` becomes the `rulesets` environment's secret, main only. |
| beethoven-vscode CLAUDE.md:61, :81-86 (main; :65, :85-90 on aa44696) | The kit and pull requests at 6.0.0; the Grid section at 7.0.0. |
| beethoven-base CLAUDE.md (new) | Restates the non-negotiables with the clause above, the direction (hpcworker to base to editions), the interface standard and the source rules of section 3. |

## 6. Contract home

### 6.1 Canonical texts and vectors

hpcworker stays canonical for what it writes: V11_CONTRACT.md, V12_CONTRACT.md, the writer and the
profiles. Since the interface standard it publishes them as exports (read at hpcworker main 3b22e70):
`contract`, version 1, which is `interface/contract/` (`cli.json`, `lines.json`, `rules.json`, the
JSON Schemas of status.json, connection.json and the worker's status, and `vectors/`, written from the
real writer by `framework/tests/vectors.py`, with `framework/tests/test_interface.py` failing on any
difference); `contract-text`, the two texts; and `profiles`. This section first asked for vectors of
every `HPCW-STEP` line (including `signed-in - -`), of status.json and connection.json for R1 to R13
(including an online state with only `session_url`), of the gate's answers and exit codes, of the
`CLEAN_ENV` list and of the `claude auth status` cases of test_adapters.py:152-182 with their
verdicts. Step 9 checked the export against that list (hpcworker 3b22e70, `contract` version 1, 29
vectors). Base's tests read every vector through the parser that reads it, and hold every pattern,
list and number a module types by hand equal to the export where the export carries it; the copy in
`test/hpcworker/`, taken with base's own `interface/pull.sh`, is test data and is in no export. The
export lives under `interface/`, outside the `framework/` that deploy_shared.sh publishes, so
changing it changes no framework version.

**What the export covers:** every `HPCW-STEP` line at least once, and a `connect-failed-<code>`
vector for every failure code but `other`; status.json online, queued and stopped, and
connection.json online; the gate's `ok` (with `never`), `status`, `connect`, `read` of progress.log,
`refused` (126) and read's `missing` (1); `hpcworker version` of a shared copy; the worker's status
line, queued and missing; progress.log's asked, got-computer, connecting, online and stopped; the 15
credential names, the two Remote Control names, and the sign-in rule with 11 cases.

**What it does not**, each a request to hpcworker; until then base's tests use lines and files of
their own, and nothing holds those to the export:

- **Steps and progress.** No `HPCW-STEP signed-in - -`; no `failed other` (exit 1) and no unknown
  code read as other; no transcript with terminal codes, a carriage return, a glued keepalive or a
  ~/.bashrc's output first. lines.json does not say which terminal codes a reader strips:
  hpcworker's own `hpcw_strip_codes`, desktop's cleaner and the browser's strip different sets, and
  base strips their union (section 15.4). No
  progress.log line for error with its message, signin-abandoned, waiting-signin, reconnecting,
  renewing or ended, and none with an empty argument.
- **status.json and connection.json, R1 to R13.** Only online, queued and stopped. No vector holds a
  session link, and none is of a resumed session (`session_url` a session link, `environment_url`
  empty), which this section asked for. None in starting, need_login, need_consent, running,
  preempted or error; no `stop_reason` login_abandoned or successor_gone; no `claude_login` with
  loggedIn false; no restarts of 1 or more; no renewal; no stale file. R1 is only in
  connection.schema.json's description, and R12's 180 s and the five states that heartbeat are in no
  file of the export (V11 9.3 and bin/hpcworker status_line give them).
- **Where the writer and its own schemas disagree.** Base reads the writer, and neither case is in
  `refused`. status.json's `claude_login` is null from the job's first write (worker.sbatch.tpl:118,
  written at :164) until its first `claude auth status` (:252), and stays null in a file the job ended
  in error before it; status.schema.json types it as an object (bin/hpcworker's connect_last_login
  passes over such a file). connection.json's `session_url` and `environment_url` are "" for a
  resumed session's environment link and for both before Claude Code printed any (:48-49, :492;
  test_job.py:260 asserts the ""); connection.schema.json asks for `claude_link`. The requests:
  write `{"loggedIn":false}` before the first check or let the schema take null; make connection.json's
  two links `claude_link_or_empty`, as status.json's are; and add vectors of the starting file, of a
  resumed session and of a registration with no link printed yet.
- **A PBS job id.** The PBS adapter keeps the id qsub prints whole, server name and all
  (`pbs_parse_submit`, framework/lib/adapters/pbs.sh:12-16; test_adapters.py:83 asserts
  `7890123.pbsserver01`), and connect prints it in `HPCW-STEP queued <job> new` (bin/hpcworker:1183)
  and writes it to status.json. lines.json's queued pattern, status.schema.json's `job` and
  `next_job` and the worker status line's `job` and `next_job` take digits only. Here base follows
  the export, so its mirrors stay equal to it: on a PBS site the queued line is no step (the
  transcript still reads done and in order, without it), and `job` is refused in status.json and in
  the status line, so R1 cannot judge a file and takes it as current. No deployed site is affected:
  the one profile, wayne.json, names slurm, and the adapter's own header says it has run on no PBS
  cluster. The request: widen the job pattern in lines.json and the three schemas to the shape PBS
  ids take (for example `[0-9]+(\.[A-Za-z0-9.-]+)?(\[[0-9]*\])?`), or have `pbs_parse_submit` keep
  the numeric part only. steps.test.ts and status.test.ts pin today's reading of
  `7890123.pbsserver01`, so they turn red when the export changes.
- **The gate.** No `limit` line (123), no `HPCW-KEY expired` (125), no `not-plain` or `too-large`
  (3), no `ok` with a date or `-`, no watch event or keepalive, and no answer after a ~/.bashrc
  printed. The answer to `stop` (`worker NAME: stopped (...)`) is in V11 7.1's prose and in no line
  family; status.test.ts pins that gap so that it turns red when lines.json carries the line. The
  gate's acceptance rules (200 bytes, its characters, words of at most 64, no word but the lone `-`
  starting with `-`) are in framework/README.md only. No `hpcworker version` of an own copy. No line
  for a copy without the gate: `die`'s `hpcworker: unknown command 'gate' (hpcworker help)`, on
  standard error with exit 1 (bin/hpcworker:2297), which gate.ts types by hand as `NO_GATE_LINE` (the
  worker-status-missing vector shows `die`'s shape, not this line); lines.json should carry it. `limit
  busy` names a cause that passes (another request holds the caps file's lock) and causes that do not
  (a profile whose state folder cannot be resolved, a `.gate` folder or caps file that is a link:
  browser_key.sh:563, 570 and 578 and its gate_caps); a word of their own for the lasting ones would
  let meaning.ts say ask-lead for them.
- **The sign-in cases.** rules.json's 11 cases are single lines; hpcworker's own
  test_adapters.py:152-182 has 12, among them the multi-line text Claude Code 2.1.289 prints. No case
  for `apiProvider` null, empty or not a string, where the rule's text (other) and
  `hpcw_claude_signin` (subscription) disagree; none for a key with a space before its colon, noise
  around the JSON, JSON that is not an object, `loggedIn` as the string "true", or a repeated key.
- **The credential list** is the 15 names; section 6.4's 33 are not in the export yet (step 8).
- **The patterns themselves.** hpcworker's schemacheck.py applies them with Python's `re.search`,
  where `$` also matches before a final newline, so its own test passes a link or a time ending in a
  newline that base and any ECMA-262 validator refuse (checked with python3's `re` on the link
  pattern); lines.json's note that its patterns use only what both languages share does not hold
  there. The time pattern also admits impossible times (2026-02-30T12:00:00Z), which base reads as
  unreadable.

beethoven-agents' `registry` export (version 1, a40a71a) does not say that an account's folder is
absolute, the form of `hibernate_until`, that labels and folders are distinct, whether its types or
bee's looser parsing are the rule, or any size bound: accounts.ts follows bee's code for the first
three, the schema for the fourth and desktop's 64 KB for the last. hpcworker's `module-schema` gives
`ssh_host_key` no pattern; sshopts.ts and profile.ts type it by hand, held to each other and to three
fingerprints ssh-keygen 9.6p1 printed.

### 6.2 Versions

A change to anything hpcworker publishes (bin/, lib/, jobs/, profiles/) is a new framework version,
because deploy_shared.sh refuses to republish vN with different files unless given `--replace`
(:114-118). So:

- PR #3 changes bin/hpcworker and the adapters while VERSION stays 17 (`git diff 20e2e97 f0b949b`).
  It merged at 21:52Z (5492d4d) still at 17. If v17 is already on the lab's copy, a follow-up raises
  it to 18 before main is deployed. Which version is deployed is not yet measured.
- Within `v:1`, changes are additive only: fields are added, never renamed, removed or retyped, and
  a new failure code reads as "other" in an older client. Anything else is `v:2`, changed in both
  repositories together.

### 6.3 V11 and V12 texts

- **The helper wire table stays in hpcworker's V12 for now.** ed94b6b makes hpcworker's V12
  byte-identical with the browser's 15.0.0 copy (cmp). It rode PR #3 as 86caaa2, merged at 21:52Z,
  so hpcworker main's V12 equals d6db850's (cmp). Moving the table to the browser edition, if
  wanted, happens later, in both repositories together.
- **V11's text lags its own code.** V11_CONTRACT.md:722 says both URL fields hold the environment
  link "as framework 9", and R5 (:773) requires `environment_url`; framework 14 writes the printed
  link as `session_url` and reads it first (README.md:106-113). The fix lands in hpcworker and in
  the browser's byte-identical V11 copy.

### 6.4 The one credential list

The lists disagreed on 2026-10-04. hpcworker's template removes 15 credential and provider names
(worker.sbatch.tpl:215-217). bee's `CREDENTIAL_VARS` removes 27 (b7b8650 accounts.py:87-101; the
same 27 at beethoven-agents 0de7913, src/beethoven_agents/bee/accounts.py:87-101): it has 18 names
hpcworker lacks, such as `ANTHROPIC_FOUNDRY_API_KEY`, `AWS_BEARER_TOKEN_BEDROCK` and
`ANTHROPIC_BEDROCK_BASE_URL`, and lacks 6 that hpcworker has, such as `CLAUDE_CODE_USE_GATEWAY`.
The one exact list is the union, 33 names (recomputed here from the two lists).
At beethoven-agents a40a71a, which step 9 read, bee's `CREDENTIAL_VARS`
(src/beethoven_agents/bee/accounts.py:90-106) already holds those 33, hpcworker's 15 among them;
only hpcworker's template, its command and its rules.json are still at 15. So step 8, hpcworker
adopting the 33 as a framework bump, is the only step left; base's strip.ts is then that list, one
name per line. hpcworker's `contract` export carries its list (`rules.json`,
`credential_variables`), and the standard's rule 4 asks a consumer to test a list it types by hand
equal to the export, which is one more reason hpcworker adopts the union first.
Desktop's all-secrets net (ssh.ts:156) stays in desktop. VS Code exports `GITHUB_TOKEN`,
`GH_TOKEN` and `HF_TOKEN` on purpose (services.ts:49-75), and a token-shaped net would strip them.
At step 9 strip.ts is rules.json's 15 names, held equal to the export name by name and in order, with
its two Remote Control names on request; it becomes the 33 when hpcworker's export carries them.

### 6.5 FRAMEWORK_MIN and link order

**FRAMEWORK_MIN, reconciled with "never called outdated" (hpcworker CLAUDE.md:178-179).** Base
exports FRAMEWORK_MIN for its tests and for the lab-lead section of each edition's diagnostics,
where the two numbers are stated as a fact. No student-facing text calls the lab's copy outdated,
and no edition replaces it; an older copy still parses, because changes within `v:1` are additive.
The browser's `FRAMEWORK_CONNECT_VERSION = 10` (contract.ts:102) is referenced nowhere and goes.
This is D6. Built at step 9 as 17 (gate.ts): framework 10 brought connect's step lines, progress.log
and `worker status --json`, 11 the gate, 17 the codes signin-billed and signin-method. Nothing
status.ts, run.ts or links.ts reads was first written after framework 14, which brought the session
link (`git log -S` at hpcworker 3b22e70); framework 18's commit names the queue report, the composed
profiles and the vectors, none of which base reads from the grid.

**Link order is a product choice, not drift.** Desktop opens `environment_url` first on purpose
(contract.ts:153, "a new session can start there"). The browser offers both: Open is session first,
New session is the environment link (facts.ts:114-128). run.ts exports both; D7 settles desktop's.
Built at step 9: `openLinkOf` takes the session link first and `newSessionLinkOf` only an environment
link; both read connection.json before status.json, as facts.ts does, and both pass over a file R1
calls stale. hpcworker's own `Open in Claude:` line reads status.json only, so where the two files
disagree base can give another link than the one hpcworker prints.

## 7. The VS Code move onto hpcworker

**What grid scripts 8 do that hpcworker does not:**

| Grid scripts 8 | Where (aa44696) | hpcworker | Proposal |
|---|---|---|---|
| Named workers; phone hosting on any one of them (`phone on` clears the others) | grid/beethoven:334-410, 859-888 | Every worker is a Remote Control host and always on | VS Code drops phone.js. Open in Claude reads status. |
| `claude -p` queue: send, ask, wait and result; `--stream`; a relay | :424-470; wait sleeps 0.5 s on the login node (:449); relay loop every 250 ms (:615) | None, and it must not have one: hpcworker is bash 4.2 and Python 3.6, and the launcher does not run `claude -p` (beethoven-agents CLAUDE.md:15-16) | D1 |
| Per-request permission mode including bypassPermissions; model; max turns; allowed tools; append prompt | beethovend.js:298-305 | connect allows default, acceptEdits or plan only (bin/hpcworker:1652) | These go with the queue, `bypassPermissions` included: D2 is keep (greg, 2026-10-05 00:28Z, against the recommendation). hpcworker still refuses it, so the helper keeps grid scripts 9's safety, and a run in that mode must never hold a credential variable. |
| `--concurrency` | :339 | `--capacity` for Remote Control sessions | Map it to capacity. Queue concurrency goes with the queue. |
| Container library with GPU images; `--container`; `library publish` | :87-110 | One image from the profile; no `--gpus` | D3 |
| GitHub and Hugging Face tokens: secrets.env, `verify-tokens` from the login node, loaded into `claude -p` | :1076-1089; beethovend.js `secretsEnv` | None | D4 |
| `diag --repair` finding C&IT's VS Code sysroot | :893-906 | None | Stays VS Code's. A static profile key would go stale when C&IT moves it. |
| Grid-side licence check | grid/license.js | None | D5 |
| Access by held jobs; `access admin`; `access init` | :762-858 | grid_access.sh and the access service | VS Code drops these. Section 8 imports the grid-only approvals. |

**Gate, not raw lines.** VS Code starts, watches and stops workers through the gate, sending
desktop's exact lines from gate.ts over its own OpenSSH. Consequences: the caps are per account and
shared with the browser, 3 worker names in 7 days and 12 connects an hour (browser_key.sh:360-362;
how many VS Code students keep more names is not yet measured). The browser key's expiry check runs
on every call (:548), so at a site with `browser_key_days` one VS Code call can remove the browser's
expired key and answer `HPCW-KEY expired` (exit 125); VS Code retries once, and wayne.json has no
expiry. connect always runs with `--login never` (:582), so VS Code signs in only through
`hpcworker claude login` in a VS Code terminal. Through the gate, `status` asks the scheduler at most
once a minute (`GATE_POLL_FLOOR`, browser_key.sh:40). Raw lines remain only for `hpcworker install
--shared`, the terminal sign-in, and the queue helper if D1 keeps it.

**Students on grid scripts 8.** 7.0.0 shows one notice with a "Move my worker" button. On the
click, in order:

1. `beethoven worker list --json`; for each worker with phone hosting on, `beethoven phone off
   --worker <name>`; then `beethoven worker stop --name <name>` for every worker, not only `default`.
2. Write grid scripts 9's `beethoven` over our own `~/.beethoven/bin/beethoven`, for a student who
   goes from 4.0.0 straight to 7.0.0.
3. Never touch `~/.beethoven/claude`, `accounts/`, `engine/`, `projects/`, `secrets.env`, the
   workspaces or the bashrc block.
4. `hpcworker install --shared <shared_install> --profile wayne`, then connect through the gate.

The sign-in stays, because wayne.json's `claude_config_dir` is `$HOME/.beethoven/claude`. Without
the click, the old workers run to their wall time and get no new work. Whether a stopped worker's
`--requeue` job can still restart is not yet measured.

**The transcripts link.** Grid scripts 8 replaced `~/.beethoven/claude/projects` with a link to
`~/.beethoven/projects`, on `diag --repair` and in the daemon (grid/beethoven:476-487 and 974;
beethovend.js:448-467). The sign-in folder is hpcworker's `claude_config_dir`, so every hpcworker
Remote Control transcript then lands under `~/.beethoven/projects`, on the Panasas home with its
soft quota, not under `shared_state_dir`. Recommendation: leave the link alone (moving it would
change the sign-in folder), have hpcworker's diag report it as a fact, and measure the home's use.
Whether the engine's read-only transcript hand-off can bind a path through that link is not yet
measured (probe M13).

## 8. Safety first: grid scripts 9, before VS Code 5.0.0 is built

One VS Code pull request, independent of base. Done: grid scripts 9 is on main as 4fe5ffd, with its
third review e20c814 (pull request #10, merged as e342c7f), and grid scripts 10 (f7f012b, 92a032a;
pull request #15, merged as e7526f9) followed. The items below are the plan as it was written; step
9 did not check each against that code. Whether 5.0.0 is published is not yet measured (section 10,
row 4).

1. **`uninstall` removes only what install created**: bin/, log/, workers/, sessions/, config.env,
   READY, the bashrc block and the `~/.ashley` link; never claude/, accounts/, engine/, projects/,
   secrets.env or the workspace root; `--purge-root` goes. Today it removes the whole folder
   (grid/beethoven:1090-1106). Reset's remote call is already refused by the terminal check
   (:47-51; shell.ts:143 sends no `-t`), so today only a person typing it can delete.
2. **`claude forget` always refuses.** Today it runs `rm -rf $CLAUDE_HOME` (:599-602).
3. **Every sign-in check refuses an `apiKeySource`**, as common.sh:236-252 does: wizard.ts:533-535,
   beethovend.js:176, phone.js:40 and grid/beethoven:550.
4. **The five hand copies take hpcworker's list**: services.ts:21, beethovend.js:52, phone.js:35,
   grid/beethoven:525 and login_relay.sh:38, 9 names each today. A unit test checks all five equal
   the list written in the test, with the hpcworker commit it came from.
5. **`access init` (:768-778) and `library publish` (:105) stop closing `shared/` and
   `shared/beethoven` to other students.** Only `shared/access` stays closed.
6. **Small fixes in the same PR**: an exact link check before `openExternal` (extension.ts:730);
   phone status at the 60 s floor instead of 2.5 s (:701). The third fix, `@types/vscode` back to
   1.100.0 (on 80f79db `vsce package` refused: "@types/vscode 1.138.0 greater than engines.vscode
   ^1.100.0"), is already on main: a199f19, merged as cc76efd, with Dependabot told to leave the
   types alone (D9).

**The access roster gap.**

- **The roster command is missing.** tools/grid_access.sh keeps the volume root's list equal to
  `node <checkout>/tools/intake/admin.mjs roster` (:15-18, 369-374), but beethoven-vscode's
  admin.mjs has no `roster` command on origin/main (80f79db or cc76efd) or aa44696 (git grep; usage
  at admin.mjs:128). hpcworker's docs/guides/LAB_LEAD.md:285 and 300 document it, so it exists
  only on your laptop or not at all; not established.
- **The service is not the gap**: its "extension" grant already covers both editions
  (tools/intake/worker.js:1131-1133; tools/intake/README.md:182-185). **Grid-only approvals are**:
  students approved only with `beethoven access admin approve` have status files under `shared/access/status` (approved_users,
  :727), which the service never sees.
- **Fix by re-approving, not widening**: list those students, re-approve each through the service
  (`admin.mjs add <id> "<name>"`, both grants, admin.mjs:7), then run grid_access.sh with
  `--dry-run`. Do not widen roster to the lab grant.
- **Until then, hold four things**: do not apply grid_access.sh on a schedule (whether the task is
  active is not yet measured), and do not run `access init`, `library publish` or `access admin
  approve`.

## 9. What base can and cannot do for "add a feature to all of them"

**It can.** One change in base reaches all three editions when the change is the meaning of
something the grid writes or a rule: a new failure code and its next step, a link or staleness
rule, a new way Claude Code reports a sign-in, one more variable to strip or a redaction pattern, a
fix to the diagnostics engine. On 2026-10-04 the same bugs sat in two or three copies: the
apiKeySource gap (closed in every edition by the step 9 refs: the browser's contract.ts:557 and VS
Code's wizard.ts:547 refuse it, and desktop reads no sign-in answer), desktop's "other" codes, the
HF-token redaction.

**It cannot** touch anything a student sees (the browser's panel, desktop's MCP text, VS Code's tree
and commands), any platform API, the three SSH stacks, packaging and store review, or the
agreements. Base was estimated at about 550 lines; as built at step 9 it is 2,639, 1,493 of them
code, against 37,141 lines of client code (counted on 2026-10-04).

**A feature in practice.** Showing when a spent window resets takes one hpcworker change, one base
change (parse and meaning), then three small UI changes. Base saves writing the parse three times
and stops the copies drifting; it does not save the three UI changes. VS Code shares the contract
only after 7.0.0.

## 10. Migration order

Each step is one pull request. **Hand** marks what you do yourself.

| # | Repository | Pull request | Hand |
|---|---|---|---|
| 1 | hpcworker | PR #3: queue report. Merged at 21:52Z (5492d4d): f0b949b answers the 20 findings, 6171be9 nine more, 86caaa2 is ed94b6b. VERSION is still 17, so if v17 is deployed a follow-up sets it to 18 first. | Deploy. Run `hpcworker queue report --days 30 --limits`. |
| 2 | beethoven-extension | `claude/project-thread-fx3wkp` at d6db850: c9e7e56, de357e3, 2ee899e and 15.0.0, plus wip/mac-W and wip/mac-R, which origin's branch already merges at 9aa1171. 15.0.0 touches core (bridge.ts, model.ts, steps.ts, terms.ts) and V12. Step 1, which it waited on, is merged. | Merge. Release 15.0.0 from the Mac. |
| 3 | beethoven-vscode | `beethoven.account` (aa44696, with the 22 findings from the staging patch), rebased on main (cc76efd). Done: on main as 2012d79, 5003d5d and 5db2019, before e7526f9. Whether main typechecks under TS 7.0.2 is section 14's. | Merged. |
| 4 | beethoven-vscode | Grid scripts 9 (section 8, items 1 to 6). Done: on main as 4fe5ffd, with its third review e20c814 (pull request #10, merged as e342c7f), before e7526f9; grid scripts 10 (f7f012b, 92a032a) is on top. Main's 5.0.0 was set at 710d74e, before both. | Merged. Whether 5.0.0 is published, and with which grid scripts, is not yet measured. |
| 5 | beethoven-vscode | `admin.mjs roster`, if your laptop's checkout lacks it. | Re-approve grid-only students. Run grid_access.sh `--dry-run`. |
| 6 | beethoven-base | PR #1, the skeleton, rebuilt to the interface standard on 2026-10-08: CLAUDE.md; package.json with dev dependencies only (typescript 5.9.3, typescript 7.0.2 through an npm alias, vitest 5.0.2); three typecheck lanes (Bundler with DOM; NodeNext; Node16 CommonJS); tools/posture.mjs with the top-level-literal rule and tools/exports.mjs; `interface/INTERFACE.json` (no export, no import yet), `interface/pull.sh` and the boundary test; ci.yml with the one job `gate`; the kit (pre-push, automerge.yml, rulesets.yml, `.github/rulesets/main.json`). | Tick Allow auto-merge. Create the `rulesets` environment. Merge by hand. |
| 7 | hpcworker | The vectors and their drift test: done as the `contract` export (section 6.1). The V11:722 and R5 text fix and the CLAUDE.md :58 and :298-303 lines: not re-checked here. No framework change. | Merge. |
| 8 | hpcworker | Framework N+1: the 33-name strip list in worker.sbatch.tpl and clean_env_args (bin/hpcworker:342-346). Vectors regenerated. | Merge. Deploy. |
| 9 | beethoven-base | Built in this pull request (2026-10-08): the 12 modules after `profile.ts` (PR #2), with a test each; the exports `desktop`, `browser` and `vscode` (kind `files`, version 1, one path per module under `src/`) in `interface/INTERFACE.json`; hpcworker's `contract` export and beethoven-agents' `registry` export (version 1 each) taken into `test/hpcworker/` and `test/registry/` with `interface/pull.sh` (a3379ae), and the parsers' tests against them; the placeholder `src/index.ts` and its test removed. What the export does not cover: section 6.1. What changes for each edition: section 15. | Merge. |
| 10 | beethoven-desktop | 2.0.0: base's `desktop` export into `src/base` with desktop's own `interface/pull.sh`, an import in its `INTERFACE.json` checked by its boundary test; contract.ts, redact.ts, profile.ts and the account parsing use base; one floor clock per class; stale at 3 minutes; link order per D7; CLAUDE.md :42-43, 89, 101. | Merge. Pack. |
| 11 | beethoven-extension | 16.0.0, on top of 15.0.0: base's `browser` export into `extension/src/base` with the extension's own `interface/pull.sh`, checked by its boundary test; the bundle scan for key names; the profile check fails instead of switching itself off (hygiene.test.ts:239-245; sync-profiles.mjs:26-30 only warns); the V11 text copy; CLAUDE.md :58, 329-334, 339. | Merge. Release. |
| 12 | beethoven-extension | Adopt the kit. | Tick Allow auto-merge. Create the environment. Merge by hand. |
| 13 | beethoven-vscode | 6.0.0, laptop side: links, signin, strip, redact, diagnostics, accounts and sshopts from base's `vscode` export, taken with VS Code's own `interface/pull.sh` (VS Code adopts the interface standard first); a CI workflow (typecheck, unit tests with the boundary test, `vsce package`); the kit. | Merge by hand. Publish. |
| 14 | beethoven-base | The lag report, which reads each edition's `interface/INTERFACE.json` (section 4). No propagate workflow in base: if D8 ever says token, propagation is each edition's own workflow (section 5). | Create `BASE_REPORT_TOKEN`. |
| 15 | hpcworker | Framework N+2, only for what D3 and D4 add. Possibly nothing. | Deploy. |
| 16 | beethoven-vscode | 7.0.0 onto hpcworker (section 7); the queue per D1; texts at TERMS_VERSION 8 or later (main has 7). | Publish. |
| 17 | beethoven-vscode | Remove grid/, or keep only the queue helper per D1, once 7.0.0 is on the Marketplace. | Merge. |

## 11. Points not taken

- **c1, beethoven-qa cannot be checked.** It can now: research origin/main 8dd5be2 carries
  `vendor/beethoven-qa` and runs `vendor-check`. The critique read b7b8650, from before 95792e6.
- **c1, desktop should build from `files: ["src/index.ts"]` with per-file allowances.** Not needed:
  the per-edition lists (now exports) pass desktop's scan unchanged, as source and as emitted JS
  (measured on the prototype, which is not kept).
- **c1, an environment gives "greg as required reviewer".** That depends on the plan; GitHub
  documents required reviewers on private repositories as Enterprise-only. (The `v*` tag rule this
  answer relied on went with the release tags on 2026-10-08; section 5.)
- **c1, Vite keeps top-level calls such as `new RegExp`.** Refined, not rejected: Vite 8.3.1 dropped
  `new RegExp`, `new Set` and some local calls, and kept `.map`, `.join`, `Object.freeze` and a local
  call that builds a string or a RegExp from its argument. The rule stands.
- **c1, `env set` must refuse credential names.** Right if it is built; D4 recommends not building it.
- **c2, the apiKeySource rule is vacuous, so drop it.** Vacuous in the browser, but VS Code's laptop
  check (wizard.ts:533-535; at e7526f9 :534-547, which refuses apiKeySource itself) is a real
  consumer, so signin.ts stays. It was estimated at 11 lines; as built at step 9 it is 92, 37 of
  them code.
- **c2, VS Code is already at TERMS_VERSION 7.** Then only on aa44696, when main had 6 (terms.ts:23);
  main has 7 since grid scripts 9 (4fe5ffd, on main at e7526f9). The conclusion holds: the move takes
  it to 8 or later.
- **c2, about 850 lines.** Recounted at about 550: the terms core, floors and sentences are out of base.
- **First design, `site.ts` and `names.ts`.** Dropped, as critique 2 showed.

## 12. Decision record

greg decided on 2026-10-05 at 00:28Z: "All of the decisions look good except for d2." D1 and D3 to
D8 are therefore taken as recommended; D2 is decided against the recommendation (keep); D9 was
already settled.

| # | Question | Options | Recommendation | Decided |
|---|---|---|---|---|
| D1 | Where does VS Code's `claude -p` queue go? | **helper** (a small VS Code-only grid helper with its own job and grid scripts 9's safety) / **engine** (beethoven-agents' step runner, not built yet) / **drop** (ask, send and result go) | **helper** now, **engine** when it exists. It is VS Code's one distinctive feature, and hpcworker must not run it. | **helper** now, **engine** when it exists, as recommended (greg, 2026-10-05 00:28Z). |
| D2 | Keep `bypassPermissions` in the queue? | keep / drop | **drop**. hpcworker refuses it, and it is the riskiest mode alongside tokens in the environment. | **keep**, against the recommendation (greg, 2026-10-05 00:28Z): `bypassPermissions` stays in VS Code's `claude -p` queue helper. hpcworker still refuses it. The helper therefore keeps grid scripts 9's safety, and a run in that mode must never hold a credential variable. |
| D3 | GPU workers and image choice in hpcworker? | gain (`--gpus` and a lab image list in the profile) / drop | **drop**, unless a student uses GPU workers today (not yet measured). | **drop** unless a student uses GPU workers, as recommended (greg, 2026-10-05 00:28Z). |
| D4 | GitHub and Hugging Face tokens on the grid? | helper (secrets.env stays with the queue) / hpcworker `env set` (with a per-worker opt-in, refusing the 33 names) / drop | **helper**. Nothing new reaches browser-started workers. | **helper**, as recommended (greg, 2026-10-05 00:28Z). |
| D5 | The grid-side licence check at 7.0.0? | drop (the laptop gate stays) / keep | **drop** | **drop**, as recommended (greg, 2026-10-05 00:28Z). |
| D6 | FRAMEWORK_MIN? | lead-only (a fact in the lead's diagnostics; the rule stands) / notice (change the rule so students are told) | **lead-only** | **lead-only**, as recommended (greg, 2026-10-05 00:28Z). |
| D7 | Desktop's link order? | session / environment / both | **both**: Open goes to the session, as the browser does; New session goes to the environment. | **both**, as recommended (greg, 2026-10-05 00:28Z). |
| D8 | Propagation credential? | none (sessions open the pull requests) / token / app | **none** for now | **none** for now, as recommended (greg, 2026-10-05 00:28Z). |
| D9 | VS Code `@types/vscode` against `engines`? | pin (back to 1.100.0) / raise (engines to ^1.138.0, which drops older VS Code) | **pin**. Settled: a199f19 records your choice of 21:10Z and is on main. | **pin**, settled before this record (a199f19, greg's choice of 2026-10-04 21:10Z). |

## 13. Risks

- **An edition stuck on an old base brings drift back.** The lag report makes it visible only once
  the edition's import names an older export version; a copy taken at an old commit of the same
  version is invisible to it, because the commit is only in the edition's private `ORIGIN`. It does
  not prevent either.
- **No downgrade refusal.** The first skeleton's check refused an `ORIGIN` older than the one on the
  pull request's base branch. Under the standard an edition's boundary test compares the copy with
  its own `ORIGIN` only, so a rebase that takes an older copy and its `ORIGIN` together passes, and
  the edition compiles the older modules without a word. The lag report shows it only when the older
  copy is also an older export version in the edition's `interface/INTERFACE.json`. A test in each
  edition that compares its `ORIGIN` with the one on its base branch would close it; none is designed.
- **The copy checks itself.** A hand edit that also rewrites `ORIGIN`'s `sha256` lines passes the
  edition's boundary test. `check --source` closed that from base's checkout. Now only desktop's
  `bash interface/pull.sh --pinned src/base` refuses it; the browser's has no refusing form
  (`--at-origin` writes the copy again, and only `git diff` shows the edit); VS Code has no puller
  yet. A person runs each with their own sign-in, and no CI can.
- **A pull writes through a link.** Desktop's and the browser's pullers create folders, redirect and
  move through a link anywhere in the copy folder's path (read at 9ce98bb and ae11a00, not run here),
  so a link there, by hand or committed, takes a pull outside the edition's repository; the old vendor
  command refused one. Base's own puller refuses one before it writes, and base's boundary test fails
  on a tracked link that leaves the repository. The editions' pullers and tests are theirs to change.
- **A pull writes over an uncommitted edit.** An ordinary pull (not desktop's `--pinned`) replaces a
  copied file that was edited and not committed, without a word, in every puller, base's own
  included; the old vendor command refused a file whose change neither `ORIGIN` nor `HEAD` held.
- **An export's version is a promise kept by people.** Nothing checks that a change an edition must
  act on raised the export's version; the edition's compiler and conformance tests are what catch a
  missed raise, in the pull request that takes the copy.
- **The writer (bash and Python) and the parsers (TypeScript) stay two implementations.** Drift is
  caught only as far as the vectors reach; section 6.1 lists where they do not reach yet, and
  hpcworker's own schema check reads its patterns more loosely than they are written.
- **Shared fixes change what students see**: desktop will warn at 3 minutes, HF tokens and the
  whole of a private key are redacted. Each edition's pull request says so, and its version goes
  up. Section 15 lists every such change step 9 found, per edition.
- **Base's judgment stands where the contract is silent** (section 15.4): a next step for a read
  failure, `apiProvider` null, the terminal codes a line loses. Every edition then gives the same
  answer, right or wrong, until hpcworker's contract settles it.
- **The gate caps VS Code students at 3 worker names in 7 days,** shared with their browser.
- **Grid scripts 8 stay on the grid** for any account that never updates, and a person can still run
  their `uninstall` there. Step 4 and the move narrow that window; they cannot close it.
- **VS Code's main has no CI, and dependabot merges unchecked.** 80f79db did not package until
  a199f19 put the types back; that commit records `npm run package` passing, not re-run here.
- **Two access models write ACLs on one volume** until 7.0.0.
- **`state/repos/beethoven-base.md` (21:24Z) still differs from this design.** It no longer records
  the fetch route (:15), but :38 records moving the queue into hpcworker as V13 as the
  recommendation, which D1 here rules out, and :16 leaves the propagate secret's home unsettled.
  That file's owner updates it.
- **Environment rules on private repositories depend on the plan**, and on GitHub Free private
  repositories have no environment secrets at all.

## 14. Not yet measured

- Which framework version the lab's shared copy runs now.
- Whether `hpcworker queue report` and the 33-name list behave on Wayne State's Slurm and image.
- Whether VS Code main e7526f9, where the account work is merged, typechecks under TypeScript 7.0.2
  (aa44696 alone did).
- How many VS Code students use ask and send, GPU workers, or more than three worker names.
- Whether a stopped grid scripts 8 worker can come back through `--requeue`.
- Home use under `~/.beethoven/projects`, and whether a transcript can be bound through that link (M13).
- Whether `admin.mjs roster` exists on your laptop.
- Whether grid_access.sh runs on a schedule now.
- The organisation's GitHub plan, which decides environment secrets, deployment branches and
  required reviewers on private repositories.
- Whether the browser's hygiene walk and each edition's bundler pass over an `ORIGIN` file inside the
  edition's source folder.
- Whether each edition's own suite runs the modules it takes, and what its bundle keeps of them
  (steps 10, 11 and 13); at step 9 only base's lanes, each export compiled alone and the editions'
  scans rewritten from their text ran.
- On Windows: whether Node's spawn lets a credential variable written in another case through after
  base removes the upper-case name without `anyCase`, and whether ssh, Windows' OpenSSH 9.5 or Linux's
  9.6, reads a quoted known_hosts path holding a space as one file.
- Whether a site that uses Kerberos needs the GSSAPI sign-in sshopts.ts turns off.
- Whether an ssh older than 9.6 (Windows 10's own 7.7 or 8.1, Ubuntu 20.04's 8.2) takes
  `GlobalKnownHostsFile` set to the pinned file and `VerifyHostKeyDNS=no` as 9.6p1 does, and closes
  the system-wide file with them; measured only with OpenSSH 9.6p1 against a local sshd.
- The Hugging Face token alphabet and the GitHub token lengths in redact.ts, taken from gitleaks'
  rules as recalled and not checked against either company's documentation.
- Whether any real accounts.json holds a value bee coerced (an order of "1"); bee writes integers
  and booleans itself, so only a hand edit would.
- How long a line reaches VS Code's diagReport `scrub` before its 400-character cut: its e-mail
  pattern takes 381 ms on 16 KB with no `@` (measured on a copy of the pattern).

Measured since this list was first written: `interface/pull.sh` took base's imports from GitHub on
2026-10-08, and `--pinned --all` took back the same bytes; hpcworker's `contract` vectors do not
cover every case section 6.1 first asked for, and section 6.1 lists what they lack.

## 15. What changes for each edition when it takes base

Found at step 9, with the editions read at desktop 9ce98bb, browser ae11a00 and VS Code e7526f9. Each
edition's pull request (steps 10, 11 and 13) says what changes for its students, and changes its own
code where a name, a shape or a word moved. Where base follows the contract over an edition, that
edition's behaviour changes; where the editions differed from each other, base took the stricter
side, and the more lenient edition's behaviour changes.

### 15.1 beethoven-desktop (step 10)

What a student sees change:

- **Stale at three minutes.** run.ts says stale once the heartbeat is over 180 s old; desktop warns
  after 5 whole minutes (tools.ts:104-105 and 122-123, `QUIET_MIN`), timed with `Date.parse`. Its
  "has not written its status" line comes from about 3 minutes, and an empty or garbled
  `updated_at`, which desktop read as 0 minutes quiet, reads as stale.
- **Which link opens (D7).** Desktop's `linkOf` (contract.ts:207-219) takes `environment_url` first,
  reads status.json before connection.json and applies no R1; runs.ts:45 does the same. With
  `openLinkOf`, `open_in_claude` and the "Claude link:" line give the session link of a worker that
  resumed a session, and a connection.json left by an earlier job gives no link while the new job is
  queued. `newSessionLinkOf(s) ?? openLinkOf(s)` gives the environment link first, as desktop did,
  for a New session action.
- **status.json read field by field.** `parseStatusJson` (contract.ts:193-205) cast the JSON as it
  came. A bad link, a state, needs, consent source or stop reason outside the schema, a run that is
  not a worker name (`../x`) or a pid written as text now reads as absent and is named in `refused`;
  `describeStatus` shows "unknown" where it showed an unknown raw state word.
- **A status line whose own `run` is no worker name.** Base reads the whole line as no status when
  its top-level `run` does not match worker-status.schema.json's name pattern (`../x`, or a name
  over 32 characters), where `parseStatusJson` (contract.ts:198) took any string; a `run` inside
  status.json is only refused, as above.
- **Gate answers counted only with their exit status.** Given the exit status, base counts refused
  with 126, a cap with 123, the key's expiry with 125, missing with 1, not-plain and too-large with
  3 (lines.json). A refusal line with another status falls through to the verb's own reader and its
  generic message. This takes effect only when desktop passes the status: grid.ts:149 calls
  `gateRefusal(res.stdout)` today, and without the status the line alone counts, as it does now.
- **A copy without the gate.** A lab's copy older than framework 11 answers every gate line with
  `hpcworker: unknown command 'gate' (hpcworker help)` on standard error and exit 1. Given the exit
  status and standard error, `gateRefusal` reads it as `no-gate` and meaning.ts says ask-lead, where
  desktop shows the verb's generic failure today. Desktop's words for it never call the lab's copy
  outdated (D6).
- **Next steps.** Through meaning.ts, `failed restricted` gains a next step (use another worker
  name); read's not-plain and too-large gain "ask your lab lead"; read's missing keeps its meaning
  (the run has not written the file yet).
- **The remote line's folder.** `gateRemoteLine` takes profile.ts's `sharedRootOf`: a shared_install
  of `/a/..`, `/a/./b` or `//a` now throws (desktop placed `/a/..`), and `+` is allowed. Wayne
  State's path is unaffected.
- **Redaction.** `redact` gains the Hugging Face rule, so an `hf_` token of 37 to 39 characters,
  which the 40-character rule missed, shows [redacted]; a GitHub token followed by `-` or `_` loses
  only the token. `redactCredentials`, on workspace files, gains all three new rules (`hf_`, `ghp_`,
  `gho_`, `ghu_`, `ghs_`, `ghr_` and `github_pat_`), so a student's file holding such a token shows
  [redacted]. `redact` now also takes every shape `redactCredentials` takes: a private-key block
  whole (the 40-character rule stopped at each `+` and `/`, so about half of a printed key showed), a
  short value of an `ANTHROPIC_` or `CLAUDE_CODE_` key or token variable, and a JSON credential field
  with a short value (`"refreshToken": "..."`, a password); output that held one shows [redacted]
  there. Since the second review both functions also take a JSON field named `token` or `secret`,
  an `ANTHROPIC_` or `CLAUDE_CODE_` key or token variable written as a quoted JSON key (the `env`
  block of Claude Code's settings.json, an .mcp.json), and the credential after `Authorization:
  Basic`, of which `redact` hid only the word Basic and `redactCredentials` nothing; a student's file
  or output that held one shows [redacted] there, and so does a value under a field named `token` or
  `secret` that is no credential. Each shows [redacted] in a tool's structured result only once
  `result()` redacts it string by string (below).
- **Line cleaning.** `cleanLine` also strips a charset designation (ESC ( B, which `tput sgr0`
  prints), as hpcworker's and the browser's cleaners do; a step or status line glued after one read
  as text, so a connect ended without its result. It also strips a NUL first, as `hpcw_strip_codes`
  does.
- **ssh.** `GSSAPIAuthentication=no` on every ssh (no change at Wayne State; not yet measured at a
  Kerberos site); `ConnectTimeout=20` on the student's sign-in too, which times the connection and
  key exchange, never the password and code prompts. A known_hosts path holding white space, a
  quote, `%`, `$`, `=` or two backslashes in a row is refused before ssh runs. Today ssh splits such
  a path (`C:\Users\John Smith\...`: measured with `ssh -G`, OpenSSH 9.6p1), pins nothing and fails
  with a host-key error; after adoption the student gets desktop's refusal instead, and still no
  connection, so desktop needs a known_hosts location without such characters (section 15.4). Every
  ssh also sets `GlobalKnownHostsFile` to the pinned file and `VerifyHostKeyDNS=no`, and, when desktop
  passes `opensshVersion` (the line `ssh -V` printed) of 8.5 or later, `KnownHostsCommand=none`: a
  key in the computer's system-wide known_hosts, in DNS, or from a command the student's own ssh
  configuration names is no longer accepted beside the pin (section 15.4). Desktop passes the
  version; without it a `KnownHostsCommand` stays open on an 8.5 or later ssh. Every ssh also sets
  `NoHostAuthenticationForLocalhost=no`, so a `yes` in the student's configuration no longer skips
  the check where the grid's name reaches a loopback address (a tunnel). Desktop passes its route's
  control path (`cm-%C` in its own folder) as `controlPath`, which base names before desktop's own
  `ControlPath` (the same value), and keeps `ControlMaster` and `ControlPersist`. A control path
  holding white space, a quote, `$`, `=` or two backslashes in a row is refused as the known_hosts
  path is, so a home folder whose name has a space needs another folder for the socket. On the
  Windows-native route, which shares nothing (`mux` false), desktop passes none and base adds
  `ControlPath=none` and `ControlMaster=no`, so a master another ssh opened never carries a call;
  whether Windows' own OpenSSH accepts the two words is not yet measured.
- **The account list.** "Not JSON" and "not an account list" both read as no list, so desktop can
  show one sentence where it had two; every reason is returned and a label or folder listed twice is
  found during the walk, so the first reason shown can change; a folder with a `..` step or a
  control character, or a value bee would coerce (an order of "1", enabled "no"), refuses the whole
  list. Desktop's pointer, "bee account list, in your own terminal, says what is wrong"
  (accounts.ts:193, `beeToo`), is given only when `beeRefusesToo(refused)` is true: for a refusal base
  alone makes (such a folder, a coerced value, a resting time bee's `fromisoformat` takes, a list over
  64 KB), bee's own list would name nothing wrong, so desktop says nothing of bee there.

What its code changes, with nothing a student sees:

- `Step` (`{kind, changed, kept, runDir: ''}`) becomes `{id, how, runDir}` with `runDir` absent when
  not printed; `signed-in - -` no longer gives `-` as email and plan. worker_start's structured
  result changes shape; `describeSteps` adapts to keep its sentences.
- `progressLines` returns `{at, text, id?, argument?}`; `worker_log` prints `${at} ${text}` to keep
  its output byte for byte.
- `parseWorkerStatus` (desktop's `parseStatusJson`) and `stoppedLine` return undefined where they
  returned null; `parseAccounts`
  returns null for a text that is not JSON or not an object, and every other refusal as codes, each
  with `beeMayTake` where bee might take the value.
- Names desktop's callers change: `StatusJson` becomes `WorkerStatus` and `parseStatusJson`
  `parseWorkerStatus` (status.ts); `GATE_READ_EXIT` becomes `GATE_EXIT` (gate.ts), which also holds
  refused's 126 and a cap's 123; `ENVIRONMENT_URL` and `SESSION_URL` become `ENVIRONMENT_LINK` and
  `SESSION_LINK` (links.ts), and `CLAUDE_CODE_LINK` keeps its name, all three anchored, so a text is
  searched with `linksIn`; `WORKER_NAME_RE` and `SITE_RE` become `GATE_VALUES.gate_name` and
  `GATE_VALUES.site` (gate.ts), the same patterns.
- `result()` (tools.ts:15) redacts a structured value string by string: it walks the value and
  passes each string inside it through `redact`, never `JSON.parse(redact(JSON.stringify(...)))` as
  today. A rule that ends at white space (`\S+`) runs through a closing quote and an unended
  private-key block runs to the end of the text, so the serialised form can throw (mcp.ts:139-142
  turns that into its generic error) or join two strings of a list: with base's rules a failed
  step's sentence or a log line ending in a key variable, or a lone `-----BEGIN ... PRIVATE KEY-----`,
  does so, as `token=` does with desktop's own rules today. redact.ts says it is for text only, and
  redact.test.ts shows the walk keeping a value's shape.
- `gateCommand`'s connect line takes `permissionMode` where desktop's took `mode`, and an optional
  `installId` (absent, it is written `-`, as desktop writes it today).
- `gateRefusal(stdout)`, which returned `'refused'`, `'limit <word>'`, `'expired'` or null, becomes
  `gateRefusal(stdout, exitStatus, stderr)`, which returns `{kind}` (`refused`, `limit` with `which`,
  `expired`, `no-gate`) or undefined. grid.ts:149 adapts, and passes the exit status and standard
  error, or the exit-status rule and `no-gate` above do not take effect.
- `sshOptions` takes `opensshVersion`, `tool` (`ssh` for every desktop call) and `controlPath` (the
  route's own, when it shares a connection), and its argv gains the options above.
- strip.ts is not in desktop's export. If desktop ever takes it, its scan needs the `STRIP_SITES`
  entry of section 3.
- A resting time before 1970 with a fraction rounds toward zero, as bee's Python does; the 64 KB
  bound counts the UTF-8 of the text handed over, not the file's bytes (equal for valid UTF-8).

### 15.2 beethoven-extension, the browser (step 11)

What a student sees change:

- **A status line after terminal codes reads.** `parseStatusJson` (contract.ts:825-838) takes the
  first line that starts with `{` after `trim()`, cleans nothing, and accepts any JSON with `v` 1;
  base cleans terminal codes and glued keepalives first and needs lines.json's `{"v":1` prefix. A
  status line that follows terminal codes in the portal's shell, or is glued to a keepalive, now
  reads instead of showing no status.
- **A status line whose own `run` is no worker name.** As in desktop (15.1): base reads the whole
  line as no status when its top-level `run` does not match the worker-name pattern, where
  `parseStatusJson` (contract.ts:831) took any string.
- **Line cleaning.** The browser's cleaner strips charset designations (ESC ( B, which `tput sgr0`
  prints) and leaves CSI codes with `:`, `<`, `=` or `>`; desktop's does the opposite. Base strips
  the union of the two and hpcworker's `hpcw_strip_codes`, a NUL among them, so every line the browser reads still
  reads, and a step or gate line glued after such a CSI code now reads too. No vector shows either
  (section 6.1).
- **The heartbeat: no change.** The browser's R12 is facts.ts:346, `stale = liveState && state !==
  'queued' && beat !== undefined && now - beat > STALE_AFTER_MS`, with `beat` from `heartbeatAt`
  (facts.ts:270-277): the later of `updated_at` and the listing's modified time, each moved by the
  grid's clock offset. (`workerLive`, worker.ts:128-138, is called only by test/worker.test.ts.)
  Base's `isStale(updated_at)` would lose the modified time and the offset, so the browser takes
  `isStaleAt(beat, now)`, which has the same threshold (past 180 s), and keeps its `beat !==
  undefined` guard: an absent heartbeat, where the browser has read neither time, stays not stale as
  it is today, though `isStaleAt` alone counts it stale.
- **An unknown consent source.** `consentSourceWords` shows nothing where it showed "recorded".
- **The gate's refusal.** A connect answered `HPCW-GATE refused` ends today as "The grid didn't take
  the request." with [Try again]; meaning.ts gives ask-lead, as desktop already says.
- **A copy without the gate.** `gateOutcome`'s `old-copy` (contract.ts:1232, by `isUnknownVerb` over
  both streams) becomes base's `no-gate`, read from `hpcworker: unknown command 'gate'` on either
  stream with exit 1, and meaning.ts says ask-lead. The browser's three sentences for it (the sign-in
  sheet, the direct channel, `connectProblem`) stay its own and still never call the lab's copy
  outdated (D6). A copy that printed the line with another exit status, which hpcworker's `die` never
  does, is no longer read as old. `isUnknownVerb` stays the browser's for `browser-key` (signin.ts:432),
  a verb base does not read.
- **The key's expiry needs its line.** `gateOutcome` takes exit 125 alone as the key expired and
  reads a cap's line on standard error too; base needs the `HPCW-KEY expired` line and reads the
  gate's lines on standard output only (only read's three failures go to standard error). A bare 125
  no longer marks the key not enrolled: the student sees a generic failure instead of being asked to
  sign in to the grid.
- **Caps.** For `limit names` and `limit hourly` meaning.ts says fix-request and retry-later; the
  browser's "Use GlobalProtect" button is its own, kept if wanted. `watch` and `busy` stay
  retry-later.
- **Show log.** A bare "Online" or "Couldn't start" (no ": ") was read as the event; base keeps them
  in Details, since the writer never prints them. "Couldn't start:" with an empty message was
  dropped; base reads it as an error with an empty argument, so Show log can list one more event.
- **Redaction.** As desktop's `redact`: the `hf_` rule, the GitHub token's boundary, and the
  private-key block, the short key variables and the JSON credential fields (15.1), and the second
  review's three rules: a JSON `token` or `secret` field, a key variable written as a quoted JSON
  key, and an HTTP Basic credential.
- **Diagnostics.** As VS Code's, in 15.3, with the browser's 60 s guard and `fixAction` renamed
  `fix`: a check that answers no verdict fails alone as crashed, where the whole run rejected and no
  report was stored; `skip` and `warn` count only when exactly true, so a check that answers
  `skip: 1` or `warn: 'y'` is read by its `ok` alone, where the browser's engine read it skipped or
  warned (section 15.4).
- **The probe's sign-in check.** `isSubscriptionSignIn` needs `loggedIn` exactly true and reads
  `apiProvider` null as other. hpcworker's probe writes `loggedIn` as a boolean and neither
  `apiProvider` nor `apiKeySource`, so with today's probe the check shows nothing different.
  `signinAnswered` is there if the probe ever needs to tell no answer from not signed in.

What its code changes, with nothing a student sees:

- `isEnvironmentUrl` becomes `isEnvironmentLink`; `ENVIRONMENT_URL` and `SESSION_URL` become
  `ENVIRONMENT_LINK` and `SESSION_LINK`, anchored, so they cannot be spliced into a new RegExp.
- `StatusFile.state` is optional and has no "unknown": the browser maps an absent state to its own;
  `pid` is a number only.
- facts.ts `badLinkOf` (lines 130-134) reads base's `refused` (`status.session_url`,
  `connection.environment_url`), since base drops a bad link before the browser sees it. A "" is
  never in `refused`, in either file, so a worker online whose link is not printed yet still shows
  connecting, as `reportedLinks`' filter of "" (facts.ts:103-105) makes it today, and a resumed
  session's empty environment link is no bad link.
- `claudeLinkOf` and `environmentLinkOf` already use base's order; the rc.log registration stays the
  browser's, as `openLinkOf(run) ?? openLinkOf({ status: run.registration })`. `parseRegistration`
  (contract.ts:1079-1090) finds its links with base's `linksIn`, keeping the last environment link
  and the last link of either form, where it spliced `ENVIRONMENT_URL.source` and
  `CLAUDE_CODE_LINK.source` into global patterns, which base's anchored ones cannot be; no second,
  unanchored copy of the link shape stays in the browser.
- `StepEvent` (`{step, fresh, detail}`) becomes `{id, how, sentence}`; `GateVersion.due` gives null
  for `-`; `FRAMEWORK_CONNECT_VERSION` goes, and `FRAMEWORK_MIN` (17) is a fact for the lab lead
  (D6).
- `startGateConnect` (background.ts) and `connectProblem` (steps.ts) read meaning.ts's next step for
  the gate's refusal and its caps.

### 15.3 beethoven-vscode (step 13)

What a student sees change:

- **The sign-in check.** `localClaudeStatus` (wizard.ts:534) parses only the whole of standard
  output as JSON; base reads past a line printed before or after it, as the worker does. `loggedIn`
  "true" or 1, `authMethod` `["claude.ai"]` and `apiProvider` null, which VS Code counted as a
  subscription, are not one in base; an answer wrapped in an array, which VS Code did not count, is
  one, as `hpcw_claude_signin` reads it. Claude Code is not known to print any of these. VS Code
  hands base the text standard output printed, not its parse: a parse keeps the last of a repeated
  key, where the worker reads the first (base reads a parsed value by printing it again, so a nested
  key counts either way). grid/phone.js and grid/beethoven are not extension code and do not take
  base. Where the verdict is `none`, `signinAnswered` on the same text says whether Claude Code
  answered at all, so VS Code keeps "claude auth status did not answer" for an empty output, an
  error or a text with no `"loggedIn":`, and says "not signed in" only for an answer that says so.
  The email and plan VS Code shows beside a subscription stay its own, since base reads only
  rules.json's four keys; its `JSON.parse` of the whole output (wizard.ts:539) fails on the noisy
  text base now reads, so on such output the student sees the verdict without the email and plan,
  unless VS Code parses past the noise itself.
- **ssh pins the grid's key.** Calls move from the ssh configuration's alias, with trust on first
  use (~/.ssh/known_hosts, `accept-new` for node hosts and the wizard's key step), to a pinned key in
  a known_hosts file of VS Code's own, with `StrictHostKeyChecking=yes`: VS Code writes that file
  (ssh-keyscan, then `fingerprintMatches`) before its first call, or every call fails with a host-key
  error. VS Code holds no profile until 7.0.0 and its export has no profile.ts, so at step 13 the
  fingerprint and the port are a Wayne State constant in VS Code, copied from hpcworker's wayne.json
  (`ssh_host_key` SHA256:kLTz1xK6anQ1denM+31kDEryQtgan2P76r9aLno+K3s, `ssh_port` 22, as base's
  test/profiles/wayne.json holds them) and recorded there as temporary until 7.0.0 reads the profile;
  a change of the grid's key then needs a VS Code release. Every call also gains `CheckHostIP=no`,
  `UpdateHostKeys=no`, `VerifyHostKeyDNS=no`, `GlobalKnownHostsFile` set to that file (the
  system-wide known_hosts is no longer read), `KnownHostsCommand=none` when VS Code passes
  `opensshVersion` (the line `ssh -V` printed) of 8.5 or later, `ForwardAgent=no`, `ForwardX11=no`,
  `ClearAllForwardings=yes` (a forward the student's configuration sets for the alias is dropped on
  VS Code's own calls), `PermitLocalCommand=no`, `LogLevel=ERROR` (ssh's warnings no longer reach VS
  Code's logs), `NoHostAuthenticationForLocalhost=no`, `ControlPath=none` and `ControlMaster=no` (VS
  Code shares no connection and passes no control path, so a master the student's own ssh opened
  through a `ControlMaster` line no longer carries VS Code's calls with no key checked) and the
  port. `scp()` (shell.ts:188-189, the install step at wizard.ts:738) passes
  `tool: 'scp'`, which gives `-P`: scp reads `-p` as "keep the times" and the port as a local file
  (`scp: stat local "22"`, measured). relay.ts keeps its own `ServerAliveInterval=30`, since base
  sets no keep-alive.
- **Which name the pin is for.** VS Code reaches the grid through its alias, whose `HostName` is
  `warrior.grid.wayne.edu` (cli/main.ts:45, `loginHost`, rendered by sshConfig.ts), while the pin in
  wayne.json is the key `grid.wayne.edu:22` answered on 2026-10-02, the profile's `ssh_host`. Base
  sets no `HostKeyAlias`, so ssh looks the key up under the name it connects to, and a line written
  for the other name fails every call with a host-key error. VS Code either connects to the
  profile's `ssh_host` (grid.wayne.edu), keyscans it and writes its line for that name, or keeps
  warrior, keyscans `warrior.grid.wayne.edu` and writes the line for warrior only when
  `fingerprintMatches` the pin. Whether warrior presents the same key as grid.wayne.edu is not yet
  measured; until it is, the second way may refuse. sshopts.test.ts holds the name and port the pin
  belongs to (grid.wayne.edu, 22); VS Code's own test is to hold that its line names the host it
  connects to.
- **The key step over ssh2.** The panel's key step sends the student's grid password and one-time
  code through the ssh2 library, not OpenSSH: `installPublicKey` and `probeWithKey`
  (core/sshInstall.ts, called at cli/main.ts:113 and 268 and vscode/store.ts:327) connect to
  `loginHost` with no `hostVerifier`, so they take any host key, and base's options, an OpenSSH
  argv, cannot reach them. At step 13 VS Code gives both a `hostVerifier` that computes the SHA-256
  fingerprint of the key it is offered (base64 with the padding removed, as ssh-keygen -l prints it)
  and refuses unless `fingerprintMatches(pin, seen)`. Until it does, the one connection that carries
  a secret is the one left unpinned, and step 13 does not pin it.
- **Remote-SSH's node windows.** The block VS Code manages in ~/.ssh/config (core/sshConfig.ts)
  stays VS Code's, and base's options reach only an ssh VS Code starts itself. Remote-SSH reads the
  block for the compute-node windows (extension.ts:478 and 496, `vscode-remote://ssh-remote+<node>.<nodeDomain>`):
  `Host *.<nodeDomain>` jumps through the alias (`ProxyJump`), which names no known_hosts file of
  its own, so ~/.ssh/known_hosts and the student's own `StrictHostKeyChecking` decide for the login
  node, and the node itself is taken on first use (`StrictHostKeyChecking accept-new`). The
  recommendation for step 13: the alias's block gains `UserKnownHostsFile` and `GlobalKnownHostsFile`
  set to the pinned file and `StrictHostKeyChecking yes`, so the jump is pinned under the same name
  as above, and the node hosts keep `accept-new`, since no profile holds their keys. Until then the
  node windows stay on trust on first use after step 13.
- **The account list.** Values bee's own parsing coerces (an order of "1", enabled "yes", "no", "0",
  "1", 0 or 1, version true) refuse the whole list, where VS Code used the account;
  `hibernate_until` is taken only in desktop's form (VS Code's space separator, minutes without
  seconds and short or long offsets are refused; bee writes none of them); a drive letter outside A
  to Z is refused; two accounts with the same order keep the file's order (VS Code sorted them by
  label); a refusal no longer names an unknown key, and a file that is not JSON no longer says
  where; a list over 64 KB, or one with a `..` step or a control character in a folder, is refused.
- **Redaction.** `redactCredentials` in gridApi.ts (`beethoven_read_file`) gains the three new
  token rules and the second review's three (a JSON `token` or `secret` field, a key variable
  written as a quoted JSON key, an HTTP Basic credential), so a student's file holding one shows
  [redacted] there. diagReport.ts's `scrub` stays VS Code's: replaced by base's `redact`, tokens would read
  [redacted] instead of `<token>`, and its JWT and short-fragment rules would go.
- **Diagnostics.** Base writes none of the engine's seven sentences; VS Code passes its own as
  `words` (the test's VS Code words reproduce today's details letter for letter over 3,200 runs),
  its 90 s timeout and the repairs' 300 s as the `guard`, and `Date.now` as `now`, which VS Code
  needs: it names its saved report by `started` and shows `finished` in the status bar. A check that
  answers no verdict fails alone as crashed, where `run()` rejected; a thrown text passes through;
  `ms` is never negative; `skip` and `warn` count only when exactly true, where VS Code's engine
  took any truthy value (section 15.4). `fixCommand` becomes `fix` throughout: the webview reads
  `c.fixCommand.title` and `command`, so a missed rename drops the fix button beside a failing
  check.

What its code changes, with nothing a student sees:

- strip: the list is unchanged (services.ts:24 already holds rules.json's 15, in order).
  `withoutClaudeCredentials` returns overrides `{NAME: undefined}`, and `run()` (shell.ts:31-35)
  merges `opts.env` over `process.env`. Base's `withoutCredentials` returns the environment with the
  names removed, so passed where the overrides go it would leave every listed name in the child's
  environment, `claude -p`'s among them. VS Code takes `credentialOverrides(process.env, { anyCase:
  process.platform === 'win32' })`, which keeps the override shape (and, with `anyCase`, also names
  each inherited variable written in another case, which on Windows is the same variable; not yet
  measured on Windows), or makes `run()` take a whole environment from `withoutCredentials`; either
  way credentialEnv.test.ts asserts that the child's environment holds no listed name. The two
  Remote Control variables are removed only on request, and the laptop does not remove them today.
- diagnostics: duplicate node ids are refused; a cycle is named as just the cycle; the messages
  become "diagnostics graph unknown: a -> missing" and "diagnostics graph cycle: a -> b -> a", so VS
  Code's engine test `/unknown missing/` no longer matches (the browser's `/unknown/` and `/cycle/`
  still do); reports gain the codes `reason`, `waitsOn` and `repairOutcome` (the shared error report
  lists its fields, so they do not leave the laptop); `assumption`, `futureRisk`, `source` and the
  report's format stay in VS Code's own node type; the order walk no longer recurses.
- links: no change; diagNodes.ts:428 prints `session_url` in a diagnostic's text unchecked, which
  `isClaudeCodeLink` can guard.

### 15.4 Choices step 9 made where the contract is silent, for review

Each is base's to change, in a pull request of its own, and a change reaches every edition at once:

- **run.ts.** Stale past 180 s, not at it (V11 R12, hpcworker's status_line, facts.ts);
  connection.json before status.json (facts.ts; V11 states no order); R1 applied inside `openLinkOf`
  and `newSessionLinkOf`.
- **meaning.ts.** `usage` is retry, as V11 5.3's [Try again], though the client's line and the lab's
  copy disagree, so ask-lead may be truer (a change to hpcworker's table first); `signin-node` is
  sign-in-again, the browser's action, where hpcworker's sentence says try again in a minute; read's
  missing is retry-later, and not-plain and too-large are ask-lead, which no contract text states
  (each pinned by meaning.test.ts); `busy` is retry-later though the gate also says it for causes
  waiting does not fix (section 6.1), because the passing cause is the usual one and an edition that
  sees busy again and again can say so, until hpcworker gives the lasting causes a word of their own;
  `no-gate` is ask-lead.
- **signin.ts.** `apiProvider` null or empty is other, by rules.json's text, where
  `hpcw_claude_signin`, grid/beethoven, VS Code and the browser say subscription: hpcworker
  publishes a case and changes one side. A parsed answer is judged by its own keys, then printed and
  read as text, so it is never subscription where its text is not; signin.test.ts holds rules.json's
  three texts word for word, so a change of their wording fails until the module is read again.
  `signinAnswered` tells no answer from an answer that says not signed in (both `none`) by the same
  reading of `loggedIn`; the email and plan stay the edition's.
- **steps.ts.** `cleanLine` strips the union of hpcworker's, desktop's and the browser's terminal
  codes, and the NUL hpcworker removes first, so no reader loses a line another reads. Whether
  lines.json should name the set; none of the three strips ESC 7, ESC 8, ESC = or ESC >. A job id
  is digits only, as the export says, so a PBS id reads as none (section 6.1).
- **sshopts.ts.** The pin alone decides when the edition passes the version of an 8.5 or later ssh
  (below). Neither edition set `GlobalKnownHostsFile`,
  `KnownHostsCommand` or `VerifyHostKeyDNS`, so the student's own ssh configuration (or a file it
  includes, or one another program writes there), not only an administrator's system-wide
  known_hosts, could add a source of keys that ssh accepted beside the pin with
  `StrictHostKeyChecking=yes` (measured with OpenSSH 9.6p1 against a local sshd: a
  `GlobalKnownHostsFile` or `KnownHostsCommand` line in the configuration let a key the pinned file
  did not hold through). Base sets `GlobalKnownHostsFile` to the pinned file (not its word `none`,
  which an older ssh may read as a file of that name), `VerifyHostKeyDNS=no`, and
  `KnownHostsCommand=none` only when the edition passes the version, since the word exists from
  OpenSSH 8.5 and an older ssh refuses it and with it the call (Windows 10's own is 7.7 or 8.1). The
  system-wide known_hosts is therefore no longer read; that settles an open question and is
  reversible if a site needs it. What stays open: an 8.5 or later ssh whose version the edition does
  not pass still runs a `KnownHostsCommand` its configuration names (measured), and these options
  are not yet measured on an ssh older than 9.6. `MACs=+hmac-sha1` and `AddressFamily=inet`, measured
  at Wayne State, go to every deployment (a profile key comes first if a site needs IPv6). A
  known_hosts path with a space is refused rather than quoted. The second review found two more ways
  past the pin, each measured with OpenSSH 9.6p1 against a local sshd whose key the pinned file did
  not hold: `NoHostAuthenticationForLocalhost yes` in the configuration skipped the check for a
  loopback address (a tunnel, or the grid's name mapped to 127.0.0.1), and with a `ControlMaster`
  and `ControlPath` line the call ran over a master another ssh had opened, with no key checked at
  all (`ControlMaster=no` alone still used it). Base sets `NoHostAuthenticationForLocalhost=no`, an
  old option it names with no version check (not yet measured on Windows' own ssh), and owns
  connection sharing: `ControlPath=none` and `ControlMaster=no` unless the edition names its own
  control path, which must be rooted (`/`, `~/` or a drive) and is refused for what a known_hosts
  path is refused for but `%`. With them ssh refused the wrong key in each case. Whether Windows'
  own OpenSSH, which shares no connection, accepts the two words is not yet measured.
- **accounts.ts.** It refuses a `..` step and control characters that bee accepts; whether bee and
  its schema should refuse them too, and carry the absolute-path, time-form and distinct rules.
  `beeMayTake` is set wherever bee's lax parsing or its `fromisoformat` might take the value, the
  cautious side, so an edition points to bee only where bee is sure to name the fault.
- **redact.ts.** `redact` takes every credential shape `redactCredentials` takes, so output is never
  redacted less than a file. Whether base gains a JWT rule, so that VS Code's `scrub` could move to
  base. The second review added three rules to both sets: a JSON field named `token` or `secret`
  (which also hides a value under such a name that is no credential, in a student's file too), the
  key variables written as a quoted JSON key, and HTTP Basic, counted only after an Authorization
  header rather than after any word Basic as the review suggested, so the word basic in a sentence
  stays. Still let through: a JSON Web Token on its own, a password in a link, a credential under
  any other field name. Both functions are for text: an edition that redacts a structured value
  redacts each string inside it (15.1).
- **diagnostics.ts.** Whether the editions rename their fix field or map it; a refused graph still
  rejects `runDiagnostics` (the browser's `runChecks` has no catch, so no report is saved); base
  formats the edition's `now` with `toISOString`. `skip` and `warn` count only when exactly true,
  where both editions' engines took any truthy value: the one place base parts from both. A re-check
  after a repair is judged by `ok` alone, so one that passes with a warning is `repaired`.
- **links.ts.** Its predicates (`x is string`) narrow a string to never on the false branch; a
  branded type would avoid that without a change at run time.
- **status.ts.** A value of state, needs, consent source, stop reason or permission mode that a
  newer writer adds within `v:1` reads as absent, so an older client shows its own "unknown" for it.
