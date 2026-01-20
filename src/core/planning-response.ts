/**
 * Planning Response Schemas
 * Zod schemas for validating Claude's structured JSON responses during planning
 */

import { z } from "zod";

// ============================================================================
// Task Schema (for add/update operations)
// ============================================================================

export const TaskOperationSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  parentId: z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  afterId: z.string().optional(),
  beforeId: z.string().optional(),
});

export const TaskUpdateSchema = z.object({
  id: z.string(),
  updates: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    dependsOn: z.array(z.string()).optional(),
    acceptanceCriteria: z.array(z.string()).optional(),
  }),
});

// ============================================================================
// Question Schema
// ============================================================================

export const QuestionOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
  description: z.string().optional(),
});

export const QuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(QuestionOptionSchema).min(1),
  allowMultiple: z.boolean().optional().default(false),
  allowOther: z.boolean().optional().default(true),
});

// ============================================================================
// Planning Response Schema
// ============================================================================

export const PlanningResponseSchema = z.object({
  // Message to display to user
  message: z.string().optional(),

  // Questions to ask user (if any)
  questions: z.array(QuestionSchema).optional(),

  // Task operations to perform
  tasks: z
    .object({
      add: z.array(TaskOperationSchema).optional(),
      update: z.array(TaskUpdateSchema).optional(),
      remove: z.array(z.string()).optional(),
    })
    .optional(),

  // Planning complete?
  done: z.boolean().optional(),
  summary: z.string().optional(), // Required if done=true
});

// ============================================================================
// Types
// ============================================================================

export type TaskOperation = z.infer<typeof TaskOperationSchema>;
export type TaskUpdate = z.infer<typeof TaskUpdateSchema>;
export type QuestionOption = z.infer<typeof QuestionOptionSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type PlanningResponse = z.infer<typeof PlanningResponseSchema>;

// ============================================================================
// Validation
// ============================================================================

/**
 * Parse and validate a planning response from Claude
 * Returns the validated response or null with error message
 */
export function parsePlanningResponse(jsonString: string):
  | {
      success: true;
      data: PlanningResponse;
    }
  | {
      success: false;
      error: string;
    } {
  try {
    const parsed = JSON.parse(jsonString);
    const result = PlanningResponseSchema.safeParse(parsed);

    if (result.success) {
      // Additional validation: if done is true, summary should be present
      if (result.data.done && !result.data.summary) {
        return {
          success: false,
          error: "When done is true, summary must be provided",
        };
      }
      return { success: true, data: result.data };
    }

    // Format Zod errors
    const errorMessages = result.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    });

    return {
      success: false,
      error: `Validation failed: ${errorMessages.join("; ")}`,
    };
  } catch (e) {
    return {
      success: false,
      error: `Invalid JSON: ${(e as Error).message}`,
    };
  }
}

/**
 * Extract JSON from Claude's response text
 * Claude might include the JSON in a code block or with surrounding text
 */
export function extractJsonFromResponse(response: string): string | null {
  // First try: entire response is JSON
  const trimmed = response.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  // Second try: JSON in code block
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Third try: find JSON object in response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return null;
}
