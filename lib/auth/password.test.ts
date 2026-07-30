import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE,
  createPasswordAdapter,
  hashPassword,
  issueSession,
  verifyPassword,
} from "./password";

const SECRET = "test-session-secret-not-a-real-one";

function request(headers: Record<string, string> = {}) {
  return new Request("https://console.example.invalid/", { headers });
}

describe("hashPassword / verifyPassword", () => {
  it("accepts the correct password", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword(hash, "correct horse")).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword(hash, "battery staple")).toBe(false);
  });

  it("salts, so the same password hashes differently each time", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects a malformed stored hash instead of throwing", async () => {
    expect(await verifyPassword("garbage", "anything")).toBe(false);
  });

  it("rejects a hash with a corrupted salt segment", async () => {
    const hash = await hashPassword("pw");
    const parts = hash.split(":");
    expect(await verifyPassword(`${parts[0]}:!!!:${parts[2]}`, "pw")).toBe(false);
  });
});

describe("password adapter", () => {
  it("accepts a session cookie it issued", async () => {
    const cookie = await issueSession(SECRET, "operator");
    const user = await createPasswordAdapter({ sessionSecret: SECRET }).getUser(
      request({ cookie: `${SESSION_COOKIE}=${cookie}` }),
    );
    expect(user).toEqual({ id: "operator", email: undefined });
  });

  it("rejects a request with no session cookie", async () => {
    const user = await createPasswordAdapter({ sessionSecret: SECRET }).getUser(
      request(),
    );
    expect(user).toBeNull();
  });

  it("rejects a session signed with a different secret", async () => {
    const cookie = await issueSession("some-other-secret", "operator");
    const user = await createPasswordAdapter({ sessionSecret: SECRET }).getUser(
      request({ cookie: `${SESSION_COOKIE}=${cookie}` }),
    );
    expect(user).toBeNull();
  });

  it("rejects an expired session", async () => {
    const cookie = await issueSession(SECRET, "operator", { expiresIn: "-1s" });
    const user = await createPasswordAdapter({ sessionSecret: SECRET }).getUser(
      request({ cookie: `${SESSION_COOKIE}=${cookie}` }),
    );
    expect(user).toBeNull();
  });

  it("rejects a tampered cookie rather than throwing", async () => {
    const user = await createPasswordAdapter({ sessionSecret: SECRET }).getUser(
      request({ cookie: `${SESSION_COOKIE}=not-a-jwt` }),
    );
    expect(user).toBeNull();
  });
});
