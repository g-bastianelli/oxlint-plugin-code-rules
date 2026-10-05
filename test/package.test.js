import assert from "node:assert/strict";
import { it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fixture, lint, packageRoot } from "./fixtures.js";
import plugin from "../src/index.js";

it("installs the archive and loads the plugin by its package name", (t) => {
  const project = fixture({
    "Parent.tsx": 'import { Child } from "./Child"; export function Parent() { return <Child/>; }',
    "Child.tsx": "export function Child() { return <span/>; }",
  });
  t.after(project.cleanup);
  const pack = spawnSync(
    "bun",
    ["pm", "pack", "--ignore-scripts", "--destination", project.directory],
    { cwd: packageRoot, encoding: "utf8", timeout: 30_000 },
  );
  assert.equal(pack.status, 0, `${pack.stdout}\n${pack.stderr}`);
  const archive = fs.readdirSync(project.directory).find((file) => file.endsWith(".tgz"));
  assert.ok(archive);
  fs.writeFileSync(
    path.join(project.directory, "package.json"),
    JSON.stringify({
      private: true,
      dependencies: { "oxlint-plugin-code-rules": `file:./${archive}` },
    }),
  );
  const install = spawnSync("bun", ["install", "--ignore-scripts"], {
    cwd: project.directory,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(install.status, 0, `${install.stdout}\n${install.stderr}`);
  const configPath = path.join(project.directory, "custom.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.jsPlugins[0].specifier = "oxlint-plugin-code-rules";
  fs.writeFileSync(configPath, JSON.stringify(config));
  const result = lint(project);
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0].message, /under Parent\//);
});

it("declares the package version in the plugin metadata", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  assert.equal(plugin.meta.version, manifest.version);
});
