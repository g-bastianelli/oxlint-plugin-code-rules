import fs from "node:fs";
import path from "node:path";
import { ownershipGraph } from "../graph-cache.js";
import { isComponentFile } from "../ownership-graph.js";
import { isInside } from "../source-files.js";

export const componentOwnership = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Keep private components under their owner and shared components at their common ancestor.",
    },
    schema: [
      {
        type: "object",
        properties: { root: { type: "string", minLength: 1 } },
        required: ["root"],
        additionalProperties: false,
      },
    ],
    messages: {
      placement: "Review placement under {{expected}}/. Consumers: {{consumers}}.",
      incomplete:
        "Component ownership analysis skipped: {{reason}}. Use a complete ESM source root with statically resolvable imports.",
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
        if (!/\.[jt]sx$/.test(context.filename)) return false;
        const root = fs.realpathSync.native(path.resolve(context.cwd, context.options[0].root));
        const filename = fs.existsSync(context.filename)
          ? fs.realpathSync.native(context.filename)
          : path.resolve(context.filename);
        if (!isInside(root, filename)) return false;
        const entry = ownershipGraph(root, filename, context.sourceCode.text);
        if (entry.graph.problem && !entry.reported) {
          incomplete = entry.graph.problem;
          entry.reported = true;
        }
        if (isComponentFile(filename)) suggestion = entry.graph.suggestions.get(filename);
        if (!suggestion && !incomplete) return false;
      },
      Program(node) {
        if (incomplete)
          context.report({ node, messageId: "incomplete", data: { reason: incomplete } });
      },
      JSXElement(node) {
        reportPlacement(node);
      },
      JSXFragment(node) {
        reportPlacement(node);
      },
    };

    function reportPlacement(node) {
      if (!suggestion || reported) return;
      context.report({ node, messageId: "placement", data: suggestion });
      reported = true;
    }
  },
};
