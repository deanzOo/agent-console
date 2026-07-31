import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatSseEvent, parseSince } from "./sse";

// Event payloads come from the agent, so they carry arbitrary model output:
// newlines, control characters, unicode, whatever was in the file it just read.
const payload = fc.jsonValue();

// fc.string() emits printable ASCII only, so it would never produce the line
// terminator this is about. The alphabet is spelled out for that reason.
const typeName = fc
  .array(fc.constantFrom("a", "z", ".", ":", " ", "\r", "\n", " "))
  .map((chars) => chars.join(""));

describe("SSE frames survive any payload", () => {
  it("keeps the frame to one data line, so a newline cannot split it", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1 }), typeName, payload, (seq, type, data) => {
        const frame = formatSseEvent({
          seq,
          ts: "2026-01-01T00:00:00.000Z",
          type,
          payload: data,
        });

        // A bare \r terminates a line under the SSE spec just as \n does, so
        // splitting on \n alone would hide exactly the injection being tested.
        // A frame is exactly three fields. Counting only recognised prefixes
        // would miss an injected line that happens not to spell one.
        const lines = frame.split(/\r\n|\r|\n/).filter((line) => line !== "");
        expect(lines).toHaveLength(3);
        expect(lines[0]?.startsWith("id: ")).toBe(true);
        expect(lines[1]?.startsWith("event: ")).toBe(true);
        expect(lines[2]?.startsWith("data: ")).toBe(true);
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
