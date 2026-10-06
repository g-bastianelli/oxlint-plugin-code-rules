import assert from "node:assert/strict";
import { it } from "node:test";
import { lintDiagnostics } from "./fixtures.js";

const rules = ["declarative-entry"];
const library = { exports: { ".": "./src/index.ts" } };

it("reports control flow anywhere and calls or awaits at module load in a library index.ts", (t) => {
  const diagnostics = lintDiagnostics(
    t,
    {
      "orders/index.ts": [
        'import { a } from "./a";',
        "if (a) console.log(a);",
        "main();",
        "export const config = await load();",
        "export function run() { for (const x of [a]) console.log(x); }",
        "function main() {}",
        "function load() { return Promise.resolve(1); }",
      ].join("\n"),
      "orders/a.ts": "export const a = 1;",
    },
    rules,
    library,
  );
  assert.deepEqual(diagnostics.map(({ message }) => message).sort(), [
    "index.ts is a declarative entry: move this await at module load into a named module.",
    "index.ts is a declarative entry: move this call at module load into a named module.",
    "index.ts is a declarative entry: move this for…of loop into a named module.",
    "index.ts is a declarative entry: move this if statement into a named module.",
  ]);
});

it("accepts re-exports, declarative composition and thin factories", (t) => {
  assert.deepEqual(
    lintDiagnostics(
      t,
      {
        "orders/index.ts": [
          'export { createOrders } from "./service";',
          'export type { Order } from "./types";',
          'import { createOrders } from "./service";',
          'import { createRouter } from "./router";',
          'import { routes } from "./routes";',
          "export const router = createRouter({ routes });",
          "export function makeOrders(deps: object) { return createOrders(deps); }",
        ].join("\n"),
        "orders/service.ts": "export function createOrders(deps: object) { return deps; }",
        "orders/router.ts": "export function createRouter(options: object) { return options; }",
        "orders/routes.ts": "export const routes = [];",
        "orders/types.ts": "export type Order = { id: string };",
      },
      rules,
      library,
    ),
    [],
  );
});

it("skips the root index of a program and checks the root index of a library", (t) => {
  const files = {
    "index.ts":
      'import { env } from "./env";\nif (!env) throw new Error("missing env");\nexport {};',
    "env.ts": "export const env = 1;",
  };
  assert.deepEqual(lintDiagnostics(t, files, rules, { private: true }), []);
  assert.equal(lintDiagnostics(t, files, rules, library).length, 2);
});

it("leaves index.tsx components alone", (t) => {
  assert.deepEqual(
    lintDiagnostics(
      t,
      {
        "Orders/index.tsx":
          "export function Orders({ items }: { items: string[] }) { if (!items.length) return null; return <ul/>; }",
      },
      rules,
      library,
    ),
    [],
  );
});
