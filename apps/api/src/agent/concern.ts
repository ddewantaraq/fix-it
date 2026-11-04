import { parseJsonFromModel, sparkRespond } from "../meta/client.js";
import { concernHypothesis } from "./evidence.js";
import { insertEvidence, photoUrlForMuse } from "./io.js";
import type { EvidenceRow, SessionRow } from "./types.js";

export async function ensureConcernHypothesis(
  session: SessionRow,
  evidence: EvidenceRow[],
): Promise<string> {
  const existing = concernHypothesis(evidence);
  if (existing) return existing;
  if (!session.photo_path) {
    return "Visible litter that needs a safe local cleanup plan.";
  }
  const imageUrl = await photoUrlForMuse(session.photo_path);
  try {
    const { text } = await sparkRespond({
      system: `You describe neighborhood litter for youth action planning.
Return JSON only: {"concernHypothesis":"one short sentence"}
Rules:
- Describe only what is visible (litter type + setting).
- No politics, no CO2 claims, no diagnosis beyond litter.
- Keep under 20 words.`,
      userText: JSON.stringify({
        cityHint: session.city || null,
        note: "Summarize the litter concern visible in the attached photo.",
      }),
      imageDataUrl: imageUrl,
    });
    const parsed = parseJsonFromModel(text) as { concernHypothesis?: string };
    const hypothesis =
      typeof parsed.concernHypothesis === "string" && parsed.concernHypothesis.trim()
        ? parsed.concernHypothesis.trim()
        : "There is visible litter that needs a safe local cleanup plan.";
    await insertEvidence({
      session_id: session.id,
      kind: "model_observation",
      part_id: null,
      question_id: null,
      action_id: null,
      payload: { concernHypothesis: hypothesis },
      source: "muse-spark-1.3",
    });
    return hypothesis;
  } catch {
    const fallback = "There is visible litter that needs a safe local cleanup plan.";
    await insertEvidence({
      session_id: session.id,
      kind: "model_observation",
      part_id: null,
      question_id: null,
      action_id: null,
      payload: { concernHypothesis: fallback },
      source: "rules",
    });
    return fallback;
  }
}
