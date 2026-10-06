export const noEnum = {
  meta: {
    type: "suggestion",
    docs: { description: "Prefer string-literal unions to TypeScript enums." },
    schema: [],
    messages: { enum: "Prefer a string-literal union to the enum {{name}}." },
  },
  createOnce(context) {
    return {
      before() {
        if (!/\.[cm]?tsx?$/.test(context.filename)) return false;
      },
      TSEnumDeclaration(node) {
        context.report({ node: node.id, messageId: "enum", data: { name: node.id.name } });
      },
    };
  },
};
