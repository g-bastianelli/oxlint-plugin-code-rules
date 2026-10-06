import fs from "node:fs";
import path from "node:path";
import { ownershipGraph } from "./graph-cache.js";
import { isInside } from "./source-files.js";

// Every ownership rule reads the same cached graph and reports one placement per file.
export function ownershipRule({ name, kind, files, description, placement, anchor }) {
  return {
    meta: {
      type: "suggestion",
      docs: { description },
      schema: [
        {
          type: "object",
          properties: { root: { type: "string", minLength: 1 } },
          required: ["root"],
          additionalProperties: false,
        },
      ],
      messages: {
        placement,
        incomplete:
          "Ownership analysis skipped: {{reason}}. Use a complete ESM source root with statically resolvable imports.",
      },
    },
    createOnce(context) {
      let suggestion;
      let incomplete;
      let reported;
      return {
        before() {
          suggestion = undefined;
          incomplete = undefined;
          reported = false;
          if (!files.test(context.filename)) return false;
          const { entry, filename } = locate(context);
          if (!entry) return false;
          if (entry.graph.problem && !entry.reported.has(name)) {
            incomplete = entry.graph.problem;
            entry.reported.add(name);
          }
          const candidate = entry.graph.suggestions.get(filename);
          if (candidate?.kind === kind) suggestion = candidate;
          if (!suggestion && !incomplete) return false;
        },
        Program(node) {
          if (incomplete)
            context.report({ node, messageId: "incomplete", data: { reason: incomplete } });
          if (anchor === "program") report(node.body[0] ?? node);
        },
        ...(anchor === "jsx" && { JSXElement: report, JSXFragment: report }),
      };

      function report(node) {
        if (!suggestion || reported) return;
        context.report({ node, messageId: "placement", data: suggestion });
        reported = true;
      }
    },
  };
}

// Oxlint runs every rule on a file before the next one: resolve each file once for all rules.
let last;

function locate(context) {
  const { cwd, filename: raw } = context;
  const option = context.options[0].root;
  const text = context.sourceCode.text;
  if (
    last?.raw === raw &&
    last.cwd === cwd &&
    last.option === option &&
    last.text === text &&
    (!last.entry || last.entry.validated)
  )
    return last;
  const root = fs.realpathSync.native(path.resolve(cwd, option));
  const filename = fs.existsSync(raw) ? fs.realpathSync.native(raw) : path.resolve(raw);
  const entry = isInside(root, filename) ? ownershipGraph(root, filename, text) : undefined;
  last = { raw, cwd, option, text, filename, entry };
  return last;
}
