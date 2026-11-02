import { z } from "zod";

export const PackSourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  organization: z.string(),
  url: z.string().url(),
  informs: z.array(z.string()),
});

export const ActionPackSchema = z.object({
  id: z.literal("plastic_litter_id_v1"),
  displayName: z.string(),
  localeHint: z.string(),
  supportedConcerns: z.array(
    z.enum(["plastic_litter", "river_litter", "drain_litter"]),
  ),
  sources: z.array(PackSourceSchema).min(1),
  parts: z.array(
    z.object({
      id: z.string(),
      samPhrase: z.string(),
      requiredForDemo: z.boolean().optional(),
    }),
  ),
  questions: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      expects: z.enum(["yes_no", "enum", "short_text"]),
      options: z.array(z.string()).optional(),
      mapsToEvidence: z.string(),
      sourceIds: z.array(z.string()).optional(),
    }),
  ),
  actions: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      steps: z.array(z.string()),
      materials: z.array(z.string()),
      durationMinutes: z.number(),
      needsFriends: z.boolean().optional(),
      forbiddenIf: z.array(z.string()).optional(),
      sourceIds: z.array(z.string()).min(1),
    }),
  ),
  stopConditions: z.array(
    z.object({
      id: z.string(),
      when: z.string(),
      escalate: z.boolean(),
      userMessage: z.string(),
      sourceIds: z.array(z.string()).min(1),
    }),
  ),
  escalationDefaults: z.object({
    message: z.string(),
    nextStep: z.enum(["contact_adult_or_authority", "stop"]),
    sourceIds: z.array(z.string()).optional(),
  }),
});

export type ActionPack = z.infer<typeof ActionPackSchema>;
