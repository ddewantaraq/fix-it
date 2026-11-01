import { z } from "zod";
import { HypothesisSchema, RepairBriefSchema, SessionStatusSchema } from "./domain.js";

/** Frozen contract for POST /sessions/:id/step responses (architecture §9). */
export const MaskUiSchema = z.object({
  partId: z.string(),
  url: z.string(),
});

export const QuestionUiSchema = z.object({
  id: z.string(),
  text: z.string(),
  expects: z.enum(["yes_no", "enum", "short_text"]).optional(),
  options: z.array(z.string()).optional(),
});

export const SafeCheckUiSchema = z.object({
  id: z.string(),
  title: z.string(),
  instructions: z.array(z.string()),
});

export const AgentStepUiSchema = z.object({
  masks: z.array(MaskUiSchema),
  question: QuestionUiSchema.nullable(),
  safeCheck: SafeCheckUiSchema.nullable(),
  hypotheses: z.array(
    z.object({
      label: z.string(),
      confidence: z.enum(["low", "medium", "high"]),
    }),
  ),
  brief: RepairBriefSchema.optional(),
});

export const AgentStepResponseSchema = z.object({
  sessionId: z.string().uuid(),
  status: SessionStatusSchema,
  assistantMessage: z.string(),
  ui: AgentStepUiSchema,
  escalated: z.boolean(),
});

export type AgentStepResponse = z.infer<typeof AgentStepResponseSchema>;

export const CreateSessionBodySchema = z.object({
  devicePackId: z.literal("household_fan_v1").default("household_fan_v1"),
  symptom: z.literal("wont_turn_on").default("wont_turn_on"),
});

export const AnswerBodySchema = z.object({
  questionId: z.string(),
  value: z.union([z.string(), z.boolean()]),
});

export const CheckBodySchema = z.object({
  outcome: z.enum(["pass", "fail", "unclear", "skipped"]),
  notes: z.string().optional(),
  unpluggedAcknowledged: z.boolean(),
});

export const PlannerActionSchema = z.object({
  action: z.enum([
    "segment_parts",
    "ask_question",
    "propose_safe_check",
    "finalize_summary",
  ]),
  partIds: z.array(z.string()).optional(),
  questionId: z.string().optional(),
  checkId: z.string().optional(),
  assistantMessage: z.string(),
  hypotheses: z
    .array(
      z.object({
        label: z.string(),
        confidence: z.enum(["low", "medium", "high"]),
      }),
    )
    .optional(),
  escalate: z.boolean().optional(),
  escalateReasonId: z.string().optional(),
});

export type PlannerAction = z.infer<typeof PlannerActionSchema>;

export const SessionDetailSchema = z.object({
  session: z.object({
    id: z.string().uuid(),
    devicePackId: z.literal("household_fan_v1"),
    symptom: z.literal("wont_turn_on"),
    status: SessionStatusSchema,
    photoPath: z.string().nullable().optional(),
    photoUrl: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  evidence: z.array(z.record(z.unknown())),
  hypotheses: z.array(HypothesisSchema),
  brief: RepairBriefSchema.nullable().optional(),
  lastStep: AgentStepResponseSchema.nullable().optional(),
});

export type SessionDetail = z.infer<typeof SessionDetailSchema>;
