# What beethoven-base offers and takes

This repository is one sealed unit of the Beethoven ecosystem (the interface standard:
https://github.com/OpenSpineConsortium/beethoven/blob/main/INTERFACES.md). `INTERFACE.json` lists
what it offers other repositories and what it takes from them; everything not listed is private and
may change in any pull request.

## What it offers

Three exports, one per edition, each kind `files` and version 1. Before design step 9 (`docs/DESIGN.md`,
section 10) `desktop` and `browser` held `profile.ts` alone; step 9 filled them and added `vscode`,
and since a module added is an additive change, both kept version 1. Thirteen modules sit under
`src/`; each export lists those its edition takes:

| Export | Modules | Taken by |
| --- | --- | --- |
| `desktop` | links, steps, status, gate, run, meaning, profile, redact, accounts, sshopts | beethoven-desktop, into `src/base` |
| `browser` | links, steps, status, gate, run, meaning, profile, redact, signin, diagnostics | beethoven-extension, into `extension/src/base` |
| `vscode` | links, redact, accounts, sshopts, signin, strip, diagnostics, profile | beethoven-vscode, into `extension/src/base` |

What each module holds:

| Module | Holds | Imports |
| --- | --- | --- |
| `links.ts` | the two Claude Code link shapes (environment and session), exact matches only, and the links a text holds | nothing |
| `steps.ts` | the `HPCW-STEP` lines, the failure codes and their exit statuses, a connect transcript's rules, progress.log's lines, the line cleaner (the union of hpcworker's and the editions' terminal codes) | nothing |
| `status.ts` | status.json, connection.json and the worker's status line (`worker status --json` and the gate's `status`), read field by field; the stopped line | links, steps |
| `gate.ts` | the gate lines both desktop and the browser send (version, status, stop, read, connect), desktop's remote line, the gate's refusals, caps and read failures with the exit status, when the caller gives one, a copy without the gate, the version lines, `FRAMEWORK_MIN` | steps, profile |
| `run.ts` | R1 (a stale file) and R12 (stale after three minutes, from `updated_at` or from a heartbeat the edition has timed), and which link to open: the session first, or the environment only (D7) | links, status |
| `meaning.ts` | each failure code and gate answer mapped to a next step, as a code (retry, retry later, sign in again, change the request, ask the lab lead) | steps, gate |
| `profile.ts` | the site profile reader (Linear BEE-218) | nothing |
| `redact.ts` | the redaction rules, which take every credential shape too, and the credential rules for a student's own file; for plain text, never serialised JSON | nothing |
| `accounts.ts` | the engine's accounts.json, read by its schema and bee's own rules | nothing |
| `sshopts.ts` | the OpenSSH options every ssh, scp or sftp to the grid passes: the pinned key the only source of host keys when the edition passes its ssh version (8.5 or later, which adds `KnownHostsCommand=none`; design 15.4), and no shared connection but the edition's own control path; and the host key comparison | nothing |
| `signin.ts` | the subscription sign-in rule over what `claude auth status` printed, and whether it answered at all | nothing |
| `strip.ts` | the variables a program removes before it starts Claude Code, as an environment without them or as overrides | nothing |
| `diagnostics.ts` | the check engine: dependency order, blocked with its root cause, quick and full runs; the words, the timeout and the clock come from the edition | nothing |

VS Code takes `profile.ts` since 2026-10-21, ahead of design step 16, to place its grid jobs and reach
compute nodes by the site profile rather than by values of its own; it takes no module that reads what
the grid writes until its 7.0.0 moves onto hpcworker (design step 16), when steps, status, gate, run and
meaning join its export. Desktop does not take
signin.ts (status.json carries no `authMethod`) or strip.ts (its ssh drops every such variable by
pattern), nor diagnostics.ts; the browser does not take accounts.ts (it cannot read the file),
sshopts.ts (it has its own ssh client) or strip.ts (it starts no program). What changes for each
edition's students and code when it takes its export is `docs/DESIGN.md`, section 15.

Which module goes in which export is the table in `docs/DESIGN.md`, section 2. Each export is
TypeScript source an edition carries byte for byte inside its own source tree and compiles with its
own compiler and options. The standard has no TypeScript kind, and `files` (files a consumer carries
byte for byte) is the one that says what happens to them. Each export has an integer `version`,
raised when an edition must change its code to take the new copy (a name removed, renamed or
retyped, a code whose meaning changes) and kept for an additive change.

`npm run posture` checks every export with `tools/exports.mjs`: each path matches a tracked file, an
edition's paths stay under `src/`, and every module an export carries has, in the same export, every
module it imports (`./<name>.js`); the posture scan allows no other way for a module to name a file
(no `./<name>` or `./<name>.ts`, no triple-slash directive). That is a check of what the copy holds,
not a compile of it: the typecheck lanes compile all of `src/` together, never one export alone. Each
export was compiled alone once, at step 9, in its edition's lane (scratch, not kept; design section
3). `test/scans.test.ts` runs desktop's and the browser's source scans, typed again from their text,
over the export each takes, in every gate.

## What it takes

Six imports, the test data the modules are read against; each is in no export:

