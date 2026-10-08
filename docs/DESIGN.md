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

## 1. The decision

- beethoven-base is a small TypeScript library of 13 modules, about 550 lines. Each module has two
  or more real consumers today, or is a rule every edition must apply the same way.
- It holds no UI, no sentence a student reads, no platform call, no I/O, no hashing and no import
  beyond its own files.
- Base offers one export per edition in `interface/INTERFACE.json` (`desktop`, `browser` and
  `vscode`, kind `files`, from step 9), each listing the modules that edition takes. Each edition
  takes its export as a pinned copy inside its source root, with its own `interface/pull.sh`, from
  GitHub at a commit base's `main` contains, and checks it with no secret against an `ORIGIN` record
  in its own boundary test (the interface standard, rule 3). No tool of base's runs in an edition,
  and the puller never deletes.
- No edition holds a secret for base. The only secret an edition holds is `RULESETS_TOKEN`, for
  `rulesets.yml` only, as desktop does today. beethoven-base may hold two GitHub credentials for
  code, each in a protected environment. Neither is a Claude key, and no workflow anywhere runs
  Claude Code.
- hpcworker stays canonical for everything it writes, and publishes it as its `contract` export:
  machine-readable schemas, rules and vectors from its real writer, with a test that fails on drift
  (section 6.1).
- The VS Code edition moves onto hpcworker for its Remote Control worker. The `claude -p` queue does
  not go into hpcworker; where it goes is decision D1.
- A safety step comes first and does not wait for base: grid scripts 9, before VS Code 5.0.0 is built.

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

**Real size, checked** against the line ranges above. Before VS Code moves, base replaces about 550
duplicated lines: desktop about 350 (all 203 of contract.ts, all 38 of redact.ts, profile.ts:44-79
and the parse parts of accounts.ts) and VS Code about 205 (diagnostics.ts minus its layer types,
accounts.ts:47-75, services.ts:21-26, wizard.ts:533-535, shell.ts:135). At 7.0.0 VS Code also takes
steps, status, gate, run, meaning and profile, about 280 lines it would otherwise write. Critique
2's figure of about 850 counted the terms core, floors and the step sentences, which stay out. For
scale, the client code is 37,141 lines: browser src 25,046, VS Code src and grid 9,516, desktop src
2,579.

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
Until step 9 `exports` is `[]`, because the skeleton has no module.

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
a `.part` name in the export or already in the folder); it serves base's own import from step 9.

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

**hpcworker holds nothing.** From step 9 base takes hpcworker's `contract` export with its own
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
verdicts; whether the export covers each of them is not re-checked here, and step 9 checks it before
the parsers rely on it. From step 9 base's tests parse every vector of the `contract` export, taken
into `test/hpcworker/` with base's own `interface/pull.sh`; that copy is test data and is in no
export. The export lives under `interface/`, outside the `framework/` that deploy_shared.sh publishes,
so changing it changes no framework version.

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

The lists disagree today. hpcworker's template removes 15 credential and provider names
(worker.sbatch.tpl:215-217). bee's `CREDENTIAL_VARS` removes 27 (b7b8650 accounts.py:87-101; the
same 27 at beethoven-agents 0de7913, src/beethoven_agents/bee/accounts.py:87-101): it has 18 names
hpcworker lacks, such as `ANTHROPIC_FOUNDRY_API_KEY`, `AWS_BEARER_TOKEN_BEDROCK` and
`ANTHROPIC_BEDROCK_BASE_URL`, and lacks 6 that hpcworker has, such as `CLAUDE_CODE_USE_GATEWAY`.
The one exact list is the union, 33 names (recomputed here from the two lists).
hpcworker adopts it first, as a framework bump; base's strip.ts is then that list, one name per
line. hpcworker's `contract` export carries its list (`rules.json`, `credential_variables`), and the
standard's rule 4 asks a consumer to test a list it types by hand equal to the export, which is one
more reason hpcworker adopts the union first.
Desktop's all-secrets net (ssh.ts:156) stays in desktop. VS Code exports `GITHUB_TOKEN`,
`GH_TOKEN` and `HF_TOKEN` on purpose (services.ts:49-75), and a token-shaped net would strip them.

### 6.5 FRAMEWORK_MIN and link order

**FRAMEWORK_MIN, reconciled with "never called outdated" (hpcworker CLAUDE.md:178-179).** Base
exports FRAMEWORK_MIN for its tests and for the lab-lead section of each edition's diagnostics,
where the two numbers are stated as a fact. No student-facing text calls the lab's copy outdated,
and no edition replaces it; an older copy still parses, because changes within `v:1` are additive.
The browser's `FRAMEWORK_CONNECT_VERSION = 10` (contract.ts:102) is referenced nowhere and goes.
This is D6.

**Link order is a product choice, not drift.** Desktop opens `environment_url` first on purpose
(contract.ts:153, "a new session can start there"). The browser offers both: Open is session first,
New session is the environment link (facts.ts:114-128). run.ts exports both; D7 settles desktop's.

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

One VS Code pull request, independent of base.

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
fix to the diagnostics engine. Today the same bugs sit in two or three copies: the apiKeySource gap,
desktop's "other" codes, the HF-token redaction.

