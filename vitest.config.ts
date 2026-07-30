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
      exclude: [
        "**/*.test.ts",
        "**/types.ts",
        // I/O shells with no branching of their own. Their logic lives in
        // tested modules: repos.ts for paths, session.ts for the agent loop.
        "lib/git.ts",
        "lib/agents/driver.ts",
        "lib/agents/manager.ts",
      ],
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
