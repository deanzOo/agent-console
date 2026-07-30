import { describe, expect, it } from "vitest";
import { insertMissionSchema, selectMissionSchema } from "./validation";

const valid = {
  id: "m1",
  title: "Fix the login bug",
  status: "running",
  source: "github",
};

describe("insertMissionSchema", () => {
  it("accepts a well-formed mission", () => {
    expect(insertMissionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a status outside the lifecycle, matching the database CHECK", () => {
    const result = insertMissionSchema.safeParse({ ...valid, status: "exploded" });
    expect(result.success).toBe(false);
  });

  it("rejects a source outside the known set", () => {
    expect(insertMissionSchema.safeParse({ ...valid, source: "jira" }).success).toBe(
      false,
    );
  });

  it("rejects a missing title rather than storing a null", () => {
    expect(insertMissionSchema.safeParse({ ...valid, title: undefined }).success).toBe(
      false,
    );
  });

  it("treats columns with defaults as optional on insert", () => {
    expect(insertMissionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a non-string id", () => {
    expect(insertMissionSchema.safeParse({ ...valid, id: 42 }).success).toBe(false);
  });
});

describe("selectMissionSchema", () => {
  it("requires the columns a read always returns", () => {
    expect(selectMissionSchema.safeParse(valid).success).toBe(false);
  });

  it("accepts a fully populated row", () => {
    const row = {
      ...valid,
      sourceRef: null,
      repo: null,
      branch: null,
      worktreePath: null,
      sessionId: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      lastSeq: 0,
    };
    expect(selectMissionSchema.safeParse(row).success).toBe(true);
  });
});
