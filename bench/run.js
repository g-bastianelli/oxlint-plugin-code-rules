import assert from "node:assert/strict";
import fs from "node:fs";
import { branchedTree, fixture, lint } from "../test/fixtures.js";

const files = {};
for (let i = 0; i < 100; i++) Object.assign(files, branchedTree(`Tree${i}`));
const project = fixture(files, {}, {}, [
  "component-ownership",
  "module-ownership",
  "test-colocation",
  "no-deep-import",
  "declarative-entry",
  "no-nested-jsx-map",
  "no-catch-all-module",
  "no-enum",
]);
try {
  const samples = { base: [], custom: [] };
  for (let i = 0; i < 6; i++) {
    for (const kind of i % 2 ? ["custom", "base"] : ["base", "custom"]) {
      const result = lint(project, kind);
      assert.equal(result.number_of_files, 6400);
      assert.deepEqual(result.diagnostics, []);
      if (i > 0) samples[kind].push(result.milliseconds);
    }
  }
  const medians = Object.fromEntries(
    Object.entries(samples).map(([kind, values]) => [kind, [...values].sort((a, b) => a - b)[2]]),
  );
  const result = {
    files: 6400,
    componentLevels: 6,
    rules: [
      "component-ownership",
      "module-ownership",
      "test-colocation",
      "no-deep-import",
      "declarative-entry",
      "no-nested-jsx-map",
      "no-catch-all-module",
      "no-enum",
    ],
    samples,
    medians,
    overheadMs: medians.custom - medians.base,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
  };
  fs.writeFileSync(
    new URL("results.json", import.meta.url),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(JSON.stringify(result, null, 2));
  assert.ok(
    medians.custom < 1000,
    `Median ${medians.custom.toFixed(0)}ms exceeds the local 1000ms budget`,
  );
} finally {
  project.cleanup();
}
