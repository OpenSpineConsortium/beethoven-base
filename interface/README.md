# What beethoven-base offers and takes

This repository is one sealed unit of the Beethoven ecosystem (the interface standard:
https://github.com/OpenSpineConsortium/beethoven/blob/main/INTERFACES.md). `INTERFACE.json` lists
what it offers other repositories and what it takes from them; everything not listed is private and
may change in any pull request.

## What it offers

Nothing yet: `exports` is empty, because the skeleton has no module (`src/index.ts` is a placeholder
no export lists). The modules arrive with design step 9 (`docs/DESIGN.md`, section 10) as three
exports:

| Export | Kind | Paths | Taken by |
| --- | --- | --- | --- |
| `desktop` | files | each module desktop takes, one path per module under `src/` | beethoven-desktop, into `src/base` |
| `browser` | files | each module the browser edition takes | beethoven-extension, into `extension/src/base` |
| `vscode` | files | each module VS Code takes | beethoven-vscode, into `extension/src/base` |

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
not a compile of it: the typecheck lanes compile all of `src/` together, never one export alone.

## What it takes

Nothing yet: `imports` is empty. Step 9 adds hpcworker's `contract` export, version 1, into
`test/hpcworker/`: the schemas, the line grammar, the rules and the vectors hpcworker's real writer
produced, which base's parsers are tested against. It is test data and is in no export. Base takes an
import only into a folder of its own directly under `test/` (`test/<name>`), so no pull can write over
the repository's own files; the boundary test and `interface/pull.sh` both refuse any other folder.

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
  import). While base takes nothing, the check is proven on a throwaway import, and
  `interface/pull.sh` is run whole against a stand-in for `gh` that answers from a folder, so the
  `ORIGIN` it writes is shown to be the one the check reads, and each of its refusals is shown to
  leave everything as it was.

`test/origin.ts` holds the `ORIGIN` check. `interface/pull.sh` is beethoven-desktop's, ported by hand,
with refusals desktop's lacks: an import folder outside `test/<name>`, a link anywhere on the way to a
file it would write, an export file whose name ends in `.part`, and a `.part` file already in the
folder. Like desktop's, an ordinary pull writes over a copied file that was edited and not committed.
