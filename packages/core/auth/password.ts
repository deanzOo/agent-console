import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, jwtVerify } from "jose";
import { readCookie } from "./cookies";
import type { AuthAdapter, User } from "./types";

export const SESSION_COOKIE = "agent_console_session";

const SCRYPT_SALT_LENGTH = 16;
const SCRYPT_KEY_LENGTH = 64;
const SESSION_ISSUER = "agent-console";
const DEFAULT_SESSION_LIFETIME = "30d";

const scryptAsync = promisify(scrypt);

// scrypt over argon2: stdlib, and no native compile step in the Docker image.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_LENGTH);
  const derived = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH);
  if (!Buffer.isBuffer(derived)) throw new Error("scrypt returned unexpected type");
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<boolean> {
  const [scheme, saltHex, keyHex] = storedHash.split(":");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  // A non-hex or truncated segment decodes short, and timingSafeEqual throws
  // on a length mismatch.
  if (salt.length !== SCRYPT_SALT_LENGTH || expected.length !== SCRYPT_KEY_LENGTH) {
    return false;
  }

  const derived = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH);
  if (!Buffer.isBuffer(derived)) return false;
  return timingSafeEqual(derived, expected);
}

export interface IssueSessionOptions {
  readonly expiresIn?: string;
}

export async function issueSession(
  secret: string,
  subject: string,
  options: IssueSessionOptions = {},
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(SESSION_ISSUER)
    .setSubject(subject)
    .setExpirationTime(options.expiresIn ?? DEFAULT_SESSION_LIFETIME)
    .sign(new TextEncoder().encode(secret));
}

export interface PasswordAdapterOptions {
  readonly sessionSecret: string;
}

export function createPasswordAdapter(options: PasswordAdapterOptions): AuthAdapter {
  const key = new TextEncoder().encode(options.sessionSecret);

  return {
    async getUser(request: Request): Promise<User | null> {
      const token = readCookie(request, SESSION_COOKIE);
      if (!token) return null;

      try {
        const { payload } = await jwtVerify(token, key, { issuer: SESSION_ISSUER });
        if (typeof payload.sub !== "string" || payload.sub === "") return null;
        return { id: payload.sub, email: undefined };
      } catch {
        return null;
      }
    },
  };
}
