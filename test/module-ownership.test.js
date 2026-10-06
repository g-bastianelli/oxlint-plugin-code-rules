import assert from "node:assert/strict";
import { it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fixture, lint, lintDiagnostics } from "./fixtures.js";

const rules = ["component-ownership", "module-ownership", "test-colocation"];
const orders =
  'import { useOrders } from "./useOrders"; export function Orders() { useOrders(); return <ul/>; }';
const hook = "export function useOrders() { return []; }";

const check = (t, files) => lintDiagnostics(t, files, rules);

it("places a private hook under its only component", (t) => {
  assert.deepEqual(check(t, { "Orders.tsx": orders, "useOrders.ts": hook }), [
    {
      rule: "module-ownership",
      file: "useOrders.ts",
      message: "Review placement of useOrders.ts under Orders/. Consumers: Orders.tsx.",
    },
  ]);
});

it("accepts a hook beside its component inside the owner folder", (t) => {
  assert.deepEqual(check(t, { "Orders/index.tsx": orders, "Orders/useOrders.ts": hook }), []);
});

it("counts type-only imports as ownership of type modules", (t) => {
  const diagnostics = check(t, {
    "Orders/index.tsx":
      'import type { Order } from "../types"; export function Orders(_: { order?: Order }) { return <ul/>; }',
    "types.ts": "export type Order = { id: string };",
  });
  assert.deepEqual(
    diagnostics.map(({ rule, file }) => [rule, file]),
    [["module-ownership", "types.ts"]],
  );
  assert.match(diagnostics[0].message, /under Orders\//);
});

it("moves a module shared by two branches to their common ancestor", (t) => {
  const diagnostics = check(t, {
    "Orders/index.tsx":
      'import { money } from "./money"; export function Orders() { return <b>{money(1)}</b>; }',
    "Billing/index.tsx":
      'import { money } from "../Orders/money"; export function Billing() { return <b>{money(2)}</b>; }',
    "Orders/money.ts": "export const money = (value) => `${value} €`;",
  });
  assert.equal(diagnostics.length, 1);
  assert.match(
    diagnostics[0].message,
    /placement of Orders\/money\.ts under \.\/\. Consumers: Billing\/index\.tsx, Orders\/index\.tsx/,
  );
});

it("lets loose modules act for the unit that contains them", (t) => {
  const diagnostics = check(t, {
    "Table/index.tsx":
      'import { columns } from "./columns"; export function Table() { return <table>{columns}</table>; }',
    "Table/columns.tsx":
      'import { Cell } from "../Cell"; import { width } from "../width"; export const columns = <Cell w={width}/>;',
    "Cell.tsx": "export function Cell() { return <td/>; }",
    "width.ts": "export const width = 3;",
  });
  assert.deepEqual(diagnostics.map(({ file }) => file).sort(), ["Cell.tsx", "width.ts"]);
  for (const diagnostic of diagnostics) assert.match(diagnostic.message, /under Table\//);
});

it("does not let route registries or wiring outside units own code", (t) => {
  assert.deepEqual(
    check(t, {
      "lib/router.ts":
        'import { Route as Home } from "../routes/index"; import { Route as Admin } from "../routes/admin"; export const routes = [Home, Admin];',
      "routes/index.tsx": "export const Route = { component: () => <main/> };",
      "routes/admin.tsx":
        'import { AdminPage } from "../features/AdminPage"; import { client } from "../lib/query"; export const Route = { client, component: AdminPage };',
      "features/AdminPage.tsx": "export function AdminPage() { return <main/>; }",
      "lib/query.ts": "export const client = {};",
    }),
    [],
  );
});

it("treats an encapsulated lowercase folder as the owner of its private modules", (t) => {
  const diagnostics = check(t, {
    "main.ts": 'import { createOrders } from "./orders"; createOrders();',
    "orders/index.ts": 'export { createOrders } from "./service";',
    "orders/service.ts":
      'import { OrderError } from "../errors"; export function createOrders() { return OrderError; }',
    "errors.ts": "export class OrderError extends Error {}",
  });
  assert.deepEqual(
    diagnostics.map(({ file, message }) => [file, message]),
    [["errors.ts", "Review placement of errors.ts under orders/. Consumers: orders/service.ts."]],
  );
});

it("keeps externally consumed modules at their grouping boundary", (t) => {
  const diagnostics = check(t, {
    "Page/index.tsx":
      'import { a } from "../helpers"; import { b } from "../helpers/b"; export function Page() { return <i>{a}{b}</i>; }',
    "helpers/index.ts": "export const a = 1;",
    "helpers/b.ts": "export const b = 2;",
  });
  assert.deepEqual(diagnostics, []);
});

it("checks component folders and accepts named entries nested in their owner", (t) => {
  const leaf = "export function Child() { return <span/>; }";
  const parent = 'import { Child } from "./Child"; export function Parent() { return <Child/>; }';
  assert.deepEqual(
    check(t, { "Parent.tsx": parent, "Child/index.tsx": leaf }).map(({ message }) => message),
    ["Review placement of Child/ under Parent/. Consumers: Parent.tsx."],
  );
  assert.deepEqual(
    check(t, {
      "Parent/Parent.tsx": parent.replace("./Child", "./Child/Child"),
      "Parent/Child/Child.tsx": leaf,
    }),
    [],
  );
});

it("ignores tests and stories as owners", (t) => {
  const diagnostics = check(t, {
    "Orders.tsx": orders,
    "useOrders.ts": hook,
    "useOrders.test.ts": 'import { useOrders } from "./useOrders"; useOrders();',
    "Orders.stories.tsx": 'import { Orders } from "./Orders"; export const Default = <Orders/>;',
  });
  assert.deepEqual(
    diagnostics.map(({ rule, file }) => [rule, file]),
    [["module-ownership", "useOrders.ts"]],
  );
});

it("colocates tests with the module they exercise", (t) => {
  const diagnostics = check(t, {
    "Orders/index.tsx": orders,
    "Orders/useOrders.ts": hook,
    "__tests__/useOrders.test.ts": 'import { useOrders } from "../Orders/useOrders"; useOrders();',
    "Orders/__tests__/index.test.tsx": 'import { Orders } from "../index"; Orders();',
    "Orders/__tests__/useOrders.ts": 'import { useOrders } from "../useOrders"; useOrders();',
    "Billing/__tests__/Orders.test.tsx": 'import { Orders } from "../../Orders"; Orders();',
    "Orders/Orders.stories.tsx":
      'import { Orders } from "./index"; export const Default = <Orders/>;',
  });
  assert.deepEqual(
    diagnostics.map(({ rule, file, message }) => [rule, file, message]),
    [
      [
        "test-colocation",
        "__tests__/useOrders.test.ts",
        "Colocate __tests__/useOrders.test.ts with Orders/useOrders.ts under Orders/.",
      ],
      [
        "test-colocation",
        "Billing/__tests__/Orders.test.tsx",
        "Colocate Billing/__tests__/Orders.test.tsx with Orders/index.tsx under Orders/.",
      ],
    ],
  );
});

it("treats runtime protocol imports such as bun:test as external", (t) => {
  const diagnostics = check(t, {
    "Orders.tsx": orders,
    "useOrders.ts": hook,
    "useOrders.test.ts":
      'import { expect } from "bun:test"; import { useOrders } from "./useOrders"; expect(useOrders());',
  });
  assert.deepEqual(
    diagnostics.map(({ file }) => file),
    ["useOrders.ts"],
  );
});

it("reports an incomplete graph once per enabled rule", (t) => {
  const diagnostics = check(t, {
    "Orders.tsx": orders,
    "useOrders.ts": hook,
    "load.ts": "export const load = (name) => import(name);",
  });
  assert.deepEqual(diagnostics.map(({ rule }) => rule).sort(), [
    "component-ownership",
    "module-ownership",
    "test-colocation",
  ]);
  for (const diagnostic of diagnostics) assert.match(diagnostic.message, /analysis skipped/);
});

it("matches tests to subjects with dotted names", (t) => {
  const diagnostics = check(t, {
    "lib/index.ts": 'export { parse } from "./user.service";',
    "lib/user.ts": "export type User = { id: string };",
    "lib/user.service.ts":
      'import type { User } from "./user"; export const parse = (user: User) => user.id;',
    "user.service.test.ts":
      'import { parse } from "./lib/user.service"; import type { User } from "./lib/user"; parse({ id: "1" } as User);',
  });
  assert.deepEqual(
    diagnostics.map(({ rule, file, message }) => [rule, file, message]),
    [
      [
        "test-colocation",
        "user.service.test.ts",
        "Colocate user.service.test.ts with lib/user.service.ts under lib/.",
      ],
    ],
  );
});

it("does not let a root entry own the modules it wires", (t) => {
  assert.deepEqual(
    check(t, {
      "index.ts": 'import { format } from "./lib/format"; export const run = () => format();',
      "lib/format.ts": "export const format = () => '';",
    }),
    [],
  );
});

it("keeps placing a component whose props type is re-exported", (t) => {
  const diagnostics = check(t, {
    "index.ts": 'export type { ChildProps } from "./Child";',
    "Parent.tsx": 'import { Child } from "./Child"; export function Parent() { return <Child/>; }',
    "Child.tsx":
      "export type ChildProps = {}; export function Child(_: ChildProps) { return <span/>; }",
  });
  assert.deepEqual(
    diagnostics.map(({ rule, file }) => [rule, file]),
    [["component-ownership", "Child.tsx"]],
  );
});

it("protects a type module re-exported as public API", (t) => {
  assert.deepEqual(
    check(t, {
      "index.ts": 'export type { Order } from "./Orders/types";',
      "Orders/index.tsx":
        'import type { Order } from "./types"; export function Orders(_: { order?: Order }) { return <ul/>; }',
      "Orders/types.ts": "export type Order = { id: string };",
      "Billing/index.tsx":
        'import type { Order } from "../Orders/types"; export function Billing(_: { order?: Order }) { return <b/>; }',
    }),
    [],
  );
});

it("never suspends the analysis on type-only links to declaration files", (t) => {
  const diagnostics = check(t, {
    "env.d.ts": "declare const env: { mode: string };",
    "Orders.tsx": `import type { Env } from "./env"; export type { Missing } from "types-only-package"; ${orders}`,
    "useOrders.ts": hook,
  });
  assert.deepEqual(
    diagnostics.map(({ rule, file }) => [rule, file]),
    [["module-ownership", "useOrders.ts"]],
  );
});

it("preserves a kebab-case feature mounted by another feature", (t) => {
  assert.deepEqual(
    check(t, {
      "shell/Workspace/index.tsx":
        'import { Palette } from "../../command-palette/Palette"; export function Workspace() { return <Palette/>; }',
      "command-palette/Palette/index.tsx": "export function Palette() { return <aside/>; }",
    }),
    [],
  );
});

it("checks private components, hooks and types inside a feature", (t) => {
  const diagnostics = check(t, {
    "command-palette/Palette/index.tsx":
      'import { Row } from "../Row"; export function Palette() { return <Row/>; }',
    "command-palette/Row/index.tsx":
      'import { useSearch } from "../use-search"; import type { Item } from "../item.types"; export function Row(_: { item?: Item }) { useSearch(); return <span/>; }',
    "command-palette/use-search.ts": "export function useSearch() { return []; }",
    "command-palette/item.types.ts": "export type Item = { id: string };",
  });
  assert.equal(diagnostics.length, 3);
  assert.match(
    diagnostics.find(({ file }) => file.endsWith("Row/index.tsx")).message,
    /under command-palette\/Palette\//,
  );
  for (const file of ["use-search.ts", "item.types.ts"])
    assert.match(
      diagnostics.find((diagnostic) => diagnostic.file.endsWith(file)).message,
      /under command-palette\/Row\//,
    );
});

it("hoists cross-boundary dependencies to the grouping root instead of outside it", (t) => {
  const diagnostics = check(t, {
    "shell/Page/index.tsx":
      'import { Shared } from "../../feature/Inner/Shared"; export function Page() { return <Shared/>; }',
    "feature/Inner/index.tsx":
      'import { Shared } from "./Shared"; export function Inner() { return <Shared/>; }',
    "feature/Inner/Shared.tsx": "export function Shared() { return <span/>; }",
  });
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /under feature\//);
});

it("preserves nested kebab-case groups and still checks their private descendants", (t) => {
  const diagnostics = check(t, {
    "feature/Editor/index.tsx":
      'import { Row } from "./condition-clauses/Row"; export function Editor() { return <Row/>; }',
    "feature/Editor/condition-clauses/Row/index.tsx":
      'import { value } from "../value"; export function Row() { return <span>{value}</span>; }',
    "feature/Editor/condition-clauses/value.ts": "export const value = 1;",
  });
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /under feature\/Editor\/condition-clauses\/Row\//);
});

it("preserves lowercase module entry folders without disabling test colocation", (t) => {
  const diagnostics = check(t, {
    "Page/index.tsx":
      'import { value } from "../data-access"; export function Page() { return <span>{value}</span>; }',
    "data-access/index.ts": "export const value = 1;",
    "index.test.ts": 'import { value } from "./data-access"; value;',
    "data-access.test.ts": 'import { value } from "./data-access"; value;',
  });
  assert.deepEqual(
    diagnostics.map(({ rule, file }) => [rule, file]),
    [["test-colocation", "data-access.test.ts"]],
  );
});

it("keeps wiring outside units inert across a grouping boundary", (t) => {
  assert.deepEqual(
    check(t, {
      "lib/router.ts": 'import { Route } from "../routes/admin"; export const routes = [Route];',
      "routes/admin.tsx":
        'import { AdminPage } from "../features/Admin/Inner/AdminPage"; export const Route = { component: AdminPage };',
      "features/Admin/index.tsx":
        'import { Inner } from "./Inner"; export function Admin() { return <Inner/>; }',
      "features/Admin/Inner/index.tsx": "export function Inner() { return <section/>; }",
      "features/Admin/Inner/AdminPage.tsx": "export function AdminPage() { return <main/>; }",
      "scripts/update.ts": 'import { input } from "../codegen/Gen/input"; console.log(input);',
      "codegen/Gen/index.ts": "export const gen = () => 1;",
      "codegen/Gen/input.ts": "export const input = 1;",
    }),
    [],
  );
});

it("treats underscore-prefixed folders as groupings", (t) => {
  assert.deepEqual(
    check(t, {
      "Panel/index.tsx":
        'import { A } from "./A"; import { B } from "./B"; export function Panel() { return <><A/><B/></>; }',
      "Panel/A.tsx":
        'import { label } from "./_shared/label"; export function A() { return <b>{label}</b>; }',
      "Panel/B.tsx":
        'import { label } from "./_shared/label"; export function B() { return <i>{label}</i>; }',
      "Panel/_shared/label.ts": "export const label = 'x';",
    }),
    [],
  );
});

it("treats fixture, mock and snapshot folders as test support", (t) => {
  assert.deepEqual(
    check(t, {
      "Orders/index.tsx":
        'import { orders } from "../__mocks__/orders"; export function Orders() { return <ul>{orders}</ul>; }',
      "__mocks__/orders.ts": "export const orders = [];",
      "schema.ts": "export const schema = 1;",
      "__fixtures__/schema.ts":
        'import { schema } from "../schema"; export const fixture = schema;',
    }),
    [],
  );
});

it("recognizes e2e and bench suffixes as tests", (t) => {
  assert.deepEqual(
    check(t, {
      "Orders/index.tsx": "export function Orders() { return <ul/>; }",
      "Orders/format.ts": "export const format = () => '';",
      "format.bench.ts": 'import { format } from "./Orders/format"; format();',
      "Orders.e2e.ts": 'import { Orders } from "./Orders"; Orders();',
    }).map(({ rule, file }) => [rule, file]),
    [
      ["test-colocation", "format.bench.ts"],
      ["test-colocation", "Orders.e2e.ts"],
    ],
  );
});

it("summarizes long consumer lists", (t) => {
  const files = { "A/shared.ts": "export const shared = 1;" };
  for (const name of ["A", "B", "C", "D", "E"])
    files[`${name}/index.tsx`] =
      `import { shared } from "../A/shared"; export function ${name}() { return <b>{shared}</b>; }`;
  assert.deepEqual(
    check(t, files).map(({ message }) => message),
    [
      "Review placement of A/shared.ts under ./. Consumers: A/index.tsx, B/index.tsx, C/index.tsx and 2 more.",
    ],
  );
});

it("infers the package src root when root is omitted", (t) => {
  const project = fixture({ "Orders.tsx": orders, "useOrders.ts": hook }, {}, {}, rules);
  t.after(project.cleanup);
  assert.deepEqual(lintWithoutRoot(project), ["src/useOrders.ts"]);
});

it("skips files whose nearest package is a workspace root without src", (t) => {
  const project = fixture(
    {
      "Orders.tsx": orders,
      "useOrders.ts": hook,
      "mono/package.json": JSON.stringify({ private: true, workspaces: ["packages/*"] }),
      "mono/App/index.tsx":
        'import { Widget } from "../Widget"; export function App() { return <Widget/>; }',
      "mono/Widget.tsx": "export function Widget() { return <span/>; }",
    },
    {},
    {},
    rules,
  );
  t.after(project.cleanup);
  assert.deepEqual(lintWithoutRoot(project), ["src/useOrders.ts"]);
});

function lintWithoutRoot(project) {
  const config = JSON.parse(fs.readFileSync(path.join(project.directory, "custom.json"), "utf8"));
  for (const rule of Object.keys(config.rules)) config.rules[rule] = "warn";
  fs.writeFileSync(path.join(project.directory, "auto.json"), JSON.stringify(config));
  return lint(project, "auto").diagnostics.map((diagnostic) => diagnostic.filename);
}
