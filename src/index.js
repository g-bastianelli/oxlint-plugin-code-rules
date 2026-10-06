import { eslintCompatPlugin } from "@oxlint/plugins";
import { componentOwnership } from "./rules/component-ownership.js";
import { moduleOwnership } from "./rules/module-ownership.js";
import { testColocation } from "./rules/test-colocation.js";

export default eslintCompatPlugin({
  meta: { name: "code-rules", version: "0.2.0" },
  rules: {
    "component-ownership": componentOwnership,
    "module-ownership": moduleOwnership,
    "test-colocation": testColocation,
  },
});
