import { describe, expect, it } from "vitest";
import { parseAsanaTasks, parseGithubIssues, readToolJson } from "./parse";

describe("readToolJson", () => {
  it("reads json out of a text content block", () => {
    expect(readToolJson({ content: [{ type: "text", text: '{"a":1}' }] })).toEqual({
      a: 1,
    });
  });

  it("concatenates multiple text blocks before parsing", () => {
    const result = readToolJson({
      content: [
        { type: "text", text: '{"a":' },
        { type: "text", text: "1}" },
      ],
    });
    expect(result).toEqual({ a: 1 });
  });

  it("returns undefined for a non-json body rather than throwing", () => {
    expect(
      readToolJson({ content: [{ type: "text", text: "not json" }] }),
    ).toBeUndefined();
  });

  it("returns undefined when there is no content", () => {
    expect(readToolJson({})).toBeUndefined();
  });

  it("ignores non-text blocks", () => {
    expect(
      readToolJson({
        content: [
          { type: "image", data: "..." },
          { type: "text", text: "[1,2]" },
        ],
      }),
    ).toEqual([1, 2]);
  });
});

describe("parseGithubIssues", () => {
  const issue = {
    number: 12,
    title: "Login is broken",
    state: "open",
    html_url: "https://github.com/o/r/issues/12",
    labels: [{ name: "bug" }, { name: "p1" }],
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("maps the fields the panel needs", () => {
    expect(parseGithubIssues("o/r", [issue])).toEqual([
      {
        repo: "o/r",
        number: 12,
        title: "Login is broken",
        state: "open",
        labelsJson: '["bug","p1"]',
        url: "https://github.com/o/r/issues/12",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);
  });

  it("accepts labels given as plain strings", () => {
    const parsed = parseGithubIssues("o/r", [{ ...issue, labels: ["bug"] }]);
    expect(parsed[0]?.labelsJson).toBe('["bug"]');
  });

  it("tolerates a missing labels field", () => {
    const parsed = parseGithubIssues("o/r", [{ ...issue, labels: undefined }]);
    expect(parsed[0]?.labelsJson).toBe("[]");
  });

  it("skips pull requests, which the issues endpoint also returns", () => {
    expect(parseGithubIssues("o/r", [{ ...issue, pull_request: {} }])).toEqual([]);
  });

  it("skips an entry with no number", () => {
    expect(parseGithubIssues("o/r", [{ ...issue, number: undefined }])).toEqual([]);
  });

  it("returns nothing for a non-array payload", () => {
    expect(parseGithubIssues("o/r", "nope")).toEqual([]);
  });

  it("unwraps a paginated { items: [...] } shape", () => {
    expect(parseGithubIssues("o/r", { items: [issue] })).toHaveLength(1);
  });
});

describe("parseAsanaTasks", () => {
  const task = {
    gid: "1234",
    name: "Ship the console",
    completed: false,
    due_on: "2026-02-01",
    permalink_url: "https://app.asana.com/0/1/1234",
    modified_at: "2026-01-01T00:00:00Z",
    projects: [{ name: "Platform" }],
  };

  it("maps the fields the panel needs", () => {
    expect(parseAsanaTasks([task])).toEqual([
      {
        gid: "1234",
        name: "Ship the console",
        project: "Platform",
        dueOn: "2026-02-01",
        permalink: "https://app.asana.com/0/1/1234",
        completed: false,
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);
  });

  it("tolerates a task with no project", () => {
    expect(parseAsanaTasks([{ ...task, projects: [] }])[0]?.project).toBeNull();
  });

  it("treats a missing completed flag as not completed", () => {
    expect(parseAsanaTasks([{ ...task, completed: undefined }])[0]?.completed).toBe(
      false,
    );
  });

  it("skips an entry with no gid", () => {
    expect(parseAsanaTasks([{ ...task, gid: undefined }])).toEqual([]);
  });

  it("unwraps the { data: [...] } envelope the api returns", () => {
    expect(parseAsanaTasks({ data: [task] })).toHaveLength(1);
  });

  it("returns nothing for a non-array payload", () => {
    expect(parseAsanaTasks(null)).toEqual([]);
  });
});
