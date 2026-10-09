# beethoven-base

The shared parsers and rules of the three Beethoven editions (beethoven-desktop, the
beethoven-extension browser edition and beethoven-vscode). It is a small, pure TypeScript library
with no UI, no I/O and no dependencies.

It is a sealed unit under the ecosystem's interface standard. What it offers is listed in one place,
`interface/INTERFACE.json`: one export per edition (`desktop`, `browser` and `vscode`), each the
modules that edition takes, with an integer version. Each edition takes its export with its own
`interface/pull.sh`, from GitHub at a commit base's `main` contains, and checks the copy against its
`ORIGIN` record in its own tests, with no secret. No tool of base's runs in an edition, and base
reads only what an edition publishes: from design step 14, the lag report reads each edition's
`interface/INTERFACE.json`, the manifest the standard makes machine-readable. The direction is one
way: hpcworker, which is canonical for everything the grid writes, then base, then the editions.

- `interface/README.md`: what base offers and takes, and how an edition takes it.
- `docs/DESIGN.md`: the design, with the decision record in section 12.
- `CLAUDE.md`: the rules, the source rules, and how to build and test.

```
npm ci && npm run gate
```

Its thirteen modules (`profile.ts` before design step 9, the other twelve at it): `links.ts` (the
Claude Code link shapes), `steps.ts` (the `HPCW-STEP` lines and progress.log), `status.ts`
(status.json, connection.json and the worker's status line), `gate.ts` (the gate's lines and
answers), `run.ts` (staleness and which link to open), `meaning.ts` (each failure's next step, as a
code), `profile.ts` (the site profile reader, Linear BEE-218), `redact.ts`, `signin.ts` (the
subscription sign-in rule), `strip.ts` (the variables taken away before Claude Code starts),
`accounts.ts` (the engine's account list), `sshopts.ts` (the ssh options and the host key
comparison) and `diagnostics.ts` (the check engine). What each edition takes, and what changes for
its students when it does, are in `interface/README.md` and `docs/DESIGN.md`, section 15.

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are
Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher.
Private and proprietary: OpenSpineConsortium.
