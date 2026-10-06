import { locate } from "../locate.js";

export const noDeepImport = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Import a folder that declares an entry through that entry, never through its other files.",
    },
    schema: [
      {
        type: "object",
        properties: { root: { type: "string", minLength: 1 } },
        additionalProperties: false,
      },
    ],
    messages: {
      deep: "Import {{folder}} through its entry {{entry}} instead of {{target}}.",
    },
  },
  createOnce(context) {
    let deep;
    return {
      before() {
        deep = undefined;
        if (!/\.[cm]?[jt]sx?$/.test(context.filename)) return false;
        const { entry, filename } = locate(context);
        deep = entry?.graph.deepImports.get(filename);
        if (!deep) return false;
      },
      ImportDeclaration: report,
      ExportNamedDeclaration: report,
      ExportAllDeclaration: report,
      ImportExpression: report,
    };

    function report(node) {
      const source = node.source;
      if (!source || typeof source.value !== "string") return;
      const found = deep.get(source.value);
      if (found) context.report({ node: source, messageId: "deep", data: found });
    }
  },
};
