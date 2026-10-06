import { ownershipRule } from "../ownership-rule.js";

export const componentOwnership = ownershipRule({
  name: "component-ownership",
  kind: "component",
  files: /\.[jt]sx$/,
  anchor: "jsx",
  description:
    "Keep private components under their owner and shared components at their common ancestor.",
  placement: "Review placement of {{subject}} under {{expected}}/. Consumers: {{consumers}}.",
});