| Import | From | Into | What the tests do with it |
| --- | --- | --- | --- |
| `profiles`, version 1 | hpcworker | `test/profiles/` | the composed profiles every client reads |
| `module-schema`, version 1 | hpcworker | `test/module-schema/` | each key's type, and the rule that composes a profile from its modules |
| `modules`, version 1 | beethoven-sites | `test/site-modules/` | each real deployment's modules, composed and shown equal to hpcworker's profile byte for byte |
| `example-modules`, version 1 | beethoven-sites | `test/site-examples/` | the synthetic Example University, composed by the same rule, so every assertion runs once per university |
| `contract`, version 1 | hpcworker | `test/hpcworker/` | the line grammar, the command lines and caps, the credential list and sign-in rule with its cases, the three JSON Schemas, and the vectors hpcworker's real writer printed: every pattern, list and number a module types by hand that the export carries is held equal to it, and every vector is read through the parser that reads it (the standard's rule 4) |
| `registry`, version 1 | beethoven-agents | `test/registry/` | accounts.schema.json, which `accounts.ts` is held to (its keys, its label pattern, its types); usage.schema.json is pinned with it and read by no module |

`test/compose.ts` is the composition rule written again from `module-schema`; it is test code. What the
`contract` and `registry` exports do not carry (a rule held only in prose, a case no vector shows) is
listed in `docs/DESIGN.md`, section 6.1; the tests cover it with lines and files of their own, and
nothing holds those to the export until it carries them. Base takes an import only into a folder of
its own directly under `test/` (`test/<name>`), so no pull can write over the repository's own files;
the boundary test and `interface/pull.sh` both refuse any other folder.

## How an edition takes base

With its own `interface/pull.sh`, never with anything of base's, and from GitHub, never from a
checkout of base. The edition's `interface/INTERFACE.json` names the import, for example desktop's:

```json
{"repository": "OpenSpineConsortium/beethoven-base", "export": "desktop", "version": 1,
 "into": "src/base", "origin": "src/base/ORIGIN"}
```

In desktop, with desktop's own puller:

```
bash interface/pull.sh src/base                 # base's main, through the person's own gh sign-in
bash interface/pull.sh --ref <commit> src/base  # a commit that base's main contains
bash interface/pull.sh --pinned src/base        # exactly what ORIGIN names; refuses if it differs
```

Each edition writes its own puller (the standard says what it must do, not its text), and they
differ. The browser's (beethoven-extension ae11a00) has `--ref` and `--at-origin` and no `--pinned`:
`--at-origin` takes the commit `ORIGIN` names again and writes over the files and `ORIGIN` without
comparing, so only `git diff` shows what changed; and it refuses a folder that does not exist yet, so
`mkdir -p extension/src/base` comes before the first pull. VS Code has no puller until it adopts the
standard (design step 13).

The pull takes only the paths base's `INTERFACE.json` lists for that export at that version, at a
commit base's default branch contains. Every module lands at its path below `src/` in the folder
(`src/links.ts` lands at `src/base/links.ts`; the export check keeps an edition's paths under `src/`,
the folder they all share), and `ORIGIN` records the repository, the commit,
`export <id> <version>` and one `sha256` line per file. The pull never deletes: a module base
dropped from the export is listed for a person to remove in a reviewed commit, and the edition's
test run fails until it is gone.

The edition's own boundary test checks, with no secret and no network, that the folder holds exactly
the files `ORIGIN` lists, byte for byte, and that `ORIGIN` names the export and version the import
names. Its conformance tests then say whether its code still reads what it took.

## What checks this repository

`test/boundary.test.ts`, in `npm test` (so in the gate, before every push, and in CI):

- rule 1: no tracked file reaches another repository's checkout or runs its code: a sibling path,
  written whole or as separate arguments (`'..', 'hpcworker'`), a variable naming a checkout, a clone,
  a submodule, a workflow checking out another repository or running its action or reusable workflow
  (`uses: OpenSpineConsortium/<repository>/...`), a package fetched from GitHub
  (`github:OpenSpineConsortium/...`), a fetched script piped into a shell, a dependency by path or git
  URL, an import of another repository's code, or a link that leads out of the repository or to
  nothing (a link is judged by the path it holds, never read through). Its known list is empty, and
  an entry that no longer matches fails, so it only shrinks;
- rule 2: `INTERFACE.json` has the standard's shape, every export path names a file, an edition's
  export paths stay under `src/`, and every import goes into `test/<name>`;
- rule 3: each import folder holds exactly the files its `ORIGIN` lists, byte for byte, besides
  `ORIGIN` and its own `README.md` and `pull.sh`, with no link in it or on the way to it, and `ORIGIN`
  names the import's repository, a commit, the export and version the import names, and at least one
  file; and every file named `ORIGIN` in the repository is the record of a declared import, so a copy
  taken by hand and never declared fails too (the standard's rule 3 lists only checks of a declared
  import). The check is also proven on throwaway imports of the test's own, and
  `interface/pull.sh` is run whole against a stand-in for `gh` that answers from a folder, so the
  `ORIGIN` it writes is shown to be the one the check reads, and each of its refusals is shown to
  leave everything as it was.

`test/origin.ts` holds the `ORIGIN` check. `interface/pull.sh` is beethoven-desktop's, ported by hand,
with refusals desktop's lacks: an import folder outside `test/<name>`, a link anywhere on the way to a
file it would write, an export file whose name ends in `.part`, and a `.part` file already in the
folder. Like desktop's, an ordinary pull writes over a copied file that was edited and not committed.
