import { beforeEach, describe, expect, it, vi } from "vitest";

const getConfig = vi.fn();
const getSetting = vi.fn();
const verifyPassword = vi.fn();
const issueSession = vi.fn();

vi.mock("@agent-console/core/db", () => ({ getDatabase: () => ({}) }));
vi.mock("@agent-console/core/env", () => ({ getConfig }));
vi.mock("@agent-console/core/settings", () => ({ getSetting }));
vi.mock("@agent-console/core/auth", () => ({
  SESSION_COOKIE: "session",
  verifyPassword,
  issueSession,
}));

const { POST } = await import("./route");

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getConfig.mockReturnValue({ authMode: "password", sessionSecret: "s".repeat(32) });
  getSetting.mockReturnValue("stored-hash");
  verifyPassword.mockResolvedValue(true);
  issueSession.mockResolvedValue("a-token");
});

describe("POST /api/login", () => {
  it("issues a session cookie for the right password", async () => {
    const response = await post({ password: "correct horse" });

    expect(response.status).toBe(200);
    expect(response.cookies.get("session")?.value).toBe("a-token");
  });

  // A cookie readable by script, sent to any site, or sent in the clear is the
  // whole session — these flags are the protection, not a formality.
  it("sets the cookie so script cannot read it and other sites cannot send it", () => {
    return post({ password: "correct horse" }).then((response) => {
      const cookie = response.cookies.get("session");
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true });
    });
  });

  it("rejects the wrong password", async () => {
    verifyPassword.mockResolvedValue(false);

    const response = await post({ password: "wrong" });

    expect(response.status).toBe(401);
    expect(response.cookies.get("session")).toBeUndefined();
  });

  // Telling an unauthenticated caller that no password is set would say
  // something about the deployment that it should not.
  it("answers the same way when no password has been set", async () => {
    getSetting.mockReturnValue(undefined);

    const response = await post({ password: "anything" });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid_credentials" });
  });

  it("is absent unless the deployment uses password auth", async () => {
    getConfig.mockReturnValue({
      authMode: "cloudflare-access",
      sessionSecret: undefined,
    });

    expect((await post({ password: "x" })).status).toBe(404);
  });

  it("refuses an empty password without checking it", async () => {
    expect((await post({ password: "" })).status).toBe(400);
    expect(verifyPassword).not.toHaveBeenCalled();
  });
});
