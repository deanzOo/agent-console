import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Db } from "./db";
import { asanaCache } from "./schema";
import { createMission } from "./missions";

let fakeConfig: { githubToken?: string; asanaToken?: string } = {
  githubToken: "gh-token",
  asanaToken: "asana-token",
};

vi.mock("./env", () => ({ getConfig: () => fakeConfig }));

const { markSourcePickedUp, releaseSourcePickup } = await import("./pickup");

let dir: string;
let db: Db;

beforeEach(() => {
  fakeConfig = { githubToken: "gh-token", asanaToken: "asana-token" };
  dir = mkdtempSync(path.join(tmpdir(), "pickup-"));
  db = openDatabase(path.join(dir, "data.db"), path.join(process.cwd(), "drizzle"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

function githubMission() {
  return createMission(db, {
    title: "Fix the login bug",
    source: "github",
    sourceRef: "acme/widget#7",
    repo: "acme/widget",
    prompt: "p",
  });
}

function asanaMission() {
  db.insert(asanaCache)
    .values({ gid: "task1", name: "Ship it", workspaceGid: "ws1" })
    .run();
  return createMission(db, {
    title: "Ship it",
    source: "asana",
    sourceRef: "task1",
    prompt: "p",
  });
}

describe("markSourcePickedUp", () => {
  it("labels and comments on the issue a github mission came from", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        return new Response(null, { status: 200 });
      }),
    );

    await markSourcePickedUp(db, githubMission());

    expect(calls).toEqual([
      "GET https://api.github.com/repos/acme/widget/labels/agent-picked-up",
      "POST https://api.github.com/repos/acme/widget/issues/7/labels",
      "POST https://api.github.com/repos/acme/widget/issues/7/comments",
    ]);
  });

  it("tags and comments on the asana task a mission came from", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (String(url).includes("/tags?")) return Response.json({ data: [] });
        if (String(url).endsWith("/tags")) {
          return Response.json({ data: { gid: "tag1" } });
        }
        return Response.json({ data: {} });
      }),
    );

    await markSourcePickedUp(db, asanaMission());

    expect(calls).toEqual([
      "GET https://app.asana.com/api/1.0/tags?workspace=ws1&opt_fields=name",
      "POST https://app.asana.com/api/1.0/tags",
      "POST https://app.asana.com/api/1.0/tasks/task1/addTag",
      "POST https://app.asana.com/api/1.0/tasks/task1/stories",
    ]);
  });

  it("does nothing for a mission with no source of its own", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await markSourcePickedUp(
      db,
      createMission(db, { title: "Ad hoc", source: "free", prompt: "p" }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing once the token has been removed", async () => {
    fakeConfig = { asanaToken: "asana-token" };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await markSourcePickedUp(db, githubMission());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Best-effort, like a push notification: GitHub being unreachable must
  // never surface as a launch failure.
  it("swallows a GitHub failure rather than rejecting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );

    await expect(markSourcePickedUp(db, githubMission())).resolves.toBeUndefined();
  });

  it("swallows an Asana task with no cached workspace", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const mission = createMission(db, {
      title: "Ship it",
      source: "asana",
      sourceRef: "task-not-cached",
      prompt: "p",
    });

    await expect(markSourcePickedUp(db, mission)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("releaseSourcePickup", () => {
  it("takes the label back off the issue", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await releaseSourcePickup(db, githubMission());

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/widget/issues/7/labels/agent-picked-up",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("takes the tag back off the task", async () => {
    const fetchMock = vi.fn(async (url: string | URL) =>
      String(url).includes("/tags?")
        ? Response.json({ data: [{ gid: "tag1", name: "agent-picked-up" }] })
        : Response.json({ data: {} }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await releaseSourcePickup(db, asanaMission());

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.asana.com/api/1.0/tasks/task1/removeTag",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("swallows a refusal rather than rejecting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );

    await expect(releaseSourcePickup(db, githubMission())).resolves.toBeUndefined();
  });
});
