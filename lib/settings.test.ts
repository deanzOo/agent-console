import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Database } from "better-sqlite3";
import { openDatabase } from "./db";
import {
  deleteSetting,
  getSetting,
  isSetupComplete,
  markSetupComplete,
  resolveCredentials,
  resolveSetting,
  setSetting,
} from "./settings";

let dir: string;
let db: Database;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "claudevps-settings-"));
  db = openDatabase(path.join(dir, "data.db"));
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("get/set/delete", () => {
  it("returns undefined for a key that was never set", () => {
    expect(getSetting(db, "github_token")).toBeUndefined();
  });

  it("round-trips a value", () => {
    setSetting(db, "github_token", "abc");
    expect(getSetting(db, "github_token")).toBe("abc");
  });

  it("overwrites an existing value rather than erroring on the key", () => {
    setSetting(db, "github_token", "abc");
    setSetting(db, "github_token", "def");
    expect(getSetting(db, "github_token")).toBe("def");
  });

  it("treats storing a blank value as clearing the key", () => {
    setSetting(db, "github_token", "abc");
    setSetting(db, "github_token", "   ");
    expect(getSetting(db, "github_token")).toBeUndefined();
  });

  it("deletes a key", () => {
    setSetting(db, "github_token", "abc");
    deleteSetting(db, "github_token");
    expect(getSetting(db, "github_token")).toBeUndefined();
  });

  it("ignores deleting a key that was never set", () => {
    expect(() => deleteSetting(db, "asana_token")).not.toThrow();
  });
});

describe("resolveSetting", () => {
  it("prefers the environment over the stored value", () => {
    setSetting(db, "github_token", "from-db");
    expect(resolveSetting(db, "github_token", "from-env")).toBe("from-env");
  });

  it("falls back to the stored value when the environment is unset", () => {
    setSetting(db, "github_token", "from-db");
    expect(resolveSetting(db, "github_token", undefined)).toBe("from-db");
  });

  it("treats a blank environment value as unset", () => {
    setSetting(db, "github_token", "from-db");
    expect(resolveSetting(db, "github_token", "  ")).toBe("from-db");
  });

  it("returns undefined when neither source has a value", () => {
    expect(resolveSetting(db, "github_token", undefined)).toBeUndefined();
  });
});

describe("resolveCredentials", () => {
  it("merges env and stored values with env winning per key", () => {
    setSetting(db, "github_token", "db-github");
    setSetting(db, "asana_token", "db-asana");

    const credentials = resolveCredentials(db, {
      githubToken: "env-github",
      asanaToken: undefined,
    });

    expect(credentials.githubToken).toBe("env-github");
    expect(credentials.asanaToken).toBe("db-asana");
  });

  it("exposes notification credentials stored during setup", () => {
    setSetting(db, "vapid_public_key", "pub");
    setSetting(db, "vapid_private_key", "priv");
    setSetting(db, "telegram_bot_token", "bot");
    setSetting(db, "telegram_chat_id", "123");

    expect(resolveCredentials(db, {})).toMatchObject({
      vapidPublicKey: "pub",
      vapidPrivateKey: "priv",
      telegramBotToken: "bot",
      telegramChatId: "123",
    });
  });

  it("leaves everything unset on a fresh install", () => {
    expect(resolveCredentials(db, {})).toEqual({
      githubToken: undefined,
      asanaToken: undefined,
      vapidPublicKey: undefined,
      vapidPrivateKey: undefined,
      telegramBotToken: undefined,
      telegramChatId: undefined,
    });
  });
});

describe("setup state", () => {
  it("reports an unconfigured install as incomplete", () => {
    expect(isSetupComplete(db)).toBe(false);
  });

  it("reports complete once marked", () => {
    markSetupComplete(db);
    expect(isSetupComplete(db)).toBe(true);
  });
});