**It cannot** touch anything a student sees (the browser's panel, desktop's MCP text, VS Code's tree
and commands), any platform API, the three SSH stacks, packaging and store review, or the
agreements. Base is about 550 lines against 37,141 of client code.

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
| 3 | beethoven-vscode | `beethoven.account` (aa44696, with the 22 findings from the staging patch), rebased on main (cc76efd). aa44696 typechecks under TS 7.0.2 with its own dependencies (exit 0, measured here); rebased onto main's `@types/node` 26.6.3 it is not yet measured. | Merge. |
| 4 | beethoven-vscode | Grid scripts 9 (section 8, items 1 to 6). | Merge. Build and publish 5.0.0. |
| 5 | beethoven-vscode | `admin.mjs roster`, if your laptop's checkout lacks it. | Re-approve grid-only students. Run grid_access.sh `--dry-run`. |
| 6 | beethoven-base | PR #1, the skeleton, rebuilt to the interface standard on 2026-10-08: CLAUDE.md; package.json with dev dependencies only (typescript 5.9.3, typescript 7.0.2 through an npm alias, vitest 5.0.2); three typecheck lanes (Bundler with DOM; NodeNext; Node16 CommonJS); tools/posture.mjs with the top-level-literal rule and tools/exports.mjs; `interface/INTERFACE.json` (no export, no import yet), `interface/pull.sh` and the boundary test; ci.yml with the one job `gate`; the kit (pre-push, automerge.yml, rulesets.yml, `.github/rulesets/main.json`). | Tick Allow auto-merge. Create the `rulesets` environment. Merge by hand. |
| 7 | hpcworker | The vectors and their drift test: done as the `contract` export (section 6.1). The V11:722 and R5 text fix and the CLAUDE.md :58 and :298-303 lines: not re-checked here. No framework change. | Merge. |
| 8 | hpcworker | Framework N+1: the 33-name strip list in worker.sbatch.tpl and clean_env_args (bin/hpcworker:342-346). Vectors regenerated. | Merge. Deploy. |
| 9 | beethoven-base | PR #2: the 13 modules; the exports `desktop`, `browser` and `vscode` (kind `files`, version 1, one path per module under `src/`) in `interface/INTERFACE.json`; the import of hpcworker's `contract` export (version 1) into `test/hpcworker/`, taken with `interface/pull.sh`, and the parsers' tests against its vectors. | Merge. |
| 10 | beethoven-desktop | 2.0.0: base's `desktop` export into `src/base` with desktop's own `interface/pull.sh`, an import in its `INTERFACE.json` checked by its boundary test; contract.ts, redact.ts, profile.ts and the account parsing use base; one floor clock per class; stale at 3 minutes; link order per D7; CLAUDE.md :42-43, 89, 101. | Merge. Pack. |
| 11 | beethoven-extension | 16.0.0, on top of 15.0.0: base's `browser` export into `extension/src/base` with the extension's own `interface/pull.sh`, checked by its boundary test; the bundle scan for key names; the profile check fails instead of switching itself off (hygiene.test.ts:239-245; sync-profiles.mjs:26-30 only warns); the V11 text copy; CLAUDE.md :58, 329-334, 339. | Merge. Release. |
| 12 | beethoven-extension | Adopt the kit. | Tick Allow auto-merge. Create the environment. Merge by hand. |
| 13 | beethoven-vscode | 6.0.0, laptop side: links, signin, strip, redact, diagnostics, accounts and sshopts from base's `vscode` export, taken with VS Code's own `interface/pull.sh` (VS Code adopts the interface standard first); a CI workflow (typecheck, unit tests with the boundary test, `vsce package`); the kit. | Merge by hand. Publish. |
| 14 | beethoven-base | The lag report, which reads each edition's `interface/INTERFACE.json` (section 4). No propagate workflow in base: if D8 ever says token, propagation is each edition's own workflow (section 5). | Create `BASE_REPORT_TOKEN`. |
| 15 | hpcworker | Framework N+2, only for what D3 and D4 add. Possibly nothing. | Deploy. |
| 16 | beethoven-vscode | 7.0.0 onto hpcworker (section 7); the queue per D1; texts at TERMS_VERSION 8 or later (aa44696 already takes it to 7; main has 6). | Publish. |
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
  check (wizard.ts:533-535) is a real consumer, so signin.ts stays, at 11 lines.
- **c2, VS Code is already at TERMS_VERSION 7.** Only on aa44696; main has 6 (terms.ts:23). The
  conclusion holds: the move takes it to 8 or later.
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
  caught only as far as the vectors reach.
- **Shared fixes change what students see**: desktop will warn at 3 minutes, a Console-key sign-in
  fails in VS Code, HF tokens are redacted. Each edition's pull request says so, and its version
  goes up.
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
- Whether the account branch, rebased onto main, typechecks under TypeScript 7.0.2 (aa44696 alone
  does).
- How many VS Code students use ask and send, GPU workers, or more than three worker names.
- Whether a stopped grid scripts 8 worker can come back through `--requeue`.
- Home use under `~/.beethoven/projects`, and whether a transcript can be bound through that link (M13).
- Whether `admin.mjs roster` exists on your laptop.
- Whether grid_access.sh runs on a schedule now.
- The organisation's GitHub plan, which decides environment secrets, deployment branches and
  required reviewers on private repositories.
- `interface/pull.sh` run against GitHub from this repository: base takes nothing yet, and only
  desktop's copy of the script has written committed `ORIGIN` records.
- Whether the browser's hygiene walk and each edition's bundler pass over an `ORIGIN` file inside the
  edition's source folder.
- Whether hpcworker's `contract` vectors cover every case section 6.1 first asked for.
