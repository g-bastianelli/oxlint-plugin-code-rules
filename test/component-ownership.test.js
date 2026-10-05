import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { RuleTester } from "oxlint/plugins-dev";
import { componentOwnership } from "../src/rules/component-ownership.js";
import { fixture, lint, branchedTree, writeFiles } from "./fixtures.js";

const leaf = "export function Child() { return <span/>; }";
const flat = {
  "Parent.tsx": 'import { Child } from "./Child"; export function Parent() { return <Child/>; }',
  "Child.tsx": leaf,
};

function project(t, files, manifest, tsconfig) {
  const result = fixture(files, manifest, tsconfig);
  t.after(() => result.cleanup());
  return result;
}

it("loads the packaged rule in Oxlint and reports the concrete owner", (t) => {
  const result = lint(project(t, flat));
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0].message, /under Parent\/.*Parent.tsx/);
  assert.match(result.diagnostics[0].code, /component-ownership/);
});

it("accepts a private nested component", (t) => {
  const files = { "Parent/index.tsx": flat["Parent.tsx"], "Parent/Child.tsx": leaf };
  assert.deepEqual(lint(project(t, files)).diagnostics, []);
});

it("does not flag a PascalCase utility without JSX", (t) => {
  assert.deepEqual(
    lint(project(t, { ...flat, "Child.tsx": "export const Child = 1;" })).diagnostics,
    [],
  );
});

it("handles JSX fragments and JSX files", (t) => {
  const result = lint(
    project(t, {
      "Parent.jsx":
        'import { Child } from "./Child"; export function Parent() { return <Child/>; }',
      "Child.jsx": "export function Child() { return <>hi</>; }",
    }),
  );
  assert.equal(result.diagnostics.length, 1);
});

it("does not infer placement for unused components or type-only consumers", (t) => {
  assert.deepEqual(
    lint(project(t, { "Parent.tsx": 'import type { Child } from "./Child";', "Child.tsx": leaf }))
      .diagnostics,
    [],
  );
});

it("retains public package exports, including nested conditional wildcards", (t) => {
  for (const exports of [{ ".": "./src/Child.tsx" }, { "./*": { import: "./src/*.tsx" } }]) {
    assert.deepEqual(lint(project(t, flat, { exports })).diagnostics, []);
  }
});

it("does not suggest moves through a public re-export", (t) => {
  assert.deepEqual(
    lint(project(t, { ...flat, "index.ts": 'export { Child } from "./Child";' })).diagnostics,
    [],
  );
});

