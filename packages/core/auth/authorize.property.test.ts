import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { AUTH_MODES } from "../env";
import { decideAccess } from "./authorize";

const authMode = fc.constantFrom(...AUTH_MODES);
// Paths as a client can actually send them: any bytes after the leading slash.
const pathname = fc.string().map((s) => `/${s}`);

describe("decideAccess invariants", () => {
  it("never denies an authenticated caller, whatever the path or mode", () => {
    fc.assert(
      fc.property(pathname, authMode, (path, mode) => {
        expect(
          decideAccess({ pathname: path, authenticated: true, authMode: mode }),
        ).toEqual({ type: "allow" });
      }),
    );
  });

  // A redirect is unrenderable to a fetch() caller: it follows it, gets HTML,
  // and reports a parse error instead of "you are logged out".
  it("answers an unauthenticated API call with JSON, never a redirect", () => {
    fc.assert(
      fc.property(fc.string(), authMode, (rest, mode) => {
        const decision = decideAccess({
          pathname: `/api/${rest}`,
          authenticated: false,
          authMode: mode,
        });
        expect(decision.type).not.toBe("redirect-to-login");
      }),
    );
  });

  it("only ever returns a decision the middleware knows how to act on", () => {
    const known = new Set([
      "allow",
      "unauthorized-json",
      "unauthorized-text",
      "redirect-to-login",
    ]);
    fc.assert(
      fc.property(pathname, fc.boolean(), authMode, (path, authed, mode) => {
        const decision = decideAccess({
          pathname: path,
          authenticated: authed,
          authMode: mode,
        });
        expect(known.has(decision.type)).toBe(true);
      }),
    );
  });

  it("preserves the destination verbatim when it redirects", () => {
    fc.assert(
      fc.property(pathname, (path) => {
        const decision = decideAccess({
          pathname: path,
          authenticated: false,
          authMode: "password",
        });
        if (decision.type === "redirect-to-login") {
          expect(decision.next).toBe(path);
        }
      }),
    );
  });
});
