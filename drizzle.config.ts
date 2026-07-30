import { defineConfig } from "drizzle-kit";

// Generation only — the runtime path applies these migrations itself and gets
// its database location from config/env.ts.
export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
