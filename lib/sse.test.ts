import { describe, expect, it } from "vitest";
import { formatSseEvent, parseSince } from "./sse";

describe("parseSince", () => {
  it("defaults to 0 when absent, so a new reader gets the whole transcript", () => {
    expect(parseSince(null)).toBe(0);
  });

  it("reads a cursor", () => {
    expect(parseSince("42")).toBe(42);
  });

  it("treats a non-numeric cursor as the beginning rather than failing", () => {
    expect(parseSince("banana")).toBe(0);
  });

  it("treats a negative cursor as the beginning", () => {
    expect(parseSince("-5")).toBe(0);
  });

  it("truncates a fractional cursor", () => {
    expect(parseSince("3.9")).toBe(3);
  });

  it("ignores an empty string", () => {
    expect(parseSince("")).toBe(0);
  });
});

describe("formatSseEvent", () => {
  it("emits the id, so EventSource resumes from the right place", () => {
    const frame = formatSseEvent({ seq: 7, ts: "t", type: "text", payload: {} });
    expect(frame).toContain("id: 7\n");
  });

  it("names the event type", () => {
    const frame = formatSseEvent({
      seq: 1,
      ts: "t",
      type: "agent.assistant",
      payload: {},
    });
    expect(frame).toContain("event: agent.assistant\n");
  });

  it("serialises the payload as json data", () => {
    const frame = formatSseEvent({ seq: 1, ts: "t", type: "text", payload: { a: 1 } });
    expect(frame).toContain(
      'data: {"seq":1,"ts":"t","type":"text","payload":{"a":1}}\n',
    );
  });

  it("ends with a blank line, which is what terminates a frame", () => {
    expect(formatSseEvent({ seq: 1, ts: "t", type: "text", payload: {} })).toMatch(
      /\n\n$/,
    );
  });

  it("keeps a multi-line payload on one data line so the frame stays valid", () => {
    const frame = formatSseEvent({
      seq: 1,
      ts: "t",
      type: "text",
      payload: { text: "line one\nline two" },
    });
    const dataLines = frame.split("\n").filter((line) => line.startsWith("data: "));
    expect(dataLines).toHaveLength(1);
  });
});
