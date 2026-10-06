import { eslintCompatPlugin } from "@oxlint/plugins";
import { componentOwnership } from "./rules/component-ownership.js";

export default eslintCompatPlugin({
  meta: { name: "code-rules", version: "0.1.1" },
  rules: { "component-ownership": componentOwnership },
});
