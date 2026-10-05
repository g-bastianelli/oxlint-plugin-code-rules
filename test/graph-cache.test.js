import assert from "node:assert/strict";
import { it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { setImmediate } from "node:timers/promises";
import { ownershipGraph } from "../src/graph-cache.js";
import { fixture, writeFiles } from "./fixtures.js";

const child = "export function Child() { return <span/>; }";
const files = {
  "Parent.tsx": 'import { Child } from "./Child"; export function Parent() { return <Child/>; }',
  "Child.tsx": child,
};

it("shares one graph for all files in a synchronous lint batch", (t) => {
  const p = fixture(files);
  t.after(p.cleanup);
  const first = ownershipGraph(p.root, path.join(p.root, "Child.tsx"), child);
  const second = ownershipGraph(p.root, path.join(p.root, "Parent.tsx"), files["Parent.tsx"]);
  assert.equal(first.graph, second.graph);
});

it("reuses parsed sources across unchanged asynchronous batches", async (t) => {
  const p = fixture(files);
  t.after(p.cleanup);
  const filename = path.join(p.root, "Child.tsx");
  const first = ownershipGraph(p.root, filename, child).graph;
  await setImmediate();
  assert.equal(ownershipGraph(p.root, filename, child).graph, first);
});

it("does not retain a previous request's unsaved importer", async (t) => {
  const p = fixture(files);
  t.after(p.cleanup);
  ownershipGraph(p.root, path.join(p.root, "Parent.tsx"), "export const Parent = 1;");
  await setImmediate();
  assert.equal(
    ownershipGraph(p.root, path.join(p.root, "Child.tsx"), child).graph.suggestions.size,
    1,
  );
});

it("sees newly added and deleted consumers on the next event-loop turn", async (t) => {
  const p = fixture(files);
  t.after(p.cleanup);
  const filename = path.join(p.root, "Child.tsx");
  assert.equal(ownershipGraph(p.root, filename, child).graph.suggestions.size, 1);
  await setImmediate();
  writeFiles(p.root, { "Other.tsx": files["Parent.tsx"] });
  assert.equal(ownershipGraph(p.root, filename, child).graph.suggestions.size, 0);
  await setImmediate();
  fs.unlinkSync(path.join(p.root, "Other.tsx"));
  assert.equal(ownershipGraph(p.root, filename, child).graph.suggestions.size, 1);
});

it("includes the current unsaved source without writing it to disk", (t) => {
  const p = fixture(files);
  t.after(p.cleanup);
  const filename = path.join(p.root, "Parent.tsx");
  const first = ownershipGraph(p.root, filename, files["Parent.tsx"]);
  assert.equal(first.graph.suggestions.size, 1);
  const next = ownershipGraph(p.root, filename, "export function Parent() { return <span/>; }");
  assert.equal(next.graph.suggestions.size, 0);
  assert.equal(fs.readFileSync(filename, "utf8"), files["Parent.tsx"]);
});

it("reloads package export metadata and source edits between requests", async (t) => {
  const p = fixture(files);
  t.after(p.cleanup);
  const filename = path.join(p.root, "Child.tsx");
  assert.equal(ownershipGraph(p.root, filename, child).graph.suggestions.size, 1);
  await setImmediate();
  fs.writeFileSync(
    path.join(p.directory, "package.json"),
    JSON.stringify({ exports: "./src/Child.tsx" }),
  );
  assert.equal(ownershipGraph(p.root, filename, child).graph.suggestions.size, 0);
});