it("resolves tsconfig aliases and .js imports of TypeScript files", (t) => {
  for (const specifier of ["@app/Child", "./Child.js"]) {
    const p = project(
      t,
      { ...flat, "Parent.tsx": flat["Parent.tsx"].replace("./Child", specifier) },
      {},
      { compilerOptions: { baseUrl: ".", paths: { "@app/*": ["src/*"] } } },
    );
    const result = lint(p);
    assert.equal(result.diagnostics.length, 1);
    assert.match(result.diagnostics[0].message, /under Parent\//);
  }
});

it("counts literal dynamic imports as consumers", (t) => {
  const p = project(t, {
    ...flat,
    "Other.tsx": 'const Child = import("./Child"); export function Other() { return <span/>; }',
  });
  assert.deepEqual(lint(p).diagnostics, []);
});

it("reports incomplete analysis for non-literal imports, unresolved aliases, glob imports, and parse failures", (t) => {
  for (const source of [
    "const x = import(target);",
    'import { Other } from "@app/missing";',
    'const x = import.meta.glob("./*.tsx");',
    "const = ;",
  ]) {
    const result = lint(
      project(t, { ...flat, "Extra.ts": source }),
      "custom",
      [],
      source === "const = ;" ? 1 : 0,
    );
    const own = result.diagnostics.filter((d) => d.code?.includes("component-ownership"));
    assert.equal(own.length, 1);
    assert.match(own[0].message, /analysis skipped/);
    assert.ok(!own.some((d) => d.message.includes("Review placement")));
  }
});

it("skips cyclic components instead of suggesting mutually nested folders", (t) => {
  const files = {
    ...flat,
    "Child.tsx": 'import { Parent } from "./Parent"; export function Child() { return <Parent/>; }',
  };
  assert.deepEqual(lint(project(t, files)).diagnostics, []);
});

it("converges from a flat chain to five nested levels", (t) => {
  const names = ["Page", "Table", "Row", "Menu", "Action"];
  for (let step = 0; step < names.length; step++) {
    const locations = names.map((name, i) =>
      i < step
        ? `${names.slice(0, i + 1).join("/")}/index.tsx`
        : [...names.slice(0, step), `${name}.tsx`].join("/"),
    );
    const files = {};
    for (const [i, filename] of locations.entries()) {
      let source = "export function View() { return <span/>; }";
      if (i + 1 < locations.length) {
        const relative = path.posix
          .relative(path.posix.dirname(filename), locations[i + 1])
          .replace(/\.tsx$/, "");
        source = `import { View as Child } from ${JSON.stringify(relative.startsWith(".") ? relative : `./${relative}`)}; export function View() { return <Child/>; }`;
      }
      files[filename] = source;
    }
    assert.equal(lint(project(t, files)).diagnostics.length, 4 - step);
  }
});

it("accepts six-level branches and moves a misplaced shared leaf to the distant common ancestor", (t) => {
  assert.deepEqual(lint(project(t, branchedTree("Page"))).diagnostics, []);
  const result = lint(project(t, branchedTree("Page", true)));
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0].message, /under Page\//);
});

it("uses an intermediate common ancestor instead of the root", (t) => {
  const files = branchedTree("Page");
  files["Page/Left/Left/Left/LocalBadge.tsx"] = leaf;
  for (const filename of [
    "Page/Left/Left/Left/Right/Left.tsx",
    "Page/Left/Left/Right/Left/Right.tsx",
  ]) {
    const relative = path.posix.relative(
      path.posix.dirname(filename),
      "Page/Left/Left/Left/LocalBadge",
    );
    files[filename] =
      `import { Child } from "${relative}"; export function View() { return <Child/>; }`;
  }
  const result = lint(project(t, files));
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0].message, /under Page\/Left\/Left\//);
});

it("honors Oxlint inline suppression and never autofixes files", (t) => {
  const p = project(t, {
    ...flat,
    "Child.tsx": `/* oxlint-disable code-rules/component-ownership */\n${leaf}`,
  });
  assert.deepEqual(lint(p).diagnostics, []);
  writeFiles(p.root, { "Child.tsx": leaf });
  assert.equal(lint(p, "custom", ["--fix"]).diagnostics.length, 1);
  assert.equal(fs.readFileSync(path.join(p.root, "Child.tsx"), "utf8"), leaf);
});

// Oxlint's RuleTester needs Node 22+; the CLI tests above still cover Node 20.
const ruleTesterSkip =
  Number(process.versions.node.split(".")[0]) < 22 && "Oxlint RuleTester requires Node 22+";
RuleTester.describe = (name, fn) => describe(name, { skip: ruleTesterSkip }, fn);
RuleTester.it = it;
const testerProject = fixture(flat);
process.on("exit", () => testerProject.cleanup());
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "tsx" } } });
tester.run("component-ownership", componentOwnership, {
  valid: [
    {
      code: "export const Child = 1;",
      filename: path.join(testerProject.root, "Child.tsx"),
      options: [{ root: testerProject.root }],
    },
  ],
  invalid: [
    {
      code: leaf,
      filename: path.join(testerProject.root, "Child.tsx"),
      options: [{ root: testerProject.root }],
      errors: [{ messageId: "placement" }],
    },
  ],
});
