# beethoven-base

The shared parsers and rules of the three Beethoven editions (beethoven-desktop, the
beethoven-extension browser edition and beethoven-vscode). It is a small, pure TypeScript library
with no UI, no I/O and no dependencies.

Each edition takes only the modules on its own list (`editions/<name>.json`) as a pinned copy inside
its source root. A check with no secret compares that copy against an `ORIGIN` record. The
direction is one way: hpcworker, which is canonical for everything the grid writes, then base, then
the editions.

- `docs/DESIGN.md`: the design, with the decision record in section 12.
- `CLAUDE.md`: the rules, the source rules, how an edition takes base, and how to build and test.

```
npm ci && npm run gate
node tools/vendor.mjs vendor --into <edition checkout> --edition <desktop|browser|vscode>
```

The modules arrive in pull request #2. This one is the skeleton.

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are
Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher.
Private and proprietary: OpenSpineConsortium.
