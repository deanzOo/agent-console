import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      // Only logic-bearing code is measured. Pages and layouts are markup and
      // are covered by manual/integration checks instead.
      include: ["lib/**/*.ts", "config/**/*.ts"],
      // middleware.ts is glue over decideAccess, which is tested directly.
      exclude: ["**/*.test.ts", "**/types.ts"],
      // A backstop for the TDD rule, not a substitute for it — see CLAUDE.md.
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
