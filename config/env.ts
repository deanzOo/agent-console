import path from "node:path";
import { homedir as osHomedir } from "node:os";
import { z } from "zod";

export const AUTH_MODES = ["cloudflare-access", "password", "trusted-network"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

export interface AppConfig {
  readonly authMode: AuthMode;
  readonly cfAccessTeamDomain: string | undefined;
  readonly cfAccessAud: string | undefined;
  readonly sessionSecret: string | undefined;
  readonly dataDir: string;
  readonly workspaceRoot: string;
  readonly host: string;
  readonly port: number;
  readonly allowInsecure: boolean;
  readonly anthropicApiKey: string | undefined;
  readonly claudeCodeOauthToken: string | undefined;
  /** Either credential works; the CLI's own login is a third path we cannot see. */
  readonly hasAnthropicCredential: boolean;
  readonly githubToken: string | undefined;
  readonly asanaToken: string | undefined;
}

/**
 * Thrown at boot when the environment is unusable. The message names every
 * offending key so an operator can fix them in one pass instead of restarting
 * once per mistake.
 */
export class EnvError extends Error {
  override readonly name = "EnvError";
}

/** Absent and empty-string are the same thing: the operator left it blank. */
const blankAsUndefined = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const schema = z.object({
  AUTH_MODE: z.enum(AUTH_MODES).default("cloudflare-access"),
  CF_ACCESS_TEAM_DOMAIN: blankAsUndefined,
  CF_ACCESS_AUD: blankAsUndefined,
  SESSION_SECRET: blankAsUndefined,
  DATA_DIR: blankAsUndefined,
  WORKSPACE_ROOT: blankAsUndefined,
  HOST: blankAsUndefined,
  PORT: z.preprocess(
    (value) => (value === undefined || value === "" ? 3000 : Number(value)),
    z.number().int().min(1).max(65535),
  ),
  ALLOW_INSECURE: blankAsUndefined,
  ANTHROPIC_API_KEY: blankAsUndefined,
  CLAUDE_CODE_OAUTH_TOKEN: blankAsUndefined,
  GITHUB_TOKEN: blankAsUndefined,
  ASANA_TOKEN: blankAsUndefined,
});

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const MIN_SESSION_SECRET_LENGTH = 32;

function isLoopback(host: string): boolean {
  return LOOPBACK_HOSTS.has(host) || host.startsWith("127.");
}

function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  const lines = issues.map((issue) => {
    const key = issue.path.join(".") || "(root)";
    return `  ${key}: ${issue.message}`;
  });
  return `Invalid environment configuration:\n${lines.join("\n")}\n\nSee .env.example for the full list of keys.`;
}

export interface ParseEnvOptions {
  readonly homedir?: string;
}

export function parseEnv(
  source: Record<string, string | undefined>,
  options: ParseEnvOptions = {},
): AppConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new EnvError(formatIssues(parsed.error.issues));
  }

  const env = parsed.data;
  const home = options.homedir ?? osHomedir();
  const dataDir = env.DATA_DIR ?? path.join(home, ".claudevps");
  const host = env.HOST ?? "127.0.0.1";
  const allowInsecure = env.ALLOW_INSECURE === "1";

  // A trusted-network deployment has no auth of its own, so a public bind makes
  // the whole app writable by anyone who can reach the port. Refuse rather than
  // let a copy-pasted deploy end up open.
  if (env.AUTH_MODE === "trusted-network" && !isLoopback(host) && !allowInsecure) {
    throw new EnvError(
      `AUTH_MODE=trusted-network provides no authentication, but HOST is "${host}".\n` +
        `Bind to 127.0.0.1 and put a VPN or reverse proxy in front, or set ALLOW_INSECURE=1 to confirm you understand the exposure.`,
    );
  }

  if (env.AUTH_MODE === "cloudflare-access") {
    const missing: string[] = [];
    if (!env.CF_ACCESS_TEAM_DOMAIN) missing.push("CF_ACCESS_TEAM_DOMAIN");
    if (!env.CF_ACCESS_AUD) missing.push("CF_ACCESS_AUD");
    if (missing.length > 0) {
      throw new EnvError(
        `AUTH_MODE=cloudflare-access requires:\n${missing.map((key) => `  ${key}`).join("\n")}\n\nSee .env.example.`,
      );
    }
  }

  // Sessions are signed in middleware, which runs before the database is
  // reachable — so unlike the other credentials this one cannot live in the
  // settings table and be filled in from /setup.
  if (env.AUTH_MODE === "password") {
    if (!env.SESSION_SECRET) {
      throw new EnvError(
        "AUTH_MODE=password requires SESSION_SECRET.\nGenerate one with: openssl rand -hex 32",
      );
    }
    if (env.SESSION_SECRET.length < MIN_SESSION_SECRET_LENGTH) {
      throw new EnvError(
        `SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters.\nGenerate one with: openssl rand -hex 32`,
      );
    }
  }

  return {
    authMode: env.AUTH_MODE,
    cfAccessTeamDomain: env.CF_ACCESS_TEAM_DOMAIN,
    cfAccessAud: env.CF_ACCESS_AUD,
    sessionSecret: env.SESSION_SECRET,
    dataDir,
    workspaceRoot: env.WORKSPACE_ROOT ?? path.join(dataDir, "work"),
    host,
    port: env.PORT,
    allowInsecure,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    claudeCodeOauthToken: env.CLAUDE_CODE_OAUTH_TOKEN,
    hasAnthropicCredential: Boolean(
      env.ANTHROPIC_API_KEY ?? env.CLAUDE_CODE_OAUTH_TOKEN,
    ),
    githubToken: env.GITHUB_TOKEN,
    asanaToken: env.ASANA_TOKEN,
  };
}

let cached: AppConfig | undefined;

/** Parsed once per process; every caller sees the same validated config. */
export function getConfig(): AppConfig {
  cached ??= parseEnv(process.env);
  return cached;
}
