import assert from "node:assert/strict";
import { it } from "node:test";
import { lintDiagnostics } from "./fixtures.js";

it("reports enums and const enums, not unions", (t) => {
  const diagnostics = lintDiagnostics(
    t,
    {
      "color.ts": [
        'export enum Color { Red = "red" }',
        "const enum Size { S }",
        'export type Tone = "light" | "dark";',
        "export const size = Size.S;",
      ].join("\n"),
    },
    ["no-enum"],
  );
  assert.deepEqual(diagnostics.map(({ message }) => message).sort(), [
    "Prefer a string-literal union to the enum Color.",
    "Prefer a string-literal union to the enum Size.",
  ]);
});
