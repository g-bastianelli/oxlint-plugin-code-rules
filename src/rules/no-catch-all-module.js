import path from "node:path";

const defaultNames = ["utils", "util", "helpers", "helper", "misc", "common"];
const testPattern = /\.(?:test|spec|stories|e2e|bench)\.[cm]?[jt]sx?$/;

export const noCatchAllModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Name a module after its one responsibility, never utils.ts or helpers.ts.",
    },
    schema: [
      {
        type: "object",
        properties: {
          names: { type: "array", items: { type: "string", minLength: 1 } },
          allow: { type: "array", items: { type: "string", minLength: 1 } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      catchAll: "Name {{file}} after its one responsibility: '{{name}}' is a catch-all.",
    },
  },
  createOnce(context) {
    let name;
    return {
      before() {
        name = undefined;
        const filename = context.filename;
        if (!/\.[cm]?[jt]sx?$/.test(filename) || testPattern.test(filename)) return false;
        const options = context.options[0] ?? {};
        const stem = path.basename(filename).replace(/\.[^.]+$/, "");
        const lower = stem.toLowerCase();
        const matched = (options.names ?? defaultNames).find((candidate) => {
          const n = candidate.toLowerCase();
          return lower === n || ["-", "_", "."].some((sep) => lower.endsWith(sep + n));
        });
        if (!matched) return false;
        const portable = filename.split(path.sep).join("/");
        if ((options.allow ?? []).some((suffix) => portable.endsWith(suffix))) return false;
        name = stem;
      },
      Program(node) {
        context.report({
          node: node.body[0] ?? node,
          messageId: "catchAll",
          data: { file: path.basename(context.filename), name },
        });
      },
    };
  },
};
