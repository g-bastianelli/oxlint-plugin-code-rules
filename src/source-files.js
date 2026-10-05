import fs from "node:fs";
import path from "node:path";

const excluded = new Set([
  "node_modules",
  ".git",
  ".moon",
  "dist",
  "build",
  "coverage",
  "paraglide",
]);

export function sourceFiles(root, includeConfig = false, directories = []) {
  const files = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    directories.push(directory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (excluded.has(entry.name)) continue;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(filename);
      else if (
        entry.isFile() &&
        ((/\.[cm]?[jt]sx?$/.test(entry.name) && !/\.d\.[cm]?ts$/.test(entry.name)) ||
          (includeConfig && entry.name.endsWith(".json")))
      )
        files.push(filename);
    }
  }
  return files;
}

export function isInside(root, filename) {
  const relative = path.relative(root, filename);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

export function publicFiles(root, files) {
  const pinned = new Set();
  const packages = new Set();
  const visited = new Set();
  for (const filename of files) {
    let directory = path.dirname(filename);
    while (true) {
      if (visited.has(directory)) break;
      visited.add(directory);
      const manifest = path.join(directory, "package.json");
      if (fs.existsSync(manifest)) {
        packages.add(manifest);
        break;
      }
      const parent = path.dirname(directory);
      if (directory === parent) break;
      directory = parent;
    }
  }
  for (const manifest of packages) {
    const data = JSON.parse(fs.readFileSync(manifest, "utf8"));
    const targets = [];
    collectTargets(data.exports, targets);
    for (const target of targets) {
      if (!target.startsWith("./")) continue;
      const absolute = path.resolve(path.dirname(manifest), target);
      const pattern = new RegExp(`^${absolute.split("*").map(escapeRegExp).join(".*")}$`);
      for (const filename of files)
        if (isInside(root, filename) && pattern.test(filename)) pinned.add(filename);
    }
  }
  return pinned;
}

function collectTargets(value, targets) {
  if (typeof value === "string") targets.push(value);
  else if (value && typeof value === "object")
    for (const child of Object.values(value)) collectTargets(child, targets);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
