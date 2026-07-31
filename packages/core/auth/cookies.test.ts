import { describe, expect, it } from "vitest";
import { readCookie } from "./cookies";

function request(cookie?: string) {
  return new Request(
    "https://console.example.invalid/",
    cookie === undefined ? {} : { headers: { cookie } },
  );
}

describe("readCookie", () => {
  it("returns undefined when the request has no cookie header", () => {
    expect(readCookie(request(), "a")).toBeUndefined();
  });

  it("reads a lone cookie", () => {
    expect(readCookie(request("a=1"), "a")).toBe("1");
  });

  it("reads a cookie from the middle of the header", () => {
    expect(readCookie(request("a=1; b=2; c=3"), "b")).toBe("2");
  });

  it("tolerates missing whitespace between pairs", () => {
    expect(readCookie(request("a=1;b=2"), "b")).toBe("2");
  });

  it("returns undefined for a name that is not present", () => {
    expect(readCookie(request("a=1; b=2"), "c")).toBeUndefined();
  });

  it("does not match on a name that is only a prefix of another", () => {
    expect(readCookie(request("session_extra=1"), "session")).toBeUndefined();
  });

  it("keeps a value containing '=', as JWTs and base64 padding do", () => {
    expect(readCookie(request("t=aa.bb==; x=1"), "t")).toBe("aa.bb==");
  });

  it("skips a malformed segment with no '='", () => {
    expect(readCookie(request("garbage; a=1"), "a")).toBe("1");
  });

  it("returns an empty value rather than undefined when the cookie is blank", () => {
    expect(readCookie(request("a=; b=2"), "a")).toBe("");
  });
});
