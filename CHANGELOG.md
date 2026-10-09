# Changelog

## 0.4.0

### Added

- `no-deep-import`: component folders with an entry point, and lowercase folders
  whose `index` re-exports their contents, must be imported through that entry.
  Imports, re-exports and literal `import()` calls into other files are reported,
  naming the outermost boundary being crossed.
- `declarative-entry`: an `index.ts` must contain no control flow, calls or `await`
  at module load. A package's root `index` without an `exports` field is a program
  and is exempt.
- `no-nested-jsx-map`: no `.map` inside another `.map` callback in rendered JSX.
- `no-catch-all-module`: no modules named `utils`, `helpers`, `misc` or `common`,
  either alone or as a suffix. Supports `names` and `allow` options.
- `no-enum`: no `enum` declarations, including `const enum`.

### Changed

- Root detection and manifest loading are shared across all rules (`src/locate.js`).

## 0.3.0

### Added

- Lowercase folders (kebab-case or prefixed with `_`) define grouping boundaries.
  An outside consumer counts at the grouping root and does not pull the feature
  into its own folder. A nested file used from outside moves up to that root.
  PascalCase folders remain subject to ownership.
- `root` is optional: by default, each file is analyzed within the nearest
  package's `src/`. Workspace roots without `src/` are skipped. One configuration
  covers a monorepo.
- `__fixtures__/`, `__mocks__/` and `__snapshots__/` are treated like `__tests__/`;
  `.e2e.` and `.bench.` suffixes are treated as tests.

### Changed

- For more than four consumers, diagnostics list three and count the rest.
- The graph cache grows from 8 to 64 roots.

### Fixed

- Wiring outside an ownership unit (routes, scripts) remains inert even across
  grouping boundaries.

## 0.2.0

### Added

- `module-ownership`: places hooks, types, helpers and module folders under their
  owner, or at their consumers' nearest common ancestor. Type imports count
  toward ownership.
- `test-colocation`: places tests and stories beside their subject, or in its
  `__tests__/` subfolder.
- A shared ownership-unit model for all three rules: components, component
  folders, encapsulated module folders and standalone modules acting for their
  containing unit. Registries outside a unit (file-based routes, application
  wiring) no longer own code.

### Changed

- `component-ownership` also checks component folders (`Child/index.tsx`).
- Tests and stories no longer block component analysis: they are no longer
  counted as consumers.
- Diagnostics name the affected file or folder:
  `Review placement of Child.tsx under Parent/.`
- Incomplete-analysis diagnostics are emitted once per enabled rule.

### Fixed

- Protocol specifiers (`bun:test`, `cloudflare:`, `virtual:`) no longer suspend
  analysis.
- A correctly nested `Parent/Child/Child.tsx` component is no longer reported.
- Type imports or re-exports targeting declaration files or packages without
  code no longer suspend analysis.
- `export type` protects only type modules, not components declaring those types.

### Performance

- File resolution is shared across rules: all three rules together cost as much
  as `component-ownership` alone in 0.1.1.

## 0.1.1

- Resolve conditional package `exports` for ESM imports only.
- Recognize `Orders/Orders.tsx` as the owner of `Orders/`.
- Do not infer an owner from non-PascalCase JSX modules.

## 0.1.0

- Initial release with `component-ownership`.
