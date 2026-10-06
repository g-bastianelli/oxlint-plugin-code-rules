import { eslintCompatPlugin } from "@oxlint/plugins";
import { componentOwnership } from "./rules/component-ownership.js";
import { declarativeEntry } from "./rules/declarative-entry.js";
import { moduleOwnership } from "./rules/module-ownership.js";
import { noCatchAllModule } from "./rules/no-catch-all-module.js";
import { noDeepImport } from "./rules/no-deep-import.js";
import { noEnum } from "./rules/no-enum.js";
import { noNestedJsxMap } from "./rules/no-nested-jsx-map.js";
import { testColocation } from "./rules/test-colocation.js";

export default eslintCompatPlugin({
  meta: { name: "code-rules", version: "0.4.0" },
  rules: {
    "component-ownership": componentOwnership,
    "module-ownership": moduleOwnership,
    "test-colocation": testColocation,
    "no-deep-import": noDeepImport,
    "declarative-entry": declarativeEntry,
    "no-nested-jsx-map": noNestedJsxMap,
    "no-catch-all-module": noCatchAllModule,
    "no-enum": noEnum,
  },
});
