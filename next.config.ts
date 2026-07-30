import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Agent sessions live in process memory, so this must stay a single
  // long-lived server. Bundling these natively rather than tracing them keeps
  // better-sqlite3 and the Agent SDK loading from node_modules at runtime.
  serverExternalPackages: [
    "better-sqlite3",
    "argon2",
    "@anthropic-ai/claude-agent-sdk",
    "@modelcontextprotocol/sdk",
  ],
  outputFileTracingIncludes: {
    "/**": ["./lib/schema.sql"],
  },
};

export default nextConfig;
