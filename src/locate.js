import fs from "node:fs";
import path from "node:path";
import { ownershipGraph } from "./graph-cache.js";
import { isInside } from "./source-files.js";

// Oxlint runs every rule on a file before the next one: resolve each file once for all rules.
let last;

export function locate(context) {
  const { cwd, filename: raw } = context;
  const option = context.options[0]?.root;
  const text = context.sourceCode.text;
  if (
    last?.raw === raw &&
    last.cwd === cwd &&
    last.option === option &&
    last.text === text &&
    (!last.entry || last.entry.validated)
  )
    return last;
  const filename = fs.existsSync(raw) ? fs.realpathSync.native(raw) : path.resolve(raw);
  const root = option ? fs.realpathSync.native(path.resolve(cwd, option)) : packageRoot(filename);
  const entry = root && isInside(root, filename) ? ownershipGraph(root, filename, text) : undefined;
  last = { raw, cwd, option, text, filename, root, entry };
  return last;
}

// Without `root`, a file belongs to the `src/` of its nearest package, or to the package itself.
const packageRoots = new Map();

export function packageRoot(filename) {
  const directory = path.dirname(filename);
  if (!packageRoots.has(directory)) {
    let root;
    const manifest = nearestManifest(directory);
    if (manifest) {
      const current = path.dirname(manifest);
      const src = path.join(current, "src");
      // A workspace root without src/ is not a package to analyze: members carry their own.
      if (fs.statSync(src, { throwIfNoEntry: false })?.isDirectory()) root = src;
      else if (!readManifest(manifest).workspaces) root = current;
    }
    packageRoots.set(directory, root);
  }
  return packageRoots.get(directory);
}

export function nearestManifest(directory) {
  for (let current = directory; ; current = path.dirname(current)) {
    const manifest = path.join(current, "package.json");
    if (fs.existsSync(manifest)) return manifest;
    if (path.dirname(current) === current) return undefined;
  }
}

export function readManifest(manifest) {
  try {
    return JSON.parse(fs.readFileSync(manifest, "utf8")) ?? {};
  } catch {
    return {};
  }
}
