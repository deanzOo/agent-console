import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatSseEvent, parseSince } from "./sse";

// Event payloads come from the agent, so they carry arbitrary model output:
// newlines, control characters, unicode, whatever was in the file it just read.
const payload = fc.jsonValue();

describe("SSE frames survive any payload", () => {
  it("keeps the frame to one data line, so a newline cannot split it", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1 }), fc.string(), payload, (seq, type, data) => {
        const frame = formatSseEvent({
          seq,
          ts: "2026-01-01T00:00:00.000Z",
          type: type.replace(/\n/g, ""),
          payload: data,
        });

        const dataLines = frame.split("\n").filter((line) => line.startsWith("data: "));
        expect(dataLines).toHaveLength(1);
      }),
    );
  });

  it("terminates every frame with a blank line", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1 }), payload, (seq, data) => {
        const frame = formatSseEvent({
          seq,
          ts: "2026-01-01T00:00:00.000Z",
          type: "message",
          payload: data,
        });
        expect(frame.endsWith("\n\n")).toBe(true);
      }),
    );
  });
});

// The cursor arrives as a query string, so it is attacker-controlled and is
// used to slice a result set. A negative or NaN value must not reach the query.
describe("the replay cursor is always a usable offset", () => {
  it("is a non-negative integer for any input at all", () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), (raw) => {
        const since = parseSince(raw);
        expect(Number.isInteger(since)).toBe(true);
        expect(since).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("round-trips a positive integer unchanged", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), (n) => {
        expect(parseSince(String(n))).toBe(n);
      }),
    );
  });
});
