import { z } from "zod";
import { ActionPlanSchema, SessionStatusSchema } from "./domain.js";

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

export const ProposedActionUiSchema = z.object({
  id: z.string(),
  title: z.string(),
  steps: z.array(z.string()),
  materials: z.array(z.string()),
  durationMinutes: z.number(),
});

export const AgentStepUiSchema = z.object({
  masks: z.array(MaskUiSchema),
  question: QuestionUiSchema.nullable(),
  proposedAction: ProposedActionUiSchema.nullable(),
  plan: ActionPlanSchema.nullable().optional(),
  shareCardUrl: z.string().nullable().optional(),
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
  actionPackId: z
    .literal("plastic_litter_id_v1")
    .default("plastic_litter_id_v1"),
  /** Optional place hint from browser geolocation label; confirmed later via q_city. */
  city: z.string().default(""),
  /** Filled after Muse concern confirm or q_concern; may start empty. */
  concernText: z.string().default(""),
  /** Anonymous device id for Plans history (localStorage). */
  ownerKey: z.string().min(1).optional(),
});

export const PlanProgressSchema = z.object({
  completedStepOrders: z.array(z.number().int().positive()),
});

export const UpdateProgressBodySchema = PlanProgressSchema;

export const SessionSummarySchema = z.object({
  id: z.string().uuid(),
  city: z.string(),
  concernText: z.string(),
  status: SessionStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  hasPlan: z.boolean(),
  progressPct: z.number().min(0).max(100),
  goal: z.string().nullable().optional(),
});

export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const AnswerBodySchema = z.object({
  questionId: z.string(),
  value: z.union([z.string(), z.boolean()]),
});

export const ActionAcceptBodySchema = z.object({
  accept: z.boolean().default(true),
  notes: z.string().optional(),
});

export const PlannerActionSchema = z.object({
  action: z.enum([
    "segment_parts",
    "ask_question",
    "propose_action",
    "finalize_plan",
  ]),
  partIds: z.array(z.string()).optional(),
  questionId: z.string().optional(),
  actionId: z.string().optional(),
  assistantMessage: z.string(),
  escalate: z.boolean().optional(),
  escalateReasonId: z.string().optional(),
});

export type PlannerAction = z.infer<typeof PlannerActionSchema>;

export const SessionDetailSchema = z.object({
  session: z.object({
    id: z.string().uuid(),
    actionPackId: z.literal("plastic_litter_id_v1"),
    concernText: z.string(),
    city: z.string(),
    status: SessionStatusSchema,
    ownerKey: z.string().nullable().optional(),
    photoPath: z.string().nullable().optional(),
    photoUrl: z.string().nullable().optional(),
    voicePath: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  evidence: z.array(z.record(z.unknown())),
  plan: ActionPlanSchema.nullable().optional(),
  /** Fresh signed URL for Muse share card (bucket object); expires ~1h. */
  shareCardUrl: z.string().nullable().optional(),
  progress: PlanProgressSchema.nullable().optional(),
  lastStep: AgentStepResponseSchema.nullable().optional(),
});

export type SessionDetail = z.infer<typeof SessionDetailSchema>;
