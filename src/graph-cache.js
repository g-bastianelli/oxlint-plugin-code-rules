import fs from "node:fs";
import path from "node:path";
import { buildOwnershipGraph } from "./ownership-graph.js";
import { sourceFiles } from "./source-files.js";

const cache = new Map();

export function ownershipGraph(root, filename, source) {
  let entry = cache.get(root);
  if (!entry) {
    entry = {
      overrides: new Map(),
      graph: undefined,
      reported: new Set(),
      snapshot: undefined,
      validated: false,
      unsaved: false,
    };
    if (cache.size >= 64) cache.delete(cache.keys().next().value);
    cache.set(root, entry);
  }
  if (!entry.validated) {
    if (!entry.snapshot || stamps(entry.snapshot.files) !== entry.snapshot.stamps) {
      entry.snapshot = snapshot(root);
      entry.graph = undefined;
    }
    if (entry.unsaved) entry.graph = undefined;
    entry.unsaved = false;
    entry.overrides.clear();
    entry.validated = true;
    entry.reported.clear();
    // Revalidate metadata between batches without reparsing unchanged source files.
    setImmediate(() => {
      entry.validated = false;
    });
  }
  if (!entry.graph || entry.graph.sources.get(filename) !== source) {
    entry.overrides.set(filename, source);
    entry.unsaved ||= !fs.existsSync(filename) || fs.readFileSync(filename, "utf8") !== source;
    entry.graph = buildOwnershipGraph(root, entry.overrides);
    entry.reported.clear();
  }
  return entry;
}

function snapshot(root) {
  const directories = [];
  const files = sourceFiles(root, true, directories);
  let directory = path.dirname(root);
  while (true) {
    files.push(path.join(directory, "package.json"), path.join(directory, "tsconfig.json"));
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".json"))
        files.push(path.join(directory, entry.name));
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  files.push(...directories);
  return { files, stamps: stamps(files) };
}

function stamps(files) {
  return files
    .map((filename) => {
      const stat = fs.statSync(filename, { throwIfNoEntry: false });
      return stat ? `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}` : "missing";
    })
    .join("\n");
}
