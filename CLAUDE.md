# beethoven-base — working context

The shared parsers and rules of the three Beethoven editions: a small TypeScript library that
beethoven-desktop, beethoven-extension (the browser edition) and beethoven-vscode each take as a
pinned copy inside their own source root, checked with no secret against an `ORIGIN` record. It
holds once what the editions would otherwise each write: the meaning of what the grid writes (the
`HPCW-STEP` lines, `status --json`, the gate's answers), the Claude Code link shapes, the
subscription sign-in rule, the strip and redaction lists, the diagnostics engine. A fix made here
reaches every edition the same way. It holds nothing a student reads and nothing that runs: the
editions keep their UI, their sentences, their platform calls and their SSH stacks. This pull
request is the skeleton (design section 10, step 6); the 13 modules, about 550 lines, come with
step 9. Vendor: Gregory Schwing, trading as OpenSpineConsortium. Beethoven runs Claude Code and is
not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks, used here to say what it
runs; "Open OnDemand" is the mark of its publisher.

## Read first

- `docs/DESIGN.md`: the design, with greg's decisions of 2026-10-05 00:28Z in section 12. Sections 1
  to 5 say what base is and holds, its source rules, how the editions take it and which credentials
  exist; section 10 is the migration order.
- The non-negotiable rules in `hpcworker`'s, `beethoven-extension`'s and `beethoven-desktop`'s
  `CLAUDE.md` bind this library. The ones it touches are restated below; when they differ, theirs
  win.
- `hpcworker`'s `docs/V11_CONTRACT.md` and `docs/V12_CONTRACT.md`: the contract base parses. They are
  canonical there.

## Direction: hpcworker -> base -> the editions

- hpcworker is canonical for everything it writes: `status.json`, `connection.json`,
  `progress.log`, the `HPCW-STEP` lines, the gate's answers, the site profiles and the two contract
  texts. Base never defines a format. It parses what hpcworker's real writer makes, and its tests run
  against hpcworker's texts and vectors, pinned in `test/hpcworker/` with `tools/pull-hpcworker.mjs`.
  That pin is test data and never reaches an edition. A format changes in hpcworker first, against
  its contract text, then here, then in each edition.
- Base imports nothing of an edition's. An edition takes base only through `vendor`, never edits its
  copy, and changes base through a pull request here and a new release.
- hpcworker holds nothing for base, and no hpcworker workflow writes here. The site profiles stay
  out of base: each edition pulls them with its own `pull.sh`.
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
  directory, and never `claude auth logout`. Base reads no file at all; it parses only what an
  edition hands it. One person, their own accounts.
- **No secret for base, anywhere.**
  - No edition holds a secret for base. Its copy is checked with none, and nothing fetches base at
    build time, in a store package or in a release script.
  - This repository's CI holds none.
  - The GitHub credentials that beethoven-base's protected environments may hold are for code only,
    and none of them is a Claude key or token. They are `RULESETS_TOKEN` in the Environment
    `rulesets`, for `rulesets.yml`; `BASE_REPORT_TOKEN`, read-only, in `report` for `report.yml`, at
    step 14; and no propagate token, under D8. Each environment's deployment branches are main only
    (design section 5).
  - No workflow anywhere runs Claude Code.
- **Secrets never appear on a command line, in argv, in logs, in job files or in `sbatch --export`.**
  Never echo one. A workflow reads a secret into the environment of the one step that needs it (as
  `GH_TOKEN`), never into argv.
- **No code on claude.ai.** Base holds the Claude Code link shapes so that an edition can check a
  link before handing it to the opener. It fetches nothing, injects nothing and parses no claude.ai
  traffic.
- **No remote code.** No `eval`, no `new Function`, no fetched scripts. Base loads nothing. Its tools
  run only git, Node and the two pinned TypeScript compilers.
- **Nothing is deleted** outside a tool's own temporary folders.
  - `vendor` and `pull-hpcworker` never delete. A file that a new release or a new pin no longer has
    is printed with the line that removes it, for a person to run in a reviewed commit, and the
    checks fail until it is gone.
  - The lanes and the tests remove only the folders they made with mkdtemp; the tests refuse to
    remove any other.
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
    data; say origin, source or record. The copy's record is `ORIGIN`.
  - Versions are integers (1.0.0, 2.0.0), never fractional. `package.json` and the release tag
    `v<N>.0.0` carry the same one.

## The source rules (`src/`)

A module is pure TypeScript that an edition compiles into itself, under three editions' compiler
options at once. So a module in `src/` has:

- **No UI and no sentence a student reads.**
- **No platform call**: no network, file, process, timer, console, storage, DOM or browser API.
- **No I/O and no hashing**: neither `node:crypto` nor WebCrypto. An edition hashes; base offers
  only comparisons, such as `fingerprintMatches`.
- **No import beyond its own files**, and those only as `./<name>.js`: no `node:` module, no
  package, nothing outside the folder.
- **ES2022 only**, so desktop's Node 18 holds.
- **Nothing that runs on import.** A top-level value is a literal or a `/*#__PURE__*/` call whose
  arguments are literals; Vite drops these when they are unused and keeps other top-level code in the
  browser's bundle (measured with Vite 8.3.1, recorded in `tools/posture.mjs`). There is no `let` or
  `var`, no enum, no namespace and no top-level statement.
- **A flat, lower-case `.ts` file**: no folder, no `.d.ts`, no link.
- **Key, gateway or credential names only on a line that takes one away.** In `strip.ts` that is a
  line holding one quoted upper-case name and a comma; in `redact.ts`, one redaction rule.

`tools/posture.mjs` enforces these rules and names each finding with its file and line.

The three lanes compile every module as each edition will hold it:

| Lane | Options |
|---|---|
| Desktop | NodeNext, ES modules |
| Browser | WXT's Bundler and Preserve options, with DOM types |
| VS Code | Node16, CommonJS, under TypeScript 5.9.3 and again under 7.0.2 (the version VS Code's main pins) |

Every lane sets strict flags and `types: []`, so a module that leans on Node's or a browser's types
fails.

Each edition's list of modules is `editions/<name>.json`, in the form `{"modules": [...]}`. A
module's imports must be on every list that takes it; `node tools/vendor.mjs lists` checks this.

## How an edition takes base

**The vendor command.** `node tools/vendor.mjs vendor --into <edition checkout> --edition
<desktop|browser|vscode>`. Run it from a clean base checkout whose HEAD carries a `v*` tag.

- It reads everything from the tag's own git objects.
- It writes the edition's listed modules into `src/base/` (desktop) or `extension/src/base/` (the
  browser and VS Code).
- It writes `vendor/beethoven-base/check.mjs` and `ORIGIN` at the edition's repository root, `ORIGIN`
  last.
- `ORIGIN` holds beethoven-qa's five fields (repository, ref, commit, tree_sha256, files), then an
  `edition:` line and one `file: <path> <sha256>` line per file.

**What vendor refuses.** It writes nothing if it finds:

- a dirty base checkout or an untagged HEAD;
- a list that misses an import;
- a link anywhere in its path;
- a file added to the copy by hand;
- a file whose change neither `ORIGIN` nor the edition's HEAD holds;
- a release older than the copy's, or than the one on the edition's `origin/main`.

It never deletes.

**Exit codes**:

| Code | Meaning |
|---|---|
| 0 | Written |
| 1 | Written, but files of the older release remain (printed with the line that removes them) |
| 2 | Refused, nothing written |
| 3 | Stopped part way by the file system |

**In the edition**, CI and the pre-push hook run `node vendor/beethoven-base/check.mjs`. It needs no
secret, no package and no network, and runs on Node 18 or later on any platform; base's CI runs it
on Linux and Windows. CI checks out with `fetch-depth: 0` so that `origin/<base>` is present. The
check fails when:

- a file differs from `ORIGIN`;
- the copy holds a file `ORIGIN` does not list;
- `ORIGIN`'s release is older than the one on the pull request's base branch. This catches a rebase
  that took the older side.

**From base.** `node tools/vendor.mjs check --into <edition> --source <this checkout>` rebuilds the
copy from the commit `ORIGIN` names. That closes the one gap of a check that is the copy checking
itself: an edited `check.mjs` together with a rewritten `ORIGIN`.

**One implementation of the record.** `vendor/check.mjs` is the template and also the only
implementation of the `ORIGIN` record; base's own tools import it, so what `vendor` writes is what
`check` reads. Every edition carries it byte for byte from the release on, so change it with that in
mind. It uses only Node 18's APIs and handles Windows paths.

**Not built yet:** opening the editions' pull requests is a session's job, with its own sign-in (D8:
no token). `report.yml`, the lag report, is step 14.

## Build and test

```
npm ci                       # dev dependencies only, pinned exactly; also points git at .githooks
npm run gate                 # all of the below, as the pre-push hook and CI run it
npm run typecheck            # the lanes: desktop, browser, vscode (5.9.3), vscode (7.0.2)
npm run typecheck:tools      # the tools, the template and the tests (checkJs, strict)
npm run posture              # the source rules over src/
npm run vendor-check-self    # editions/*.json against src/
npm test                     # vitest: vendor, check, posture and pull-hpcworker against throwaway git repositories
npm run test:node18          # check.mjs and vendor.mjs under node:test; CI also runs it on Node 18
node tools/pull-hpcworker.mjs --ref <ref> [--from <hpcworker checkout>]   # pin hpcworker's texts and vectors
```

- **Node versions.** Development needs Node 22.12 or later, which vitest 5 requires. `check.mjs`
  needs Node 18 or later. Node 18.0.0 has no `--test` flag, so the Node 18 file is run directly.
- **No runtime dependency, ever.** An edition compiles base's source, so base has nothing to install
  there.
- **TypeScript 7.0.2** comes in as the npm alias `typescript7`. The lanes call each compiler by its
  path, because both packages name their command `tsc`.
- **`.npmrc` sets `legacy-peer-deps`.** npm 10.9 crashes on vitest's optional peers otherwise; desktop
  does the same.
- **Never commit a lockfile you did not produce with npm.**
- **Where the tests run git.** Only in folders of their own under the system's temporary folder,
  with an environment that drops git's repository variables and the person's own configuration. A
  pre-push hook hands the gate `GIT_DIR`, and a git that inherits it acts on this checkout whatever
  `-C` names; beethoven-qa measured that on 2026-10-04.

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
  - The rule is `.github/rulesets/main.json`, applied by `rulesets.yml` with `RULESETS_TOKEN` from
    the Environment `rulesets` (deployment branches main only).
  - Until that rule is applied, a pull request is merged by hand.
  - Environment secrets on a private repository depend on the organisation's GitHub plan, which is
    not yet measured.
- **The required checks**, by their exact names, each from GitHub Actions (integration 15368):
  - `gate`
  - `check.mjs on Node 18 (ubuntu-latest)`
  - `check.mjs on Node 18 (windows-latest)`

  A job renamed in `ci.yml` is renamed in `main.json` in the same commit.
- **A release** is a `v<N>.0.0` tag on main, which an organisation admin pushes. `vendor` takes only
  a tagged commit.

## Layout

- `src/`: the modules. In pull request #1 it holds only the placeholder `index.ts`.
- `editions/`: `desktop.json`, `browser.json` and `vscode.json`, the modules each edition takes.
- `vendor/check.mjs`: the edition's check and the `ORIGIN` record.
- `tools/`:
  - `vendor.mjs`: vendor, check and lists;
  - `lib.mjs`: the refusals and the guarded writes;
  - `posture.mjs`;
  - `pull-hpcworker.mjs`;
  - `lanes.mjs`;
  - `hooks.mjs`.
- `tsconfig.desktop.json`, `tsconfig.browser.json`, `tsconfig.vscode.json`: each edition's options.
  `tsconfig.tools.json` covers the tools and tests.
- `test/`:
  - `fixtures.mjs`;
  - the vitest files;
  - `node18/check.test.mjs`;
  - `hpcworker/`: the pinned texts and vectors, with their `ORIGIN`, from step 9.
- `docs/DESIGN.md`.
- `.githooks/pre-push`, `.github/workflows/` (`ci.yml`, `automerge.yml`, `rulesets.yml`) and
  `.github/rulesets/main.json`.

## How to be useful here

A wrong state that reads as plausible is the failure to fear: a check that passes because it never
looked, a lane that compiles the wrong module kind, a pure mark Vite ignores.

- **Check against something outside the computation**: hpcworker's real vectors, the edition's own
  compiler options, a built bundle, a mutation that must turn a test red.
- **Say plainly what is not known.** "Not yet measured" is the preferred form. Not yet measured:
  - `check.mjs` on a Windows machine (the CI lane will be the first);
  - the organisation's GitHub plan, which decides the environments.
