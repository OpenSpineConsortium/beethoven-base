# beethoven-base — working context

The shared parsers and rules of the three Beethoven editions: a small TypeScript library that
beethoven-desktop, beethoven-extension (the browser edition) and beethoven-vscode each take as a
pinned copy inside their own source root, with their own `interface/pull.sh`, checked by their own
tests with no secret against an `ORIGIN` record. It holds once what the editions would otherwise
each write: the meaning of what the grid writes (the `HPCW-STEP` lines, `status --json`, the gate's
answers), the Claude Code link shapes, the subscription sign-in rule, the strip and redaction lists,
the diagnostics engine. A fix made here reaches every edition the same way. It holds nothing a
student reads and nothing that runs: the editions keep their UI, their sentences, their platform
calls and their SSH stacks. The skeleton (design section 10, step 6) was rebuilt on 2026-10-08 to
the ecosystem's interface standard; the first of the 13 modules, `profile.ts`, came before step 9
(Linear BEE-218), alone in the `desktop` and `browser` exports at version 1. Step 9 brought the other
12, filled those two exports and added `vscode`; all three are version 1, since the change is
additive. The 13 are about 2,600 lines, about 1,500 of them code and the rest comments, which say
why, and blank lines (the design's estimate was about 550). Vendor: Gregory Schwing, trading as
OpenSpineConsortium. Beethoven runs Claude Code and is not an Anthropic product; "Claude" and
"Claude Code" are Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of
its publisher.

## Read first

- The interface standard, version 1: `INTERFACES.md` in the hub repository,
  `OpenSpineConsortium/beethoven` (greg, 2026-10-07 11:35Z: "encapsulating each repo so that it is independent and not directly
  accessing any code of another repo in the Beethoven ecosystem. Make sure it obeys the standard
  API-type interfacing."). It governs how base offers and takes anything.
- `interface/README.md`: what base offers and takes, and how an edition takes it.
- `docs/DESIGN.md`: the design, with greg's decisions of 2026-10-05 00:28Z in section 12. Sections 1
  to 5 say what base is and holds, its source rules, how the editions take it and which credentials
  exist; section 10 is the migration order.
- The non-negotiable rules in `hpcworker`'s, `beethoven-extension`'s and `beethoven-desktop`'s
  `CLAUDE.md` bind this library. The ones it touches are restated below; when they differ, theirs
  win.
- `hpcworker`'s `contract` export (its `interface/contract/`) and its `docs/V11_CONTRACT.md` and
  `docs/V12_CONTRACT.md` (its `contract-text` export): the contract base parses. They are canonical
  there.

## Direction: hpcworker -> base -> the editions

- hpcworker is canonical for everything it writes: `status.json`, `connection.json`,
  `progress.log`, the `HPCW-STEP` lines, the gate's answers, the site profiles and the contract.
  Base never defines a format. It parses what hpcworker's real writer makes, and its tests run
  against hpcworker's `contract` export (schemas, line grammar, rules and vectors), taken with
  `interface/pull.sh` into `test/hpcworker/`. That copy is test data and is in no export. A format
  changes in hpcworker first, against its contract, then here, then in each edition. What the export
  does not carry yet (a rule only in prose, a case no vector shows) is design section 6.1's list: a
  module types it from hpcworker's text and code, and it is added to the export there first. The site
  profile's keys and types are hpcworker's `module-schema` export; `profile.ts` reads only what it
  states, and a key it lacks (a match list, a text bundle) is added there first, then read here.
  The engine's account list is beethoven-agents' `registry` export, which `accounts.ts` reads by its
  schema; the rules the schema cannot state are bee's own code, read at a pinned commit.
- Base reads, runs and copies nothing from another repository's checkout, and imports nothing of an
  edition's. An edition takes base only through its own export, with its own `interface/pull.sh`,
  never edits its copy, and changes base through a pull request here.
- hpcworker holds nothing for base, and no hpcworker workflow writes here. The site profiles stay
  out of base's exports: desktop and the browser take hpcworker's `profiles` export themselves
  (base's `test/profiles/` is test data `profile.ts` is read against, in no export); VS Code holds
  no profile today, adopts the standard at design step 13 and reads the profile from 7.0.0.
- The lab's shared copy is never called outdated. `FRAMEWORK_MIN` is a fact in the lab lead's
  diagnostics only (D6). Within `v:1` changes are additive only, so an older copy still parses.

## Rules that are not negotiable

- **No API key anywhere.** greg, 2026-10-04 13:27Z: "no api key anywhere thats the only fundamental
  rule of this software". That means no Anthropic Console or API key, no `apiKeyHelper`, no Bedrock,
  Vertex or Foundry route, no `ANTHROPIC_BASE_URL` gateway, and no CI that runs Claude Code on a key
  or a token held as a secret. It holds in the code, the texts, the documents and the maintainer's own
  tooling alike.
  - Base's sign-in rule counts only a Claude subscription as signed in: `authMethod` `claude.ai`,
    `apiProvider` `firstParty` or absent, and no `apiKeySource`.
  - Its strip list and redaction rules name keys only to take them away. The posture scan refuses
    those names on every other line.
  - Code that refuses, strips or warns against a key is the rule working, and stays.
- **Usage credits are never used, by anyone, ever** (greg, 2026-10-04). Nothing here asks for,
  relies on, or treats as an option any paid usage beyond the student's own flat-rate subscription.
- **Never a Claude credential.** Base never reads, stores, copies, prints or relays one: no
  `setup-token`, no `CLAUDE_CODE_OAUTH_TOKEN`, no `.credentials.json` under any configuration
  directory, and never `claude auth logout`. Base's modules read no file at all; they parse only what
  an edition hands them. One person, their own accounts.
- **No secret for base, anywhere.**
  - No edition holds a secret for base. Its copy is checked with none, and nothing fetches base at
    build time, in a store package or in a release script: a person takes a new copy with the
    edition's `interface/pull.sh` and their own `gh` sign-in, in a pull request of its own.
  - This repository's CI holds none. `interface/pull.sh` uses the person's own `gh` sign-in and never
    names or reads a token variable.
  - The GitHub credentials that beethoven-base's protected environments may hold are for code only,
    and none of them is a Claude key or token. They are `RULESETS_TOKEN`, for `rulesets.yml`, read
    through the Environment `rulesets` (today the organisation secret every repository can see;
    design section 5 recommends a secret of that environment instead); `BASE_REPORT_TOKEN`,
    read-only, in `report` for the lag report, at step 14; and no propagate token, under D8. Each
    environment's deployment branches are main only (design section 5).
  - No workflow anywhere runs Claude Code.
- **Secrets never appear on a command line, in argv, in logs, in job files or in `sbatch --export`.**
  Never echo one. A workflow reads a secret into the environment of the one step that needs it (as
  `GH_TOKEN`), never into argv.
- **No code on claude.ai.** Base holds the Claude Code link shapes so that an edition can check a
  link before handing it to the opener. It fetches nothing, injects nothing and parses no claude.ai
  traffic.
- **No remote code.** No `eval`, no `new Function`, no fetched scripts. Base's modules load nothing.
  Its tools run nothing but git, Node and the two pinned TypeScript compilers, and the puller `gh`
  and the shell's own tools; nothing a pull fetches is ever run.
- **Nothing is deleted** outside a tool's own temporary files and folders.
  - `interface/pull.sh` never deletes a file it did not fetch. A file the provider dropped from an
    export is listed for a person to remove in a reviewed commit, and the boundary test fails until it
    is gone. The only file it removes is a `.part` file it fetched itself, when a pull fails before
    placing it: it refuses an export file whose name ends in `.part` and a `.part` file already in the
    folder, so no other can be one.
  - The lanes and the tests remove only the folders they made with mkdtemp and what they put in them.
    The tests make and remove theirs through `test/fixtures.mjs`, which refuses to remove any folder
    but one of its own under the system's temporary folder.
  - Nothing here ever touches anything under `$HOME` or a Claude Code login directory.
  - Base has no destructive command. If one is ever added, it refuses when `CLAUDECODE`,
    `BEETHOVEN_REQUEST_ID` (or `ASHLEY_REQUEST_ID`) or a similar agent marker is in the
    environment, or when stdin is not a terminal.
- **Students see plain words, and none of them come from here.** Base holds no sentence a student
  reads. `meaning.ts` maps each failure code to a next step (retry, sign in again, ask the lead), and
  each edition writes its own words. No close codes, variable names or paths reach a student through
  base.
- **Grid etiquette.** Base runs nothing on a grid, and its tests reach no grid. A rule base encodes,
  such as a worker being stale after 3 minutes, is the same in every edition. Attribute the grid's
  rules exactly as `hpcworker`'s `CLAUDE.md` does.
- **Names and words.**
  - The public name is Beethoven, and the trademark sentence above stands wherever the product is
    described.
  - Never use the word that starts "prov" and ends "enance" for the history of a file or a piece of
    data; say origin, source or record. A copy's record is `ORIGIN`.
  - Versions are integers (1.0.0, 2.0.0), never fractional. `package.json` carries one, and each
    export in `interface/INTERFACE.json` carries its own integer `version`; there are no release tags.

## The source rules (`src/`)

A module is pure TypeScript that an edition compiles into itself, under three editions' compiler
options at once. So a module in `src/` has:

- **No UI and no sentence a student reads.**
- **No platform call**: no network, file, process, timer, console, storage, DOM or browser API.
- **No I/O and no hashing**: neither `node:crypto` nor WebCrypto. An edition hashes; base offers
  only comparisons, such as `fingerprintMatches`.
- **No import beyond its own files**, and those only as `./<name>.js` (not `./<name>` or
  `./<name>.ts`): no `node:` module, no package, nothing outside the folder, and no triple-slash
  directive (a reference path reaches a file past the export check; a reference lib or types gives a
  module a library its edition's lane lacks, such as the DOM in the desktop lane).
- **ES2022 only**, so desktop's Node 18 holds.
- **Nothing that runs on import.** A top-level value is a literal or a `/*#__PURE__*/` call whose
  arguments are literals; Vite drops these when they are unused and keeps other top-level code in the
  browser's bundle (measured with Vite 8.3.1, recorded in `tools/posture.mjs`). There is no `let` or
  `var`, no enum, no namespace and no top-level statement.
- **A flat, lower-case `.ts` file**: no folder, no `.d.ts`, no link.
- **Key, gateway or credential names only on a line that takes one away.** In `strip.ts` that is a
  line holding one quoted upper-case name and a comma; in `redact.ts`, one redaction rule.
- **Each edition's own scan passes the modules it takes, as that scan is** (design section 3).
  Several of their rules reach past base's own. Desktop's `scripts/forbidden.mjs` refuses a password
  handed to ssh, the Claude sign-in's folder, a shell, a deletion and a quoted `watch`, `restrict` or
  `forget` (gate verbs desktop never sends, so a module desktop takes writes those words only as keys
  or inside a pattern: `gate.ts`'s `GATE_LIMIT_WORDS`). The browser's `hygiene.test.ts` refuses the
  old name and key wording in comments too, which base's posture scan never reads.

Which tool holds which rule: `tools/posture.mjs` enforces the platform, import, top-level, file-shape
and key-name rules, and names each finding with its file and line; the desktop and VS Code lanes hold
ES2022 (their `lib` is ES2022 alone); `test/scans.test.ts` runs the editions' scans, typed again from
their text at the refs step 9 read, over the export each edition takes. No tool checks for a sentence
a student reads; review holds that rule.

The three lanes compile every module of `src/` together, laid out where and as each edition will
hold its copy, under that edition's options:

| Lane | Options |
|---|---|
| Desktop | NodeNext, ES modules |
| Browser | WXT's Bundler and Preserve options, with DOM types |
| VS Code | Node16, CommonJS, under TypeScript 5.9.3 and again under 7.0.2 (the version VS Code's main pins) |

Every lane sets strict flags and `types: []`, so a module that leans on Node's or a browser's types
fails (the posture scan refuses the triple-slash directive that would bring them back). No lane
compiles one export's modules alone; what keeps an export whole is the export check below, over the
imports the posture scan allows.

What each edition takes is its export in `interface/INTERFACE.json` (`desktop`, `browser` and
`vscode`, each kind `files`, version 1, one path per module under `src/`); that file is the one place.
`tools/exports.mjs`, run by `npm run posture`, fails an export one of whose paths matches no tracked
file, an edition's export with a path outside `src/` (its copy lands below the folder all its paths
share, so every module would move one folder down), or an export that carries a module without a
module it imports (`./<name>.js`) or that names a file in a triple-slash reference, naming the export,
the file and the import.

## How an edition takes base

The interface standard's rule 3, in the edition's own repository; no tool of base's runs there.

- **The import.** The edition's `interface/INTERFACE.json` names base's export for it, the version
  its code reads and the folder: `src/base` for desktop, `extension/src/base` for the browser and
  VS Code.
- **The pull.** The edition's own `interface/pull.sh` (each edition writes its own puller: the
  standard says what it must do, not its text, and desktop's and the browser's differ in their flags
  and their checks; VS Code has none until it adopts the standard at design step 13), for example
  `bash interface/pull.sh src/base` in desktop, asks GitHub through the person's own `gh` sign-in for
  a commit base's `main` contains, base's `INTERFACE.json` at that commit, and only the files the
  export lists at that version. It fetches every file before placing any, writes each module at its
  path below `src/` in the folder (the export check keeps an edition's paths under `src/`), and writes
  `ORIGIN`:

  ```
  repository OpenSpineConsortium/beethoven-base
  commit <40 hex>
  export desktop 1
  sha256 <64 hex> links.ts
  ```

  It never deletes; a module base dropped is listed for a person to remove in a reviewed commit.
  Desktop's `--pinned` takes again exactly the commit `ORIGIN` names and refuses unless what it
  fetched is what `ORIGIN` records. The browser's puller (beethoven-extension ae11a00) has no such
  form: its `--at-origin` takes the same commit again and writes over the files and `ORIGIN` without
  comparing, so only `git diff` afterwards shows what changed, and it refuses a folder that does not
  exist yet (`mkdir -p extension/src/base` before the first pull).
- **The check.** The edition's own boundary test, in its own test run, with no secret and no
  network, fails when a file differs from `ORIGIN`, when the folder holds a file `ORIGIN` does not
  list (besides `ORIGIN`, `README.md` and `pull.sh`), and when `ORIGIN`'s export or version is not the
  one the import names. Its conformance tests then say whether its code still reads the copy.
- **What a consumer acts on** is the export's integer version and the commit in its `ORIGIN`, never a
  release tag. A change an edition must act on raises the export's version in the same pull request
  as the code; an additive one keeps it.

**What the old pinned copy did that this does not** (design section 13), recorded as risks:

- It refused an `ORIGIN` older than the one on the pull request's base branch, which caught a rebase
  that took the older side. Under the standard an edition's test cannot tell an older copy from a
  newer one.
- `check --source` rebuilt the copy from base's own checkout, so a hand edit that also rewrites
  `ORIGIN`'s `sha256` lines was caught. Now it passes the edition's test. The standard defines no
  audit for it: in desktop, `bash interface/pull.sh --pinned src/base`, run by a person with their own
  sign-in, refuses it; in the browser, `--at-origin` and then `git diff` show it without refusing; VS
  Code has no puller yet. No CI can run any of them.
- It wrote nothing through a link anywhere in its path. Desktop's and the browser's pullers (read at
  9ce98bb and ae11a00, not run here) create folders, redirect and move through a link, so a link in
  the edition's copy folder takes a pull outside the edition's repository. Base's own puller refuses
  one before it writes.
- It refused a file whose change neither `ORIGIN` nor the edition's `HEAD` held. Every puller,
  base's own included, writes over a copied file that was edited and not committed, without a word.

**Not built yet:** opening the editions' pull requests is a session's job, with its own sign-in (D8:
no token). The lag report is step 14.

## Build and test

```
npm ci                       # dev dependencies only, pinned exactly; also points git at .githooks
npm run gate                 # all of the below, as the pre-push hook and CI run it
npm run typecheck            # the lanes: desktop, browser, vscode (5.9.3), vscode (7.0.2)
npm run typecheck:tools      # the tools and the tests (checkJs, strict)
npm run posture              # the source rules over src/, then the export check (tools/exports.mjs)
npm test                     # vitest: boundary, exports, posture, the editions' scans, each module's test
bash interface/pull.sh --all # every import, through your own gh sign-in
```

- **Node versions.** Development needs Node 22.12 or later, which vitest 5 requires. The modules
  themselves keep to ES2022, so desktop's Node 18 runs them.
- **No runtime dependency, ever.** An edition compiles base's source, so base has nothing to install
  there.
- **TypeScript 7.0.2** comes in as the npm alias `typescript7`. The lanes call each compiler by its
  path, because both packages name their command `tsc`.
- **`.npmrc` sets `legacy-peer-deps`.** npm 10.9 crashes on vitest's optional peers otherwise; desktop
  does the same.
- **Never commit a lockfile you did not produce with npm.**
- **Where the tests run git.** Only in folders of their own under the system's temporary folder,
  with an environment that drops git's repository variables and the person's own configuration, and
  read-only in this checkout (`git ls-files`, `git cat-file`, `git rev-parse`). A pre-push hook hands
  the gate `GIT_DIR`, and a git that inherits it acts on this checkout whatever `-C` names;
  beethoven-qa measured that on 2026-10-04.
- **No test reaches the network or needs a secret.** The puller's tests source it and run its pure
  parts, and run it whole with a stand-in for `gh` first on the `PATH` that answers from a folder, so
  the `ORIGIN` it writes is shown to be the one `test/origin.ts` reads.

## Pull requests and the gate

- **The gate runs before every push.** `.githooks/pre-push` runs `npm run gate`, and a red gate does
  not leave the machine. `npm ci` (or `npm run hooks`) points git at the hook.
  - It pushes only the checked-out commit, from a tree with nothing uncommitted (untracked files
    count).
  - It first unsets git's repository variables.
  - `SKIP_GATE=1` skips all of it. Use it only knowingly, and say why in the commit.
- **Pull requests are opened ready for review, never as drafts.** `automerge.yml` arms GitHub's
  auto-merge on each one, but only once `main` carries a required-checks rule; armed without one, it
  would merge before the tests. From then on, the required checks alone decide.
  - The rule is `.github/rulesets/main.json`, applied by `rulesets.yml` with `RULESETS_TOKEN`, read
    through the Environment `rulesets`. The token is the organisation secret, so nobody pastes it
    again for this repository. GitHub creates the environment on the job's first run if nobody has;
    limiting its deployment branches to main is a setting of its own, and does not keep an
    organisation secret from other jobs.
  - Until that rule is applied, a pull request is merged by hand.
  - Environment secrets on a private repository depend on the organisation's GitHub plan, which is
    not yet measured.
- **The required check**, by its exact name, from GitHub Actions (integration 15368): `gate`. A job
  renamed in `ci.yml` is renamed in `main.json` in the same commit.
- **What an edition takes is a merged commit.** Nothing is tagged. A change an edition must act on
  raises its export's `version` in `interface/INTERFACE.json` in the same pull request as the code.

## Layout

- `src/`: the 13 modules (which edition takes which: `interface/README.md`):
  - `links.ts`: the two Claude Code link shapes, environment and session, exact matches only, and
    `linksIn`, the links a text holds;
  - `steps.ts`: the `HPCW-STEP` lines, the failure codes with their exit statuses, a connect
    transcript's rules, progress.log's lines, and `cleanLine` (the union of hpcworker's and the
    editions' terminal codes, and glued keepalives);
  - `status.ts`: status.json, connection.json and the worker's status line, read field by field, with
    every field it refused named (the writer's "" in a link and `claude_login` null read as absent,
    not refused); the stopped line;
  - `gate.ts`: the gate lines desktop and the browser both send, desktop's remote line, the gate's
    refusals, caps and read failures with their exit statuses when the caller gives them, a copy
    without the gate (`no-gate`), the version lines, `FRAMEWORK_MIN` (17);
  - `run.ts`: R1 and R12 (stale only past 180 s, from the text of `updated_at` or from a heartbeat
    the edition has timed, `isStaleAt`), and the links to open, session first (`openLinkOf`) or the
    environment only (`newSessionLinkOf`), per D7;
  - `meaning.ts`: each failure code and gate answer mapped to a next step, a code and no sentence;
  - `profile.ts`: the site profile reader (the keys clients read with module-schema 1's types,
    `deploymentFor` by the portal's origin or the login node and never a default, `sshTargetOf`,
    `stateDirOf`, `expandPath` on a word boundary, `sharedRootOf`, `portalOriginOf`, `restricts`);
  - `redact.ts`: the editions' redaction and credential rules, plus `hf_`, GitHub and `github_pat_`,
    a JSON field named token or secret, a key or token variable as a quoted JSON key, and an HTTP
    Basic Authorization header; `redact`'s rules take every credential shape too; both are for plain
    text, never for JSON serialised to be parsed again;
  - `accounts.ts`: the engine's accounts.json, by its schema and bee's rules, read whole or refused
    whole, each refusal marked where bee might take the value (`beeRefusesToo`);
  - `sshopts.ts`: the OpenSSH options of every ssh, scp or sftp to the grid, with the pinned key the
    only source of host keys when the edition passes its ssh version (8.5 or later, which adds
    `KnownHostsCommand=none`; design 15.4), no connection shared but the edition's own control path,
    and `fingerprintMatches`;
  - `signin.ts`: rules.json's subscription sign-in rule over what `claude auth status` printed (a
    parsed answer is printed again and read as text), and `signinAnswered`, which tells no answer from
    an answer of not signed in;
  - `strip.ts`: rules.json's credential variables (and the two Remote Control ones on request), as
    an environment without them (`withoutCredentials`) or as overrides (`credentialOverrides`);
  - `diagnostics.ts`: the check engine, with the edition's words, timeout guard and clock passed in.
- `interface/`: `INTERFACE.json` (what base offers and takes; format 1, the exports `desktop`,
  `browser` and `vscode`, the six test imports), `pull.sh` (base's own puller, ported from
  beethoven-desktop's, with refusals desktop's lacks: an import folder outside `test/<name>`, a link
  on the way, a `.part` name) and `README.md`.
- `tools/`:
  - `posture.mjs`: the source rules;
  - `exports.mjs`: every export's paths name tracked files, an edition's stay under `src/`, and each
    export carries its modules' imports;
  - `lanes.mjs`: the three typecheck lanes;
  - `hooks.mjs`: points git at `.githooks`.
- `tsconfig.desktop.json`, `tsconfig.browser.json`, `tsconfig.vscode.json`: each edition's options.
  `tsconfig.tools.json` covers the tools and tests.
- `test/`:
  - `boundary.test.ts`: the interface standard's rules 1 to 3 for base (with what desktop's and
    hpcworker's boundary tests miss: a path given as separate arguments, another repository's action
    or reusable workflow, a package fetched from GitHub, a fetched script piped into a shell, a link
    out of the repository, an `ORIGIN` no import declares), and the puller;
  - `origin.ts`: the `ORIGIN` check, which also refuses a link and a record of no file;
  - `profile.test.ts`: `profile.ts` once per deployment, real and synthetic; `compose.ts`, the
    composition rule written again from `module-schema` (test code), shown to give hpcworker's own
    profile byte for byte before it composes the example;
  - one test per module of step 9 (`links`, `steps`, `status`, `gate`, `run`, `meaning`, `redact`,
    `accounts`, `sshopts`, `signin`, `strip`, `diagnostics`, each `<module>.test.ts`): every pattern,
    list and number the module types by hand is held equal to the export that carries it, every
    vector is read through the parser that reads it, and each test's name states the rule it pins;
  - `scans.test.ts`: desktop's and the browser's source scans, typed again from their text at
    9ce98bb and ae11a00, run over the export each edition takes;
  - `exports.test.ts`, `posture.test.ts`;
  - `fixtures.mjs`: throwaway folders and git repositories;
  - the imports, each with its `ORIGIN`, taken with `interface/pull.sh` from GitHub (first on
    2026-10-08; `--pinned --all` took back the same bytes): `profiles/` and `module-schema/`
    (hpcworker), `site-modules/` and `site-examples/` (beethoven-sites' `modules` and
    `example-modules`), `hpcworker/` (hpcworker's `contract` export) and `registry/` (beethoven-agents'
    `registry` export).
- `docs/DESIGN.md`.
- `.githooks/pre-push`, `.github/workflows/` (`ci.yml`, `automerge.yml`, `rulesets.yml`) and
  `.github/rulesets/main.json`.

## How to be useful here

A wrong state that reads as plausible is the failure to fear: a check that passes because it never
looked, a lane that compiles the wrong module kind, a pure mark Vite ignores, an export check over an
empty list of exports.

- **Check against something outside the computation**: hpcworker's real vectors, the edition's own
  compiler options, a built bundle, a mutation that must turn a test red.
- **Say plainly what is not known.** "Not yet measured" is the preferred form. Not yet measured:
  - whether each edition's own scans and bundlers accept an `ORIGIN` file inside its source folder;
  - whether each edition's own suite runs the modules it takes (steps 10, 11 and 13; at step 9 only
    the lanes, each export compiled alone, and the editions' scans rewritten from their text, now
    `test/scans.test.ts`, ran);
  - the organisation's GitHub plan, which decides the environments.
