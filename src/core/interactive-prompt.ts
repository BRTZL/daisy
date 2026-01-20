/**
 * Interactive prompt handling for planning sessions
 * Presents questions using inquirer and collects responses
 */

import inquirer from "inquirer";
import { z } from "zod";
import type { QuestionOption } from "./planning-response.js";

// ============================================================================
// Types
// ============================================================================

export interface SingleQuestion {
  id: string;
  question: string;
  options: QuestionOption[];
  allowMultiple?: boolean;
  allowOther?: boolean;
}

export interface SingleAnswer {
  questionId: string;
  selected: string[];
  customInput?: string;
}

export interface UserQuestions {
  questions: SingleQuestion[];
}

export interface UserResponse {
  answers: SingleAnswer[];
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const QuestionOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
  description: z.string().optional(),
});

export const SingleQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(QuestionOptionSchema).min(1),
  allowMultiple: z.boolean().optional(),
  allowOther: z.boolean().optional(),
});

export const UserQuestionsSchema = z.object({
  questions: z.array(SingleQuestionSchema).min(1),
});

export const SingleAnswerSchema = z.object({
  questionId: z.string(),
  selected: z.array(z.string()),
  customInput: z.string().optional(),
});

export const UserResponseSchema = z.object({
  answers: z.array(SingleAnswerSchema),
});

// ============================================================================
// Constants
// ============================================================================

const OTHER_VALUE = "__other__";

// ============================================================================
// Main Function
// ============================================================================

/**
 * Present questions to the user and collect responses using inquirer
 */
export async function presentQuestions(
  data: UserQuestions
): Promise<UserResponse> {
  const answers: SingleAnswer[] = [];

  for (const question of data.questions) {
    const answer = await presentSingleQuestion(question);
    answers.push(answer);
  }

  return { answers };
}

/**
 * Present a single question using inquirer
 */
async function presentSingleQuestion(
  question: SingleQuestion
): Promise<SingleAnswer> {
  const {
    id,
    question: questionText,
    options,
    allowMultiple,
    allowOther,
  } = question;

  // Build choices array
  const choices = options.map((opt) => ({
    name: opt.description ? `${opt.label} - ${opt.description}` : opt.label,
    value: opt.value,
    short: opt.label,
  }));

  // Add "Other" option if allowed
  if (allowOther !== false) {
    choices.push({
      name: "Other (enter custom)",
      value: OTHER_VALUE,
      short: "Other",
    });
  }

  if (allowMultiple) {
    // Checkbox for multiple selection
    const { selected } = await inquirer.prompt<{ selected: string[] }>([
      {
        type: "checkbox",
        name: "selected",
        message: questionText,
        choices,
        validate: (input: string[]) => {
          if (input.length === 0) {
            return "Please select at least one option";
          }
          return true;
        },
      },
    ]);

    // Handle "Other" selection
    if (selected.includes(OTHER_VALUE)) {
      const { customInput } = await inquirer.prompt<{ customInput: string }>([
        {
          type: "input",
          name: "customInput",
          message: "Please enter your custom response:",
          validate: (input: string) => {
            if (!input.trim()) {
              return "Please enter a value";
            }
            return true;
          },
        },
      ]);

      // Remove OTHER_VALUE from selected and add the answer
      const filteredSelected = selected.filter((s) => s !== OTHER_VALUE);
      return {
        questionId: id,
        selected: filteredSelected,
        customInput: customInput.trim(),
      };
    }

    return {
      questionId: id,
      selected,
    };
  }

  // List for single selection
  const { selected } = await inquirer.prompt<{ selected: string }>([
    {
      type: "list",
      name: "selected",
      message: questionText,
      choices,
    },
  ]);

  // Handle "Other" selection
  if (selected === OTHER_VALUE) {
    const { customInput } = await inquirer.prompt<{ customInput: string }>([
      {
        type: "input",
        name: "customInput",
        message: "Please enter your custom response:",
        validate: (input: string) => {
          if (!input.trim()) {
            return "Please enter a value";
          }
          return true;
        },
      },
    ]);

    return {
      questionId: id,
      selected: [],
      customInput: customInput.trim(),
    };
  }

  return {
    questionId: id,
    selected: [selected],
  };
}

/**
 * Validate questions data using Zod schema
 */
export function validateQuestions(
  data: unknown
): { success: true; data: UserQuestions } | { success: false; error: string } {
  const result = UserQuestionsSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.issues.map((i) => i.message).join(", "),
  };
}
