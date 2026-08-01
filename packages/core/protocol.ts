import { z } from "zod";
import { APPROVAL_MODES } from "./agents/policy";
import { MISSION_SOURCES } from "./schema";

// The vocabulary that crosses the process boundary between the console and the
// session host. Defined once: a schema typed twice on either side of a boundary
// drifts silently, and the failure surfaces as a rejected request nobody
// expected rather than as a type error.

// Reaches `git clone` and the workspace path derivation, so the shape is
// checked here rather than trusted to the caller.
const REPO_FULL_NAME = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export const launchMissionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1),
  source: z.enum(MISSION_SOURCES),
  sourceRef: z.string().trim().min(1).optional(),
  repo: z
    .string()
    .regex(REPO_FULL_NAME, "expected owner/repo")
    // The character class allows dots, so the pattern alone admits "../repo".
    // barePath refuses those too; refusing them here keeps the boundary and the
    // path derivation agreeing about what a repository name is.
    .refine((name) => !name.includes(".."), "must not contain '..'")
    .optional(),
  base: z.string().trim().min(1).optional(),
});

export const DEFAULT_DENIAL_MESSAGE = "Denied by the operator.";

export const answerPromptSchema = z.discriminatedUnion("decision", [
  z.object({
    promptId: z.string().min(1),
    decision: z.literal("allow"),
    /** Stop asking about this tool for the rest of the mission. */
    always: z.boolean().optional(),
  }),
  z.object({
    promptId: z.string().min(1),
    decision: z.literal("deny"),
    message: z.string().trim().min(1).default(DEFAULT_DENIAL_MESSAGE),
  }),
]);

// The console accepted any non-empty string here and left it to the session
// host to refuse, so a mode neither of them allows reached the boundary between
// them before anything objected.
export const setModeSchema = z.object({ mode: z.enum(APPROVAL_MODES) });

export type LaunchMissionInput = z.infer<typeof launchMissionSchema>;
export type AnswerPromptInput = z.infer<typeof answerPromptSchema>;
export type SetModeInput = z.infer<typeof setModeSchema>;
