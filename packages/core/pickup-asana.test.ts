import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addAsanaTaskTag,
  commentOnAsanaTask,
  removeAsanaTaskTag,
} from "./pickup-asana";

const ref = { token: "t", taskGid: "task1", workspaceGid: "ws1" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("addAsanaTaskTag", () => {
  it("creates the tag first when the workspace has never used it", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (String(url).includes("/tags?")) return Response.json({ data: [] });
        if (String(url).endsWith("/tags")) {
          return Response.json({ data: { gid: "tag1", name: "agent-picked-up" } });
        }
        return Response.json({ data: {} });
      }),
    );

    await addAsanaTaskTag(ref, "agent-picked-up");

    expect(calls).toEqual([
      "GET https://app.asana.com/api/1.0/tags?workspace=ws1&opt_fields=name",
      "POST https://app.asana.com/api/1.0/tags",
      "POST https://app.asana.com/api/1.0/tasks/task1/addTag",
    ]);
  });

  it("reuses a tag the workspace already has", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (String(url).includes("/tags?")) {
          return Response.json({ data: [{ gid: "tag1", name: "agent-picked-up" }] });
        }
        return Response.json({ data: {} });
      }),
    );

    await addAsanaTaskTag(ref, "agent-picked-up");

    expect(calls).toEqual([
      "GET https://app.asana.com/api/1.0/tags?workspace=ws1&opt_fields=name",
      "POST https://app.asana.com/api/1.0/tasks/task1/addTag",
    ]);
  });

  it("reports a refusal rather than swallowing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ errors: [] }, { status: 402 })),
    );

    await expect(addAsanaTaskTag(ref, "agent-picked-up")).rejects.toThrow(/402/);
  });
});

describe("removeAsanaTaskTag", () => {
  it("removes the tag when the workspace has it", async () => {
    const fetchMock = vi.fn(async (url: string | URL) =>
      String(url).includes("/tags?")
        ? Response.json({ data: [{ gid: "tag1", name: "agent-picked-up" }] })
        : Response.json({ data: {} }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await removeAsanaTaskTag(ref, "agent-picked-up");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.asana.com/api/1.0/tasks/task1/removeTag",
      expect.objectContaining({ method: "POST" }),
    );
  });

  // No tag on the workspace means there is nothing on the task to take off.
  it("is quiet when the workspace never had the tag", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(removeAsanaTaskTag(ref, "agent-picked-up")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("commentOnAsanaTask", () => {
  it("posts a story to the task", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: {} }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await commentOnAsanaTask({ token: "t", taskGid: "task1" }, "Picked up.");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.asana.com/api/1.0/tasks/task1/stories",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ data: { text: "Picked up." } }),
      }),
    );
  });

  it("reports a refusal rather than swallowing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ errors: [] }, { status: 403 })),
    );

    await expect(
      commentOnAsanaTask({ token: "t", taskGid: "task1" }, "x"),
    ).rejects.toThrow(/403/);
  });
});
