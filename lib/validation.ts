import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { missions, pendingPrompts } from "./schema";

// Derived from the Drizzle tables so validation cannot drift from the columns.
// Hand-written zod belongs at trust boundaries only: request bodies, external
// API responses, and the JSON stored inside TEXT columns.
export const insertMissionSchema = createInsertSchema(missions);
export const selectMissionSchema = createSelectSchema(missions);
export const insertPendingPromptSchema = createInsertSchema(pendingPrompts);
