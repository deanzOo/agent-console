import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from "jose";
import type { JWK } from "jose";
import { ACCESS_JWT_HEADER, createCloudflareAccessAdapter } from "./cloudflare";

const TEAM_DOMAIN = "team.example.invalid";
const ISSUER = `https://${TEAM_DOMAIN}`;
const AUD = "audience-tag";

let signingKey: CryptoKey;
let otherKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  const other = await generateKeyPair("RS256", { extractable: true });
  signingKey = pair.privateKey;
  otherKey = other.privateKey;

  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), alg: "RS256", kid: "k1" };
  jwks = createLocalJWKSet({ keys: [jwk] });
});

interface TokenOptions {
  readonly aud?: string;
  readonly issuer?: string;
  readonly expiresIn?: string;
  readonly email?: string;
  readonly key?: CryptoKey;
}

async function token(options: TokenOptions = {}) {
  return new SignJWT({ email: options.email ?? "operator@example.invalid" })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuedAt()
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.aud ?? AUD)
    .setExpirationTime(options.expiresIn ?? "5m")
    .sign(options.key ?? signingKey);
}

function adapter() {
  return createCloudflareAccessAdapter({
    teamDomain: TEAM_DOMAIN,
    aud: AUD,
    keys: jwks,
  });
}

function request(headers: Record<string, string> = {}) {
  return new Request("https://console.example.invalid/", { headers });
}

describe("cloudflare access adapter", () => {
  it("accepts a correctly signed token and reports the identity", async () => {
    const user = await adapter().getUser(
      request({ [ACCESS_JWT_HEADER]: await token() }),
    );
    expect(user).toEqual({
      id: "operator@example.invalid",
      email: "operator@example.invalid",
    });
  });

  it("also reads the token from the CF_Authorization cookie", async () => {
    const user = await adapter().getUser(
      request({ cookie: `CF_Authorization=${await token()}` }),
    );
    expect(user?.email).toBe("operator@example.invalid");
  });

  it("prefers the header when both are present", async () => {
    const user = await adapter().getUser(
      request({
        [ACCESS_JWT_HEADER]: await token({ email: "header@example.invalid" }),
        cookie: `CF_Authorization=${await token({ email: "cookie@example.invalid" })}`,
      }),
    );
    expect(user?.email).toBe("header@example.invalid");
  });

  it("rejects a request with no token at all", async () => {
    expect(await adapter().getUser(request())).toBeNull();
  });

  it("rejects a token minted for a different Access application", async () => {
    const user = await adapter().getUser(
      request({ [ACCESS_JWT_HEADER]: await token({ aud: "someone-elses-app" }) }),
    );
    expect(user).toBeNull();
  });

  it("rejects a token from a different team domain", async () => {
    const user = await adapter().getUser(
      request({ [ACCESS_JWT_HEADER]: await token({ issuer: "https://evil.invalid" }) }),
    );
    expect(user).toBeNull();
  });

  it("rejects an expired token", async () => {
    const user = await adapter().getUser(
      request({ [ACCESS_JWT_HEADER]: await token({ expiresIn: "-1m" }) }),
    );
    expect(user).toBeNull();
  });

  it("rejects a token signed by an unknown key", async () => {
    const user = await adapter().getUser(
      request({ [ACCESS_JWT_HEADER]: await token({ key: otherKey }) }),
    );
    expect(user).toBeNull();
  });

  it("rejects a malformed token rather than throwing", async () => {
    const user = await adapter().getUser(request({ [ACCESS_JWT_HEADER]: "not-a-jwt" }));
    expect(user).toBeNull();
  });

  it("falls back to the subject when the token carries no email", async () => {
    const raw = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUD)
      .setSubject("sub-123")
      .setExpirationTime("5m")
      .sign(signingKey);

    const user = await adapter().getUser(request({ [ACCESS_JWT_HEADER]: raw }));
    expect(user).toEqual({ id: "sub-123", email: undefined });
  });
});
