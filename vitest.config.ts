import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      // json-summary is what the pull request comment reads to report coverage
      // for the files a change actually touches.
      reporter: ["text-summary", "lcov", "json-summary"],
      // Only logic-bearing code is measured. Pages and layouts are markup and
      // are covered by manual/integration checks instead.
      //
      // The apps are here too: measuring packages/core alone described a
      // fraction of the codebase while reading like a number about all of it.
      include: [
        "packages/core/**/*.ts",
        "apps/web/lib/**/*.ts",
        "apps/web/app/api/**/route.ts",
        "apps/agentd/routes.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/types.ts",
        // I/O shells with no branching of their own. Their logic lives in
        // tested modules: repos.ts for paths, session.ts for the agent loop.
        "packages/core/git.ts",
        "packages/core/agents/manager.ts",
        "packages/core/push.ts",
        "packages/core/sync.ts",
        "packages/core/mcp/client.ts",
        // Composition over already-tested pieces: it names an adapter, a
        // setting and a rule, and owns no branching of its own.
        "apps/web/lib/setup-access.ts",
      ],
      // A backstop for the TDD rule, not a substitute for it — see CLAUDE.md.
      //
      // Each sits just under what the suite actually holds, so the number
      // ratchets up with the work instead of describing an ambition. Branches
      // trails the rest because v8 counts every `??`, `||` and default arm
      // separately, including combinations that cannot occur — closing the last
      // few means writing tests for states the code prevents, which is how a
      // threshold starts producing tests written for the number.
      thresholds: {
        lines: 93,
        functions: 92,
        branches: 86,
        statements: 92,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web", import.meta.url)),
      "@agent-console/core": fileURLToPath(new URL("./packages/core", import.meta.url)),
    },
  },
});
