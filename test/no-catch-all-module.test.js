import assert from "node:assert/strict";
import { it } from "node:test";
import { lintDiagnostics } from "./fixtures.js";

const rules = ["no-catch-all-module"];

it("reports catch-all module names, alone or as a suffix, but not their tests", (t) => {
  const diagnostics = lintDiagnostics(
    t,
    {
      "utils.ts": "export const a = 1;",
      "string-helpers.ts": "export const b = 1;",
      "orders/common.ts": "export const c = 1;",
      "helpers.test.ts": 'import { b } from "./string-helpers"; b;',
    },
    rules,
  );
  assert.deepEqual(
    diagnostics.map(({ file, message }) => [file, message]),
    [
      ["orders/common.ts", "Name common.ts after its one responsibility: 'common' is a catch-all."],
      [
        "string-helpers.ts",
        "Name string-helpers.ts after its one responsibility: 'string-helpers' is a catch-all.",
      ],
      ["utils.ts", "Name utils.ts after its one responsibility: 'utils' is a catch-all."],
    ],
  );
});

it("honors allowed path suffixes and custom names", (t) => {
  assert.deepEqual(
    lintDiagnostics(
      t,
      { "lib/utils.ts": "export const cn = 1;", "shared.ts": "export const s = 1;" },
      { "no-catch-all-module": ["warn", { allow: ["lib/utils.ts"] }] },
    ),
    [],
  );
  assert.deepEqual(
    lintDiagnostics(
      t,
      { "shared.ts": "export const s = 1;", "utils.ts": "export const u = 1;" },
      { "no-catch-all-module": ["warn", { names: ["shared"] }] },
    ).map(({ file }) => file),
    ["shared.ts"],
  );
});
