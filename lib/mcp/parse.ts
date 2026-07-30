import { z } from "zod";
import type { CachedAsanaTask, CachedIssue } from "../schema";

// MCP tools return content blocks, not typed payloads, so everything crossing
// this boundary is parsed rather than trusted.
const toolResultSchema = z.object({
  content: z
    .array(z.object({ type: z.string(), text: z.string().optional() }).loose())
    .optional(),
});

export function readToolJson(result: unknown): unknown {
  const parsed = toolResultSchema.safeParse(result);
  if (!parsed.success || !parsed.data.content) return undefined;

  const text = parsed.data.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");

  if (text === "") return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function asArray(payload: unknown, ...envelopeKeys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  for (const key of envelopeKeys) {
    const nested = Object(payload)[key];
    if (Array.isArray(nested)) return nested;
  }
  return [];
}

const labelSchema = z.union([z.string(), z.object({ name: z.string() }).loose()]);

const issueSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.string(),
  html_url: z.string(),
  labels: z.array(labelSchema).optional(),
  updated_at: z.string().optional(),
  pull_request: z.unknown().optional(),
});

export function parseGithubIssues(repo: string, payload: unknown): CachedIssue[] {
  return (
    asArray(payload, "items", "issues")
      .map((entry) => issueSchema.safeParse(entry))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data)
      // The issues endpoint returns pull requests too; the panel is about issues.
      .filter((issue) => issue.pull_request === undefined)
      .map((issue) => ({
        repo,
        number: issue.number,
        title: issue.title,
        state: issue.state,
        labelsJson: JSON.stringify(
          (issue.labels ?? []).map((label) =>
            typeof label === "string" ? label : label.name,
          ),
        ),
        url: issue.html_url,
        updatedAt: issue.updated_at ?? null,
      }))
  );
}

const taskSchema = z.object({
  gid: z.string(),
  name: z.string(),
  completed: z.boolean().optional(),
  due_on: z.string().nullish(),
  permalink_url: z.string().nullish(),
  modified_at: z.string().nullish(),
  projects: z.array(z.object({ name: z.string() }).loose()).optional(),
});

export function parseAsanaTasks(payload: unknown): CachedAsanaTask[] {
  return asArray(payload, "data", "tasks")
    .map((entry) => taskSchema.safeParse(entry))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
    .map((task) => ({
      gid: task.gid,
      name: task.name,
      project: task.projects?.[0]?.name ?? null,
      dueOn: task.due_on ?? null,
      permalink: task.permalink_url ?? null,
      completed: task.completed ?? false,
      updatedAt: task.modified_at ?? null,
    }));
}
