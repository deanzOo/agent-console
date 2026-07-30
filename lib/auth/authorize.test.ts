import { describe, expect, it } from "vitest";
import { decideAccess } from "./authorize";

describe("decideAccess", () => {
  describe("authenticated", () => {
    it("allows any path", () => {
      const decision = decideAccess({
        pathname: "/missions/abc",
        authenticated: true,
        authMode: "cloudflare-access",
      });
      expect(decision).toEqual({ type: "allow" });
    });
  });

  describe("public paths", () => {
    it("allows the login page without a session", () => {
      expect(
        decideAccess({
          pathname: "/login",
          authenticated: false,
          authMode: "password",
        }),
      ).toEqual({ type: "allow" });
    });

    it("allows the service worker, which registers before login", () => {
      expect(
        decideAccess({
          pathname: "/sw.js",
          authenticated: false,
          authMode: "password",
        }),
      ).toEqual({ type: "allow" });
    });

    it("allows the web manifest", () => {
      expect(
        decideAccess({
          pathname: "/manifest.webmanifest",
          authenticated: false,
          authMode: "password",
        }),
      ).toEqual({ type: "allow" });
    });

    it("allows PWA icons", () => {
      expect(
        decideAccess({
          pathname: "/icons/192.png",
          authenticated: false,
          authMode: "password",
        }),
      ).toEqual({ type: "allow" });
    });

    it("does not treat a path merely starting with /login as public", () => {
      expect(
        decideAccess({
          pathname: "/loginsecrets",
          authenticated: false,
          authMode: "password",
        }).type,
      ).not.toBe("allow");
    });
  });

  describe("unauthenticated API calls", () => {
    it("returns 401 json rather than a redirect the client cannot render", () => {
      expect(
        decideAccess({
          pathname: "/api/missions",
          authenticated: false,
          authMode: "password",
        }),
      ).toEqual({ type: "unauthorized-json" });
    });

    it("does the same under cloudflare-access", () => {
      expect(
        decideAccess({
          pathname: "/api/missions",
          authenticated: false,
          authMode: "cloudflare-access",
        }),
      ).toEqual({ type: "unauthorized-json" });
    });
  });

  describe("unauthenticated page loads", () => {
    it("redirects to login under password mode, preserving the destination", () => {
      expect(
        decideAccess({
          pathname: "/missions/abc",
          authenticated: false,
          authMode: "password",
        }),
      ).toEqual({ type: "redirect-to-login", next: "/missions/abc" });
    });

    it("returns 401 under cloudflare-access, since there is no in-app login", () => {
      expect(
        decideAccess({
          pathname: "/missions/abc",
          authenticated: false,
          authMode: "cloudflare-access",
        }),
      ).toEqual({ type: "unauthorized-text" });
    });

    it("returns 401 under trusted-network, which should never reach here", () => {
      expect(
        decideAccess({
          pathname: "/",
          authenticated: false,
          authMode: "trusted-network",
        }),
      ).toEqual({ type: "unauthorized-text" });
    });
  });
});
