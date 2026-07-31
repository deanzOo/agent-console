import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import webpush from "web-push";
import { openDatabase, type Db } from "./db";
import { setSetting } from "./settings";
import { configuredChannels, telegramChannel } from "./notify-channels";

let dir: string;
let db: Db;

const message = { title: "Waiting on you", body: "Fix the bug", url: "/missions/m1" };

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "claudevps-notify-"));
  db = openDatabase(path.join(dir, "data.db"));
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("telegramChannel", () => {
  it("posts the message to the bot api", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await telegramChannel("bot-token", "chat-1").send(message);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.telegram.org/botbot-token/sendMessage");
    const body = JSON.parse(Object(init).body);
    expect(body.chat_id).toBe("chat-1");
    expect(body.text).toContain("Waiting on you");
    expect(body.text).toContain("Fix the bug");
  });

  it("throws when telegram rejects the message, so the failure is recorded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 401 })),
    );

    await expect(telegramChannel("bad", "chat-1").send(message)).rejects.toThrowError(
      /401/,
    );
  });
});

describe("configuredChannels", () => {
  it("returns nothing on a fresh install", () => {
    expect(configuredChannels(db)).toEqual([]);
  });

  it("enables telegram once both the token and chat id are set", () => {
    setSetting(db, "telegram_bot_token", "bot");
    setSetting(db, "telegram_chat_id", "chat");
    expect(configuredChannels(db).map((channel) => channel.name)).toEqual(["telegram"]);
  });

  it("leaves telegram off with only a token, since there is nowhere to send", () => {
    setSetting(db, "telegram_bot_token", "bot");
    expect(configuredChannels(db)).toEqual([]);
  });

  it("leaves telegram off with only a chat id", () => {
    setSetting(db, "telegram_chat_id", "chat");
    expect(configuredChannels(db)).toEqual([]);
  });

  it("enables push once both VAPID keys are set", () => {
    const keys = webpush.generateVAPIDKeys();
    setSetting(db, "vapid_public_key", keys.publicKey);
    setSetting(db, "vapid_private_key", keys.privateKey);
    expect(configuredChannels(db).map((channel) => channel.name)).toContain("push");
  });

  it("leaves push off with only one key", () => {
    setSetting(db, "vapid_public_key", webpush.generateVAPIDKeys().publicKey);
    expect(configuredChannels(db)).toEqual([]);
  });

  it("disables only push when the stored keypair is malformed", () => {
    setSetting(db, "telegram_bot_token", "bot");
    setSetting(db, "telegram_chat_id", "chat");
    setSetting(db, "vapid_public_key", "not-a-key");
    setSetting(db, "vapid_private_key", "also-not-a-key");

    expect(configuredChannels(db).map((channel) => channel.name)).toEqual(["telegram"]);
  });

  it("enables both when both are configured", () => {
    setSetting(db, "telegram_bot_token", "bot");
    setSetting(db, "telegram_chat_id", "chat");
    const keys = webpush.generateVAPIDKeys();
    setSetting(db, "vapid_public_key", keys.publicKey);
    setSetting(db, "vapid_private_key", keys.privateKey);

    expect(
      configuredChannels(db)
        .map((channel) => channel.name)
        .sort(),
    ).toEqual(["push", "telegram"]);
  });
});
