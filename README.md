# beethoven-base

The shared parsers and rules of the three Beethoven editions (beethoven-desktop, the
beethoven-extension browser edition and beethoven-vscode). It is a small, pure TypeScript library
with no UI, no I/O and no dependencies.

It is a sealed unit under the ecosystem's interface standard. What it offers is listed in one place,
`interface/INTERFACE.json`: one export per edition (`desktop` and `browser` today, `vscode` from
design step 9), each the modules that edition takes, with an integer version. Each edition takes its
export with its own `interface/pull.sh`, from GitHub at a commit base's `main` contains, and checks
the copy against its `ORIGIN` record in its own tests, with no secret. No tool of base's runs in an
edition, and base reads only what an edition publishes: from design step 14, the lag report reads
each edition's `interface/INTERFACE.json`, the manifest the standard makes machine-readable. The
direction is one way: hpcworker, which is canonical for everything the grid writes, then base, then
the editions.

- `interface/README.md`: what base offers and takes, and how an edition takes it.
- `docs/DESIGN.md`: the design, with the decision record in section 12.
- `CLAUDE.md`: the rules, the source rules, and how to build and test.

```
npm ci && npm run gate
```

The first module is `src/profile.ts`, the reader of a deployment's site profile (Linear BEE-218);
the others arrive with design step 9.

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are
Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher.
Private and proprietary: OpenSpineConsortium.
