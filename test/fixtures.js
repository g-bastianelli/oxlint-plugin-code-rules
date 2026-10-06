import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const binary = path.join(packageRoot, "node_modules/.bin/oxlint");
const plugin = path.join(packageRoot, "src/index.js");
const categories = Object.fromEntries(
  ["correctness", "suspicious", "perf", "pedantic", "style", "restriction", "nursery"].map(
    (name) => [name, "off"],
  ),
);

export function fixture(files, manifest = {}, tsconfig = {}, rules = ["component-ownership"]) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "code-rules-")));
  const root = path.join(directory, "src");
  fs.mkdirSync(root);
  writeFiles(root, files);
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(directory, "tsconfig.json"), JSON.stringify(tsconfig));
  const base = { plugins: [], categories, rules: {} };
  fs.writeFileSync(path.join(directory, "base.json"), JSON.stringify(base));
  fs.writeFileSync(
    path.join(directory, "custom.json"),
    JSON.stringify({
      ...base,
      jsPlugins: [{ name: "code-rules", specifier: plugin }],
      rules: Object.fromEntries(rules.map((rule) => [`code-rules/${rule}`, ["warn", { root }]])),
    }),
  );
  return {
    directory,
    root,
    cleanup() {
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

export function writeFiles(root, files) {
  for (const [filename, source] of Object.entries(files)) {
    const target = path.join(root, filename);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  }
}

export function lint(project, kind = "custom", extra = [], expectedStatus = 0) {
  const started = performance.now();
  const output = spawnSync(binary, ["-c", `${kind}.json`, "--format", "json", ...extra, "src"], {
    cwd: project.directory,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 30_000,
  });
  if (output.error || output.status !== expectedStatus)
    throw new Error(`${output.error ?? ""}\n${output.stdout}\n${output.stderr}`);
  return { ...JSON.parse(output.stdout), milliseconds: performance.now() - started };
}

export function branchedTree(name, misplaced = false) {
  const files = {};
  const leaves = [];
  function branch(directory, depth) {
    files[`${directory}/index.tsx`] =
      'import { View as Left } from "./Left"; import { View as Right } from "./Right"; export function View() { return <><Left/><Right/></>; }';
    for (const side of ["Left", "Right"]) {
      if (depth === 4) {
        const filename = `${directory}/${side}.tsx`;
        leaves.push(filename);
        files[filename] = "export function View() { return <span/>; }";
      } else branch(`${directory}/${side}`, depth + 1);
    }
  }
  branch(name, 0);
  const badge = `${misplaced ? path.posix.dirname(leaves[0]) : name}/SharedBadge.tsx`;
  files[badge] = "export function SharedBadge() { return <span/>; }";
  for (const leaf of [leaves[0], leaves.at(-1)]) {
    const relative = path.posix.relative(path.posix.dirname(leaf), badge).replace(/\.tsx$/, "");
    files[leaf] =
      `import { SharedBadge } from ${JSON.stringify(relative.startsWith(".") ? relative : `./${relative}`)}; export function View() { return <SharedBadge/>; }`;
  }
  return files;
}
