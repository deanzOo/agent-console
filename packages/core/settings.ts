import { eq } from "drizzle-orm";
import type { FeatureCredentials } from "./features";
import type { Db } from "./db";
import { settings } from "./schema";

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
  | "default_base_branch"
  | "max_concurrent_missions"
  | "sync_interval_seconds"
  | "git_user_name"
  | "git_user_email";

function blankAsUndefined(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getSetting(db: Db, key: SettingKey): string | undefined {
  const row = db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .get();
  return blankAsUndefined(row?.value);
}

export function setSetting(db: Db, key: SettingKey, value: string): void {
  const normalized = blankAsUndefined(value);
  if (normalized === undefined) {
    deleteSetting(db, key);
    return;
  }
  db.insert(settings)
    .values({ key, value: normalized })
    .onConflictDoUpdate({ target: settings.key, set: { value: normalized } })
    .run();
}

export function deleteSetting(db: Db, key: SettingKey): void {
  db.delete(settings).where(eq(settings.key, key)).run();
}

// Env wins so a deployment can pin a value the UI cannot silently change.
export function resolveSetting(
  db: Db,
  key: SettingKey,
  envValue: string | undefined,
): string | undefined {
  return blankAsUndefined(envValue) ?? getSetting(db, key);
}

export interface EnvCredentials {
  readonly githubToken?: string | undefined;
  readonly asanaToken?: string | undefined;
}

export function resolveCredentials(
  db: Db,
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

export function isSetupComplete(db: Db): boolean {
  return getSetting(db, "setup_complete") === "1";
}

export function markSetupComplete(db: Db): void {
  setSetting(db, "setup_complete", "1");
}
