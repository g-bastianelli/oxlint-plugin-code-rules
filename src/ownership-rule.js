import { locate } from "./locate.js";

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
