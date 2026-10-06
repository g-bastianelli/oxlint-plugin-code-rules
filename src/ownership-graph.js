import fs from "node:fs";
import path from "node:path";
import { isBuiltin } from "node:module";
import { parseSync } from "oxc-parser";
import { ResolverFactory } from "oxc-resolver";
import { isInside, publicFiles, sourceFiles } from "./source-files.js";

const testPattern = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/;

export function buildOwnershipGraph(root, overrides = new Map()) {
  const files = sourceFiles(root);
  for (const filename of overrides.keys())
    if (!files.includes(filename) && isInside(root, filename)) files.push(filename);
  const sources = new Map();
  const valueConsumers = new Map(files.map((filename) => [filename, new Set()]));
  const typeConsumers = new Map(files.map((filename) => [filename, new Set()]));
  const imports = new Map(files.map((filename) => [filename, new Set()]));
  const pinned = publicFiles(root, files);
  const typeExports = new Set();
  const resolver = new ResolverFactory({
    tsconfig: "auto",
    conditionNames: ["node", "import"],
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
      const typeOnly = item.entries.length > 0 && item.entries.every((entry) => entry.isType);
      addImport(filename, item.moduleRequest.value, typeOnly);
    }
    for (const statement of parsed.module.staticExports) {
      for (const entry of statement.entries) {
        if (!entry.moduleRequest) continue;
        const target = resolve(filename, entry.moduleRequest.value, entry.isType);
        if (target) (entry.isType ? typeExports : pinned).add(target);
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
            addImport(filename, node.source.value, false);
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
  const units = new Map(files.map((filename) => [filename, unitOf(filename)]));
  // Component naming marks a unit; other folders must be reached only through their entry.
  const moduleEntries = new Map();
  for (const [filename, unit] of units)
    if (unit.entry && unit.kind === "module") moduleEntries.set(unit.folder, filename);
  for (const [importer, targets] of imports) {
    if (units.get(importer).kind === "test") continue;
    for (const target of targets)
      for (
        let directory = path.dirname(target);
        directory !== root && isInside(root, directory);
        directory = path.dirname(directory)
      ) {
        const entry = moduleEntries.get(directory);
        if (entry && entry !== target && !isInside(directory, importer)) {
          moduleEntries.delete(directory);
          units.set(entry, unitOf(entry, false));
        }
      }
  }
  // Re-exported types make a module public, not the component that declares them.
  for (const target of typeExports) if (units.get(target)?.kind === "module") pinned.add(target);
  const unitFolders = new Set();
  for (const unit of units.values())
    if (unit.folder && unit.folder !== root) unitFolders.add(unit.folder);
  const owners = new Map();
  for (const [filename, unit] of units) {
    if (unit.kind === "test") continue;
    // Components are owned by whoever renders them; modules also by type consumers.
    const candidates =
      unit.kind === "component"
        ? valueConsumers.get(filename)
        : new Set([...valueConsumers.get(filename), ...typeConsumers.get(filename)]);
    owners.set(
      filename,
      new Set([...candidates].filter((consumer) => units.get(consumer).kind !== "test")),
    );
  }
  const suggestions = new Map();
  const cyclic = cyclicFiles(owners);
  if (!problem) {
    for (const [filename, consumers] of owners) {
      const unit = units.get(filename);
      if (pinned.has(filename) || cyclic.has(filename) || consumers.size === 0) continue;
      // Root entries and index files of plain grouping folders have no unit to move.
      if (unit.entry ? path.dirname(filename) === root : unit.name === "index") continue;
      const directories = [...consumers].map(ownerDirectory);
      if (directories.includes(undefined)) continue;
      const expected = commonDirectory(directories);
      if (unit.location === expected || !isInside(root, expected)) continue;
      if (unit.folder && isInside(unit.folder, expected)) continue;
      suggestions.set(filename, suggestion(unit, expected, consumers));
    }
    for (const [filename, unit] of units) {
      if (unit.kind !== "test") continue;
      const subjects = [...imports.get(filename)].filter(
        (target) => units.get(target).kind !== "test" && units.get(target).name === unit.name,
      );
      if (subjects.length !== 1) continue;
      const expected = path.dirname(subjects[0]);
      const directory = path.dirname(filename);
      if (directory === expected || directory === path.join(expected, "__tests__")) continue;
      suggestions.set(filename, suggestion(unit, expected, subjects));
    }
  }
  return { suggestions, sources, problem };

  function suggestion(unit, expected, consumers) {
    return {
      kind: unit.kind,
      subject: unit.subject,
      expected: portable(path.relative(root, expected)) || ".",
      consumers: [...consumers]
        .map((file) => portable(path.relative(root, file)))
        .sort()
        .join(", "),
    };
  }

  function unitOf(filename, allowEntry = true) {
    const directory = path.dirname(filename);
    const stem = path.basename(filename).replace(/\.[^.]+$/, "");
    const entry = allowEntry && (stem === "index" || stem === path.basename(directory));
    if (testPattern.test(filename) || directory.split(path.sep).includes("__tests__")) {
      const base = path.basename(filename);
      const name = testPattern.test(base)
        ? base.replace(testPattern, "")
        : base.replace(/\.[^.]+$/, "");
      const folder = path.basename(directory) === "__tests__" ? path.dirname(directory) : directory;
      return {
        kind: "test",
        name: name === "index" ? path.basename(folder) : name,
        subject: portable(path.relative(root, filename)),
      };
    }
    const name = entry ? path.basename(directory) : stem;
    const kind = /^[A-Z][^.]*$/.test(name) && /\.[jt]sx$/.test(filename) ? "component" : "module";
    const folder = entry
      ? directory
      : kind === "component"
        ? path.join(directory, name)
        : undefined;
    return {
      kind,
      name,
      entry,
      folder,
      location: entry ? path.dirname(directory) : directory,
      subject: portable(path.relative(root, entry ? directory : filename)) + (entry ? "/" : ""),
    };
  }

  // Units own code: components, entry folders, and loose modules acting inside a unit.
  // Loose modules elsewhere (routes, app wiring) reference code without owning it.
  function ownerDirectory(filename) {
    const unit = units.get(filename);
    if (unit.folder) return unit.folder === root ? undefined : unit.folder;
    for (
      let directory = path.dirname(filename);
      directory !== root;
      directory = path.dirname(directory)
    )
      if (unitFolders.has(directory)) return path.dirname(filename);
    return undefined;
  }

  // Type links may target declaration-only files and never suspend the analysis.
  function resolve(filename, specifier, typeOnly = false) {
    const resolved = resolver.resolveFileSync(filename, specifier);
    if (
      !resolved.path &&
      !typeOnly &&
      !isBuiltin(specifier) &&
      // Runtime and bundler protocols (bun:, cloudflare:, virtual:) are external modules.
      !/^[a-z][a-z\d+.-]*:/i.test(specifier) &&
      !/\.(?:css|scss|sass|less|svg|png|jpg|jpeg|webp|gif|woff2?)(?:\?.*)?$/.test(specifier)
    ) {
      problem ??= `unresolved import ${specifier} in ${path.relative(root, filename)}`;
    }
    return resolved.path;
  }

  function addImport(filename, specifier, typeOnly) {
    const target = resolve(filename, specifier, typeOnly);
    if (!valueConsumers.has(target)) return;
    imports.get(filename).add(target);
    (typeOnly ? typeConsumers : valueConsumers).get(target).add(filename);
  }
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
      for (const parent of consumers.get(item.filename) ?? [])
        stack.push({ filename: parent, exit: false });
    }
  }
  return cyclic;
}
