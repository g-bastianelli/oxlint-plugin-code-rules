# Agent instructions

## Project

Code Rules (`oxlint-plugin-code-rules`) is an ESM JavaScript plugin for Oxlint.
It checks import-graph ownership, test colocation and module boundaries for React
and TypeScript projects. Read `README.md` for rule behavior and limitations.

## Conventions

- Write documentation, comments, diagnostics, test descriptions and release notes
  in English. Keep all repository content in English.
- Make the smallest complete change. Reuse existing helpers and avoid adding
  dependencies or abstractions without a concrete need.
- Keep implementation in JavaScript with native ESM; no build step is required.
- Use named exports internally. The default export in `src/index.js` is required
  by Oxlint's plugin format.
- Add rules separately under `src/rules/` and register them in `src/index.js`.
  Rules are opt-in; do not enable them implicitly or duplicate native Oxlint rules.
- Keep graph analysis shared through `src/ownership-graph.js`, `src/graph-cache.js`
  and `src/ownership-rule.js`. Reuse root detection in `src/locate.js`.
- Preserve incomplete-analysis diagnostics, public export protection and cycle
  handling. Placement rules report suggestions without moving files or rewriting
  imports.

## Verification

Install dependencies with `bun install --frozen-lockfile --ignore-scripts`.
Run the repository's Moon tasks after changes:

```sh
moon run code-rules:lint code-rules:test code-rules:format
```

Use `moon run code-rules:format-write` to format files. Run
`moon run code-rules:benchmark` when changing graph analysis, caching or engine
versions. State which checks ran and which remain unverified.

Tests use `node:test`, Oxlint's `RuleTester` and the real Oxlint binary. Reuse
`test/fixtures.js`; temporary fixtures must be cleaned up. Cover behavior changes
with focused tests. The packaging test verifies archive installation and loading
by package name. Node 20 skips the RuleTester suite; Node 22 or newer runs it.

## Documentation and releases

- Keep the rule list, configuration examples and limitations in `README.md`
  consistent with the implementation. Record release changes in `CHANGELOG.md`.
- Keep `package.json` and `src/index.js` versions synchronized.
- A pushed `v<version>` tag triggers npm publishing and a GitHub release. Only
  publish or push a release tag when the user requests it.
- `CLAUDE.md` is a relative symlink to this file. Maintain instructions here so
  Codex and Claude read the same source.
