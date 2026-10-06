import path from "node:path";
import { nearestManifest, readManifest } from "../locate.js";

const imperative = {
  IfStatement: "if statement",
  SwitchStatement: "switch statement",
  TryStatement: "try statement",
  ThrowStatement: "throw statement",
  ForStatement: "for loop",
  ForInStatement: "for…in loop",
  ForOfStatement: "for…of loop",
  WhileStatement: "while loop",
  DoWhileStatement: "do…while loop",
};

export const declarativeEntry = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Keep index.ts to declarative composition and named re-exports: no control flow, I/O or side effects at module load.",
    },
    schema: [],
    messages: {
      imperative: "{{file}} is a declarative entry: move this {{construct}} into a named module.",
    },
  },
  createOnce(context) {
    return {
      before() {
        const filename = context.filename;
        if (!/^index\.[cm]?[jt]s$/.test(path.basename(filename))) return false;
        if (isProgramEntry(filename)) return false;
      },
      Program(node) {
        for (const statement of node.body) {
          if (statement.type === "ExpressionStatement" && !statement.directive)
            report(statement, "call at module load");
          const declaration =
            statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
          if (declaration?.type !== "VariableDeclaration") continue;
          for (const declarator of declaration.declarations)
            if (declarator.init?.type === "AwaitExpression")
              report(declarator.init, "await at module load");
        }
      },
      ...Object.fromEntries(
        Object.entries(imperative).map(([type, construct]) => [
          type,
          (node) => report(node, construct),
        ]),
      ),
    };

    function report(node, construct) {
      context.report({
        node,
        messageId: "imperative",
        data: { file: path.basename(context.filename), construct },
      });
    }
  },
};

// A package without a declared public surface is a program: its root index is its main, not a façade.
function isProgramEntry(filename) {
  const manifest = nearestManifest(path.dirname(filename));
  if (!manifest) return false;
  const directory = path.dirname(manifest);
  const parent = path.dirname(filename);
  if (parent !== directory && parent !== path.join(directory, "src")) return false;
  const data = readManifest(manifest);
  return Boolean(data.bin) || !data.exports;
}
