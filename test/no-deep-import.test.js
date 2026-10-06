import assert from "node:assert/strict";
import { it } from "node:test";
import { lintDiagnostics } from "./fixtures.js";

const rules = ["no-deep-import"];
const table = {
  "Table/index.tsx": 'import { Row } from "./Row"; export function Table() { return <Row/>; }',
  "Table/Row.tsx": "export function Row() { return <tr/>; }",
};

it("reports imports that bypass a component folder's entry", (t) => {
  const diagnostics = lintDiagnostics(
    t,
    {
      ...table,
      "Report.tsx":
        'import { Row } from "./Table/Row"; export function Report() { return <Row/>; }',
    },
    rules,
  );
  assert.deepEqual(
    diagnostics.map(({ file, message }) => [file, message]),
    [["Report.tsx", "Import Table/ through its entry Table/index.tsx instead of Table/Row.tsx."]],
  );
});

it("reports module folders with an index and names the outermost entry to cross", (t) => {
  const diagnostics = lintDiagnostics(
    t,
    {
      "orders/index.ts": 'export { createOrders } from "./service";',
      "orders/service.ts":
        'import { parse } from "./parsing/codec"; export function createOrders() { return parse; }',
      "orders/parsing/index.ts": 'export { parse } from "./codec";',
      "orders/parsing/codec.ts": "export const parse = () => 1;",
      "main.ts":
        'import { parse } from "./orders/parsing/codec"; import { createOrders } from "./orders"; parse(); createOrders();',
    },
    rules,
  );
  assert.deepEqual(
    diagnostics.map(({ file, message }) => [file, message]),
    [
      [
        "main.ts",
        "Import orders/ through its entry orders/index.ts instead of orders/parsing/codec.ts.",
      ],
      [
        "orders/service.ts",
        "Import orders/parsing/ through its entry orders/parsing/index.ts instead of orders/parsing/codec.ts.",
      ],
    ],
  );
});

it("allows the entry itself, descendants and folders without an entry", (t) => {
  assert.deepEqual(
    lintDiagnostics(
      t,
      {
        "Table/index.tsx":
          'import { Row } from "./Row"; import { cell } from "./cells/format"; export function Table() { return <Row>{cell}</Row>; }',
        "Table/Row.tsx":
          'import { cell } from "./cells/format"; export function Row() { return <tr>{cell}</tr>; }',
        "Table/cells/format.ts": "export const cell = 1;",
        "Report.tsx":
          'import { Table } from "./Table"; import { money } from "./lib/money"; export function Report() { return <Table>{money}</Table>; }',
        "lib/money.ts": "export const money = 1;",
      },
      rules,
    ),
    [],
  );
});

it("reports re-exports and literal dynamic imports that reach inside a folder", (t) => {
  const diagnostics = lintDiagnostics(
    t,
    {
      ...table,
      "index.ts":
        'export { Row } from "./Table/Row"; export const lazy = () => import("./Table/Row");',
    },
    rules,
  );
  assert.deepEqual(
    diagnostics.map(({ message }) => message),
    [
      "Import Table/ through its entry Table/index.tsx instead of Table/Row.tsx.",
      "Import Table/ through its entry Table/index.tsx instead of Table/Row.tsx.",
    ],
  );
});

it("does not report tests that reach into the unit they exercise", (t) => {
  assert.deepEqual(
    lintDiagnostics(
      t,
      { ...table, "Table.test.tsx": 'import { Row } from "./Table/Row"; Row();' },
      rules,
    ),
    [],
  );
});

it("treats a lowercase folder as a façade only when its index re-exports from inside", (t) => {
  assert.deepEqual(
    lintDiagnostics(
      t,
      {
        "routes/index.tsx":
          'import { layout } from "./_layout"; export const Route = { parent: layout, path: "/" };',
        "routes/_layout.tsx": 'export const layout = { path: "" };',
        "routes/admin.tsx": 'export const Route = { path: "/admin" };',
        "lib/router.ts":
          'import { Route as index } from "../routes/index"; import { Route as admin } from "../routes/admin"; export const routes = [index, admin];',
      },
      rules,
    ),
    [],
  );
});

it("ignores test support files behind a façade", (t) => {
  assert.deepEqual(
    lintDiagnostics(
      t,
      {
        "codegen/index.ts": 'export { generate } from "./generate";',
        "codegen/generate.ts": "export const generate = () => 1;",
        "codegen/__fixtures__/input.ts": "export const input = 1;",
        "scripts/update.ts":
          'import { input } from "../codegen/__fixtures__/input"; console.log(input);',
      },
      rules,
    ),
    [],
  );
});
