import { describe, expect, it } from "vitest";
import {
  DEFAULT_DENIAL_MESSAGE,
  answerPromptSchema,
  launchMissionSchema,
} from "./protocol";

const launch = { title: "Fix login", prompt: "do the thing", source: "free" };

describe("launchMissionSchema", () => {
  it("accepts a free-text mission", () => {
    expect(launchMissionSchema.safeParse(launch).success).toBe(true);
  });

  // The repo name reaches `git clone` and the workspace path derivation, so a
  // shape that is not owner/repo must not cross the process boundary at all.
  it.each(["owner", "owner/repo/extra", "../repo", "owner/..", "own er/repo", ""])(
    "rejects %o as a repo",
    (repo) => {
      expect(launchMissionSchema.safeParse({ ...launch, repo }).success).toBe(false);
    },
  );

  it("accepts a well-formed repo", () => {
    expect(
      launchMissionSchema.safeParse({ ...launch, repo: "deanzOo/x" }).success,
    ).toBe(true);
  });

  it("requires a title and a prompt that are not just whitespace", () => {
    expect(launchMissionSchema.safeParse({ ...launch, title: "   " }).success).toBe(
      false,
    );
    expect(launchMissionSchema.safeParse({ ...launch, prompt: " " }).success).toBe(
      false,
    );
  });

  it("rejects a source outside the known set", () => {
    expect(launchMissionSchema.safeParse({ ...launch, source: "email" }).success).toBe(
      false,
    );
  });
});

describe("answerPromptSchema", () => {
  it("accepts an allow", () => {
    const parsed = answerPromptSchema.safeParse({ promptId: "p1", decision: "allow" });
    expect(parsed.success).toBe(true);
  });

  it("supplies a denial message when none is given", () => {
    const parsed = answerPromptSchema.parse({ promptId: "p1", decision: "deny" });
    expect(parsed).toEqual({
      promptId: "p1",
      decision: "deny",
      message: DEFAULT_DENIAL_MESSAGE,
    });
  });

  it("keeps a denial message that was given", () => {
    const parsed = answerPromptSchema.parse({
      promptId: "p1",
      decision: "deny",
      message: "not this time",
    });
    expect(parsed).toMatchObject({ message: "not this time" });
  });

  it("rejects a decision it does not know", () => {
    expect(
      answerPromptSchema.safeParse({ promptId: "p1", decision: "maybe" }).success,
    ).toBe(false);
  });

  it("requires a prompt id", () => {
    expect(
      answerPromptSchema.safeParse({ promptId: "", decision: "allow" }).success,
    ).toBe(false);
  });
});
