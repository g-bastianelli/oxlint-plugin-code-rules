import { ownershipRule } from "../ownership-rule.js";

export const testColocation = ownershipRule({
  name: "test-colocation",
  kind: "test",
  files: /\.[cm]?[jt]sx?$/,
  anchor: "program",
  description: "Keep tests and stories next to the module they exercise.",
  placement: "Colocate {{subject}} with {{consumers}} under {{expected}}/.",
});
