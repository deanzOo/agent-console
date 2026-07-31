import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Db } from "./db";
import { getSetting, isSetupComplete, setSetting } from "./settings";
import {
  applySetupStep,
  canAccessSetup,
  setupState,
  validateGithubToken,
} from "./setup";

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "claudevps-setup-"));
  db = openDatabase(path.join(dir, "data.db"));
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("setupState", () => {
  it("reports a fresh install as incomplete with nothing configured", () => {
    expect(setupState(db, { authMode: "password" })).toMatchObject({
      complete: false,
      passwordSet: false,
      github: false,
      asana: false,
      telegram: false,
      push: false,
    });
  });

  it("does not ask for a password outside password mode", () => {
    expect(setupState(db, { authMode: "cloudflare-access" }).needsPassword).toBe(false);
  });

  it("asks for a password in password mode until one is set", () => {
    expect(setupState(db, { authMode: "password" }).needsPassword).toBe(true);
    setSetting(db, "password_hash", "scrypt:aa:bb");
    expect(setupState(db, { authMode: "password" }).needsPassword).toBe(false);
  });

  it("reflects a token supplied by the environment, not just the database", () => {
    expect(setupState(db, { authMode: "password", githubToken: "env" }).github).toBe(
      true,
    );
  });

  it("reports completion once marked", () => {
    setSetting(db, "setup_complete", "1");
    expect(setupState(db, { authMode: "password" }).complete).toBe(true);
  });
});

describe("applySetupStep", () => {
  it("hashes the password rather than storing it", async () => {
    await applySetupStep(db, { step: "password", password: "hunter2hunter2" });
    const stored = getSetting(db, "password_hash");
    expect(stored).toMatch(/^scrypt:/);
    expect(stored).not.toContain("hunter2");
  });

  it("rejects a password too short to be worth hashing", async () => {
    await expect(
      applySetupStep(db, { step: "password", password: "short" }),
    ).rejects.toThrowError(/8 characters/);
  });

  it("accepts a password at exactly the minimum", async () => {
    await applySetupStep(db, { step: "password", password: "8charact" });
    expect(getSetting(db, "password_hash")).toMatch(/^scrypt:/);
  });

  it("stores a github token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ login: "me" })));
    await applySetupStep(db, { step: "github", token: "github_pat_x" });
    expect(getSetting(db, "github_token")).toBe("github_pat_x");
  });

  it("refuses to store a github token the api rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 401 })),
    );
    await expect(
      applySetupStep(db, { step: "github", token: "bad" }),
    ).rejects.toThrowError(/rejected|401/i);
    expect(getSetting(db, "github_token")).toBeUndefined();
  });

  it("stores telegram credentials together", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));
    await applySetupStep(db, { step: "telegram", botToken: "bot", chatId: "1" });
    expect(getSetting(db, "telegram_bot_token")).toBe("bot");
    expect(getSetting(db, "telegram_chat_id")).toBe("1");
  });

  it("generates a vapid keypair rather than asking for one", async () => {
    await applySetupStep(db, { step: "push", subject: "mailto:me@example.invalid" });
    expect(getSetting(db, "vapid_public_key")).toBeTruthy();
    expect(getSetting(db, "vapid_private_key")).toBeTruthy();
  });

  it("marks setup complete on finish", async () => {
    await applySetupStep(db, { step: "finish" });
    expect(isSetupComplete(db)).toBe(true);
  });
});

describe("validateGithubToken", () => {
  it("accepts a token the api recognises", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ login: "me" })));
    await expect(validateGithubToken("t")).resolves.toBe("me");
  });

  it("throws with the status when the api rejects it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 403 })),
    );
    await expect(validateGithubToken("t")).rejects.toThrowError(/403/);
  });
});

describe("canAccessSetup", () => {
  it("allows an authenticated caller", () => {
    expect(
      canAccessSetup({ authenticated: true, authMode: "password", passwordSet: true }),
    ).toBe(true);
  });

  it("allows an anonymous caller in password mode before a password exists", () => {
    expect(
      canAccessSetup({
        authenticated: false,
        authMode: "password",
        passwordSet: false,
      }),
    ).toBe(true);
  });

  it("denies an anonymous caller once a password is set", () => {
    expect(
      canAccessSetup({
        authenticated: false,
        authMode: "password",
        passwordSet: false,
      }),
    ).toBe(true);
    expect(
      canAccessSetup({ authenticated: false, authMode: "password", passwordSet: true }),
    ).toBe(false);
  });

  it("denies an anonymous caller under cloudflare-access, where reaching here means the edge was bypassed", () => {
    expect(
      canAccessSetup({
        authenticated: false,
        authMode: "cloudflare-access",
        passwordSet: false,
      }),
    ).toBe(false);
  });

  it("denies an anonymous caller under trusted-network, whose adapter always yields a user", () => {
    expect(
      canAccessSetup({
        authenticated: false,
        authMode: "trusted-network",
        passwordSet: false,
      }),
    ).toBe(false);
  });
});
