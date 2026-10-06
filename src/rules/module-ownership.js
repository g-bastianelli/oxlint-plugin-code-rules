import { ownershipRule } from "../ownership-rule.js";

export const moduleOwnership = ownershipRule({
  name: "module-ownership",
  kind: "module",
  files: /\.[cm]?[jt]sx?$/,
  anchor: "program",
  description:
    "Keep private hooks, types and helpers under their owner and shared modules at their common ancestor.",
  placement: "Review placement of {{subject}} under {{expected}}/. Consumers: {{consumers}}.",
});
