import assert from "node:assert/strict";
import { it } from "node:test";
import { lintDiagnostics } from "./fixtures.js";

const rules = ["no-nested-jsx-map"];

it("reports a .map rendered inside the callback of another .map", (t) => {
  const diagnostics = lintDiagnostics(
    t,
    {
      "Table.tsx":
        "export function Table({ rows }: { rows: { id: string; cells: string[] }[] }) { return <table>{rows.map((row) => <tr key={row.id}>{row.cells.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</table>; }",
    },
    rules,
  );
  assert.deepEqual(
    diagnostics.map(({ message }) => message),
    ["Nested .map in rendered JSX: extract the inner list into its own component."],
  );
});

it("treats flatMap like map", (t) => {
  const diagnostics = lintDiagnostics(
    t,
    {
      "Groups.tsx":
        "export function Groups({ groups }: { groups: string[][] }) { return <ul>{groups.map((group) => <li key={group.join()}>{group.flatMap((g) => [<b key={g}>{g}</b>])}</li>)}</ul>; }",
    },
    rules,
  );
  assert.deepEqual(
    diagnostics.map(({ message }) => message),
    ["Nested .flatMap in rendered JSX: extract the inner list into its own component."],
  );
});

it("accepts sibling lists and lists computed outside the rendered JSX", (t) => {
  assert.deepEqual(
    lintDiagnostics(
      t,
      {
        "Lists.tsx":
          "export function Lists({ a, b }: { a: string[]; b: string[][] }) { return <><ul>{a.map((x) => <li key={x}>{x}</li>)}</ul><ul>{b.map((row) => { const cells = row.map((c) => <td key={c}>{c}</td>); return <li key={row.join()}>{cells}</li>; })}</ul></>; }",
      },
      rules,
    ),
    [],
  );
});
