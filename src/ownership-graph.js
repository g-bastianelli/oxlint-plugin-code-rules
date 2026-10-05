import fs from "node:fs";
import path from "node:path";
import { isBuiltin } from "node:module";
import { parseSync } from "oxc-parser";
import { ResolverFactory } from "oxc-resolver";
import { isInside, publicFiles, sourceFiles } from "./source-files.js";

export function buildOwnershipGraph(root, overrides = new Map()) {
  const files = sourceFiles(root);
  for (const filename of overrides.keys())
    if (!files.includes(filename) && isInside(root, filename)) files.push(filename);
  const sources = new Map();
  const consumers = new Map(files.map((filename) => [filename, new Set()]));
  const pinned = publicFiles(root, files);
  const resolver = new ResolverFactory({
    tsconfig: "auto",
    extensions: [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs", ".cts", ".cjs"],
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    },
  });
  let problem;
  for (const filename of files) {
    const source = overrides.get(filename) ?? fs.readFileSync(filename, "utf8");
    sources.set(filename, source);
    const parsed = parseSync(filename, source);
    if (parsed.errors.length) {
      problem ??= `cannot parse ${path.relative(root, filename)}`;
      continue;
    }
    for (const item of parsed.module.staticImports) {
      if (item.entries.length && item.entries.every((entry) => entry.isType)) continue;
      addImport(filename, item.moduleRequest.value);
    }
    for (const statement of parsed.module.staticExports) {
      for (const entry of statement.entries) {
        if (!entry.moduleRequest || entry.isType) continue;
        const target = resolve(filename, entry.moduleRequest.value);
        if (target) pinned.add(target);
      }
    }
    // Only materialize the AST when ESM summaries cannot describe the import target.
    if (
      parsed.module.dynamicImports.length ||
      parsed.module.importMetas.length ||
      /\brequire\s*\(/.test(source)
    ) {
      const pending = [parsed.program];
      while (pending.length) {
        const node = pending.pop();
        if (!node || typeof node !== "object") continue;
        if (node.type === "ImportExpression") {
          if (node.source.type === "Literal" && typeof node.source.value === "string")
            addImport(filename, node.source.value);
          else problem ??= `non-literal dynamic import in ${path.relative(root, filename)}`;
        }
        if (
          node.type === "CallExpression" &&
          node.callee.type === "Identifier" &&
          node.callee.name === "require"
        ) {
          problem ??= `CommonJS require in ${path.relative(root, filename)}`;
        }
        if (
          node.type === "CallExpression" &&
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "MetaProperty"
        ) {
          problem ??= `computed import.meta call in ${path.relative(root, filename)}`;
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) pending.push(...value);
          else if (value && typeof value === "object") pending.push(value);
        }
      }
    }
  }
  const suggestions = new Map();
  const cyclic = cyclicFiles(consumers);
  if (!problem)
    for (const [filename, importers] of consumers) {
      if (
        !isComponentFile(filename) ||
        pinned.has(filename) ||
        cyclic.has(filename) ||
        importers.size === 0
      )
        continue;
      if (
        [...importers].some(
          (file) => !/\.[jt]sx$/.test(file) || /\.(?:test|spec|stories)\.[jt]sx$/.test(file),
        )
      )
        continue;
      const expected = commonDirectory([...importers].map(ownerDirectory));
      if (path.dirname(filename) === expected || !isInside(root, expected)) continue;
      suggestions.set(filename, {
        expected: portable(path.relative(root, expected)) || ".",
        consumers: [...importers]
          .map((file) => portable(path.relative(root, file)))
          .sort()
          .join(", "),
      });
    }
  return { suggestions, sources, problem };

  function resolve(filename, specifier) {
    const resolved = resolver.resolveFileSync(filename, specifier);
    if (
      !resolved.path &&
      !isBuiltin(specifier) &&
      !/\.(?:css|scss|sass|less|svg|png|jpg|jpeg|webp|gif|woff2?)(?:\?.*)?$/.test(specifier)
    ) {
      problem ??= `unresolved import ${specifier} in ${path.relative(root, filename)}`;
    }
    return resolved.path;
  }

  function addImport(filename, specifier) {
    const target = resolve(filename, specifier);
    consumers.get(target)?.add(filename);
  }
}

export function isComponentFile(filename) {
  return /^[A-Z][^.]*\.[jt]sx$/.test(path.basename(filename));
}

function ownerDirectory(filename) {
  const directory = path.dirname(filename);
  return path.basename(filename).startsWith("index.")
    ? directory
    : path.join(directory, path.basename(filename, path.extname(filename)));
}

function commonDirectory(directories) {
  let common = directories[0];
  for (const directory of directories.slice(1))
    while (!isInside(common, directory)) common = path.dirname(common);
  return common;
}

function portable(filename) {
  return filename.split(path.sep).join("/");
}

function cyclicFiles(consumers) {
  const visited = new Set();
  const active = new Map();
  const cyclic = new Set();
  for (const filename of consumers.keys()) {
    const stack = [{ filename, exit: false }];
    const ancestors = [];
    while (stack.length) {
      const item = stack.pop();
      if (item.exit) {
        active.delete(item.filename);
        ancestors.pop();
        continue;
      }
      if (active.has(item.filename)) {
        for (const member of ancestors.slice(active.get(item.filename))) cyclic.add(member);
        continue;
      }
      if (visited.has(item.filename)) continue;
      visited.add(item.filename);
      active.set(item.filename, ancestors.length);
      ancestors.push(item.filename);
      stack.push({ filename: item.filename, exit: true });
      for (const parent of consumers.get(item.filename))
        stack.push({ filename: parent, exit: false });
    }
  }
  return cyclic;
}
