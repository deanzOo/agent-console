import js from "@eslint/js";
import tseslint from "typescript-eslint";
import next from "eslint-config-next";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      ".jscpd/**",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,
  {
    rules: {
      // 300 is ESLint's own default and the number most style guides converge
      // on. Blank lines and comments are excluded, so documenting a decision
      // never pushes a file over. A file that outgrows this is doing more than
      // one job — split it rather than raising the cap.
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "@typescript-eslint/no-explicit-any": "error",
      // Assertions hide the place where type information was actually lost.
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
      ],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Test files earn more room: enumerating cases is the job, and splitting a
    // suite to satisfy a line count makes it harder to read, not easier.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
);
