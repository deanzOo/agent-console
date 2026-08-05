import { describe, expect, it } from "vitest";
import { matchRoute } from "./routes";

const get = (pathname: string) => matchRoute({ method: "GET", pathname });
const post = (pathname: string) => matchRoute({ method: "POST", pathname });

describe("matchRoute", () => {
  it("recognises the health probe", () => {
    expect(get("/health")).toEqual({ kind: "health" });
  });

  it("recognises a launch", () => {
    expect(post("/missions")).toEqual({ kind: "launch" });
  });

  it.each([
    ["answer", "POST"],
    ["interrupt", "POST"],
    ["stop", "POST"],
    ["resume", "POST"],
  ])("recognises %s", (action) => {
    expect(post(`/missions/abc-123/${action}`)).toEqual({
      kind: "mission",
      id: "abc-123",
      action,
    });
  });

  it("recognises the event stream", () => {
    expect(get("/missions/abc-123/events")).toEqual({
      kind: "mission",
      id: "abc-123",
      action: "events",
    });
  });

  it("tolerates a trailing slash", () => {
    expect(post("/missions/")).toEqual({ kind: "launch" });
  });

  // Answering with the wrong verb should not silently do nothing; it is a
  // different route, and the server answers 404 rather than pretending.
  it("does not match an action under the wrong method", () => {
    expect(get("/missions/abc/answer").kind).toBe("unknown");
    expect(post("/missions/abc/events").kind).toBe("unknown");
  });

  it("decodes the mission id, which the caller percent-encodes", () => {
    expect(post("/missions/a%2Fb/answer")).toEqual({
      kind: "mission",
      id: "a/b",
      action: "answer",
    });
  });

  it("treats a malformed escape as no route rather than throwing", () => {
    expect(post("/missions/%E0%A4%A/answer").kind).toBe("unknown");
  });

  it("rejects anything outside the two known prefixes", () => {
    expect(get("/").kind).toBe("unknown");
    expect(get("/missions/abc").kind).toBe("unknown");
    expect(post("/missions/abc/delete").kind).toBe("unknown");
    expect(get("/healthz").kind).toBe("unknown");
  });
});
