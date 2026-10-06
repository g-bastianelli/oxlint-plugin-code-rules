const listMethods = new Set(["map", "flatMap"]);

function rendersList(expression) {
  return (
    expression?.type === "CallExpression" &&
    expression.callee.type === "MemberExpression" &&
    !expression.callee.computed &&
    listMethods.has(expression.callee.property.name)
  );
}

export const noNestedJsxMap = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Never nest a .map inside a .map in rendered JSX: extract the inner list into its own component.",
    },
    schema: [],
    messages: {
      nested: "Nested .{{method}} in rendered JSX: extract the inner list into its own component.",
    },
  },
  createOnce(context) {
    let depth = 0;
    return {
      before() {
        depth = 0;
        if (!/\.[jt]sx$/.test(context.filename)) return false;
      },
      JSXExpressionContainer(node) {
        if (!rendersList(node.expression)) return;
        const method = node.expression.callee.property;
        if (depth > 0)
          context.report({ node: method, messageId: "nested", data: { method: method.name } });
        depth++;
      },
      "JSXExpressionContainer:exit"(node) {
        if (rendersList(node.expression)) depth--;
      },
    };
  },
};
