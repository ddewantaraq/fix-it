import { z } from "zod";

export const DevicePackSchema = z.object({
  id: z.literal("household_fan_v1"),
  displayName: z.string(),
  supportedSymptoms: z.array(z.literal("wont_turn_on")),
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
    }),
  ),
  safeChecks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      instructions: z.array(z.string()),
      requiresUnplugged: z.literal(true),
      forbiddenIf: z.array(z.string()).optional(),
    }),
  ),
  stopConditions: z.array(
    z.object({
      id: z.string(),
      when: z.string(),
      escalate: z.boolean(),
      userMessage: z.string(),
    }),
  ),
  escalationDefaults: z.object({
    message: z.string(),
    nextStep: z.enum(["contact_technician", "stop"]),
  }),
});

export type DevicePack = z.infer<typeof DevicePackSchema>;
