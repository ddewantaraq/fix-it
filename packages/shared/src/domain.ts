import { z } from "zod";

export const SessionStatusSchema = z.enum([
  "collecting",
  "inspecting",
  "questioning",
  "checking",
  "summarizing",
  "done",
  "escalated",
]);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionSchema = z.object({
  id: z.string().uuid(),
  devicePackId: z.literal("household_fan_v1"),
  symptom: z.literal("wont_turn_on"),
  status: SessionStatusSchema,
  photoPath: z.string().optional().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Session = z.infer<typeof SessionSchema>;

export const EvidenceKindSchema = z.enum([
  "sam_mask",
  "user_answer",
  "safe_check_result",
  "model_observation",
]);

export const EvidenceSourceSchema = z.enum([
  "sam-3.1",
  "user",
  "muse-spark-1.3",
  "rules",
]);

export const EvidenceItemSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  kind: EvidenceKindSchema,
  partId: z.string().optional().nullable(),
  questionId: z.string().optional().nullable(),
  checkId: z.string().optional().nullable(),
  payload: z.record(z.unknown()),
  source: EvidenceSourceSchema,
  createdAt: z.string(),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const HypothesisSchema = z.object({
  id: z.string(),
  label: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  supportingEvidenceIds: z.array(z.string()),
  status: z.enum(["candidate", "weakened", "ruled_out", "unresolved"]),
});

export type Hypothesis = z.infer<typeof HypothesisSchema>;

export const SafeCheckResultSchema = z.object({
  checkId: z.string(),
  outcome: z.enum(["pass", "fail", "unclear", "skipped"]),
  notes: z.string().optional(),
});

export type SafeCheckResult = z.infer<typeof SafeCheckResultSchema>;

export const RepairBriefSchema = z.object({
  sessionId: z.string().uuid(),
  device: z.literal("household_fan"),
  symptom: z.string(),
  observations: z.array(z.string()),
  checksPerformed: z.array(SafeCheckResultSchema),
  hypotheses: z.array(HypothesisSchema),
  uncertainty: z.array(z.string()),
  recommendation: z.enum(["safe_home_followup", "stop_and_escalate"]),
  technicianNotes: z.string(),
  overlayImagePath: z.string().optional(),
});

export type RepairBrief = z.infer<typeof RepairBriefSchema>;
