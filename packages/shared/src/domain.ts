import { z } from "zod";

export const SessionStatusSchema = z.enum([
  "collecting",
  "inspecting",
  "questioning",
  "planning",
  "summarizing",
  "done",
  "escalated",
]);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionSchema = z.object({
  id: z.string().uuid(),
  actionPackId: z.literal("plastic_litter_id_v1"),
  concernText: z.string(),
  city: z.string(),
  status: SessionStatusSchema,
  photoPath: z.string().optional().nullable(),
  voicePath: z.string().optional().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Session = z.infer<typeof SessionSchema>;

export const EvidenceKindSchema = z.enum([
  "sam_mask",
  "user_answer",
  "action_accepted",
  "model_observation",
  "voice_transcript",
]);

export const EvidenceSourceSchema = z.enum([
  "sam-3.1",
  "user",
  "muse-spark-1.3",
  "muse-wonder-1.0",
  "muse-voice-transcribe-1.0",
  "rules",
]);

export const EvidenceItemSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  kind: EvidenceKindSchema,
  partId: z.string().optional().nullable(),
  questionId: z.string().optional().nullable(),
  actionId: z.string().optional().nullable(),
  payload: z.record(z.unknown()),
  source: EvidenceSourceSchema,
  createdAt: z.string(),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const ActionPlanStepSchema = z.object({
  order: z.number(),
  title: z.string(),
  detail: z.string(),
  owner: z.enum(["solo", "friends", "adult_help"]),
  timeboxMinutes: z.number(),
  packActionId: z.string().optional(),
});

export const ActionPlanSchema = z.object({
  sessionId: z.string().uuid(),
  goal: z.string(),
  steps: z.array(ActionPlanStepSchema),
  materials: z.array(z.string()),
  safetyNotes: z.array(z.string()),
  measureHow: z.array(z.string()),
  uncertainty: z.array(z.string()),
  recommendation: z.enum(["proceed_with_plan", "stop_and_escalate"]),
  shareCardPath: z.string().optional(),
});

export type ActionPlan = z.infer<typeof ActionPlanSchema>;
