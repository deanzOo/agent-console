import type { Database } from "better-sqlite3";
import type { FeatureCredentials } from "@/config/features";

/**
 * Operator-editable configuration.
 *
 * Precedence is env var → settings row → unset. Env wins so a deployment can
 * pin a value the UI cannot silently change; the settings table exists so an
 * operator can finish configuring from /setup without editing files on the box.
 */
export type SettingKey =
  | "setup_complete"
  | "github_token"
  | "asana_token"
  | "vapid_public_key"
  | "vapid_private_key"
  | "vapid_subject"
  | "telegram_bot_token"
  | "telegram_chat_id"
  | "password_hash"
  | "session_secret"
  | "default_base_branch"
  | "max_concurrent_missions"
  | "sync_interval_seconds"
  | "git_user_name"
  | "git_user_email";

function blankAsUndefined(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getSetting(db: Database, key: SettingKey): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  if (row === undefined) return undefined;
  const { value } = Object(row);
  return typeof value === "string" ? blankAsUndefined(value) : undefined;
}

/** Storing a blank value clears the key — "" and absent mean the same thing. */
export function setSetting(db: Database, key: SettingKey, value: string): void {
  const normalized = blankAsUndefined(value);
  if (normalized === undefined) {
    deleteSetting(db, key);
    return;
  }
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  ).run(key, normalized);
}

export function deleteSetting(db: Database, key: SettingKey): void {
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}

export function resolveSetting(
  db: Database,
  key: SettingKey,
  envValue: string | undefined,
): string | undefined {
  return blankAsUndefined(envValue) ?? getSetting(db, key);
}

export interface EnvCredentials {
  readonly githubToken?: string | undefined;
  readonly asanaToken?: string | undefined;
}

/** The merged credential view every feature check reads from. */
export function resolveCredentials(
  db: Database,
  env: EnvCredentials,
): Required<FeatureCredentials> {
  return {
    githubToken: resolveSetting(db, "github_token", env.githubToken),
    asanaToken: resolveSetting(db, "asana_token", env.asanaToken),
    vapidPublicKey: getSetting(db, "vapid_public_key"),
    vapidPrivateKey: getSetting(db, "vapid_private_key"),
    telegramBotToken: getSetting(db, "telegram_bot_token"),
    telegramChatId: getSetting(db, "telegram_chat_id"),
  };
}

export function isSetupComplete(db: Database): boolean {
  return getSetting(db, "setup_complete") === "1";
}

export function markSetupComplete(db: Database): void {
  setSetting(db, "setup_complete", "1");
}
