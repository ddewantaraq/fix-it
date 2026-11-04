import { ActionPlanSchema, type ActionPack, type ActionPlan } from "@iklim-pal/shared";
import {
  BUCKETS,
  deleteActionPlans,
  deleteEvidenceByIds,
  deleteEvidenceMatching,
  getActionPlan,
  saveActionPlan,
  signedUrl,
  updateSession,
  uploadBlob,
} from "../db.js";
import { generateShareCard, parseJsonFromModel, wonderRespond } from "../meta/client.js";
import { hasPackAction } from "../pack.js";
import { CONCERN_QUESTION_IDS, type EvidenceRow, type SessionRow } from "./types.js";
import { insertEvidence, loadEvidence, setStatus } from "./io.js";

export async function loadPlanUi(sessionId: string): Promise<{
  plan: ActionPlan | null;
  shareCardUrl: string | null;
}> {
  const planRow = await getActionPlan(sessionId);
  if (!planRow?.plan) return { plan: null, shareCardUrl: null };
  const plan = ActionPlanSchema.parse({
    ...(planRow.plan as Record<string, unknown>),
    sessionId,
  });
  let shareCardUrl: string | null = null;
  if (plan.shareCardPath) {
    shareCardUrl = await signedUrl(BUCKETS.shareCards, plan.shareCardPath);
  } else if (typeof planRow.share_card_path === "string" && planRow.share_card_path) {
    shareCardUrl = await signedUrl(BUCKETS.shareCards, planRow.share_card_path);
  }
  return { plan, shareCardUrl };
}

export async function reviseAfterPlanMismatch(sessionId: string): Promise<void> {
  await deleteEvidenceMatching(sessionId, {
    questionIds: [...CONCERN_QUESTION_IDS],
    kinds: ["action_accepted"],
  });
  const evidence = await loadEvidence(sessionId);
  const hypothesisIds = evidence
    .filter(
      (e) =>
        e.kind === "model_observation" &&
        typeof e.payload.concernHypothesis === "string",
    )
    .map((e) => e.id);
  await deleteEvidenceByIds(hypothesisIds);
  await deleteActionPlans(sessionId);
  await updateSession(sessionId, { concern_text: "", status: "questioning" });
}

export async function finalizePlan(opts: {
  session: SessionRow;
  pack: ActionPack;
  evidence: EvidenceRow[];
  imageUrl?: string;
}): Promise<{ plan: ActionPlan; shareCardUrl: string | null }> {
  const system = `You are Muse Wonder synthesizing an Iklim PAL Action Plan for youth.
Return JSON only:
{"goal":"","steps":[{"order":1,"title":"","detail":"","owner":"solo"|"friends"|"adult_help","timeboxMinutes":30,"packActionId":""}],"materials":[],"safetyNotes":[],"measureHow":[],"uncertainty":[],"recommendation":"proceed_with_plan"|"stop_and_escalate"}
Rules:
- packActionId must be from the pack or omitted.
- No politics, lobbying, protests, parties.
- No guaranteed CO2 / climate-solved claims.
- If hazards present, recommendation stop_and_escalate.
- Keep steps practical and measurable (bags, before/after photos).`;

  const { text } = await wonderRespond({
    system,
    userText: JSON.stringify({
      city: opts.session.city,
      concern: opts.session.concern_text,
      evidence: opts.evidence.map((e) => ({
        kind: e.kind,
        partId: e.part_id,
        questionId: e.question_id,
        actionId: e.action_id,
        payload: e.payload,
      })),
      packActions: opts.pack.actions,
      escalationDefaults: opts.pack.escalationDefaults,
    }),
    imageDataUrl: opts.imageUrl,
  });

  const rawPlan = parseJsonFromModel(text) as Record<string, unknown>;
  const plan = ActionPlanSchema.parse({
    ...rawPlan,
    sessionId: opts.session.id,
  });

  plan.steps = plan.steps.map((step) => {
    if (step.packActionId && !hasPackAction(opts.pack, step.packActionId)) {
      const { packActionId: _drop, ...rest } = step;
      return rest;
    }
    return step;
  });
  if (plan.steps.length === 0 && plan.recommendation === "proceed_with_plan") {
    plan.recommendation = "stop_and_escalate";
    plan.uncertainty = [
      ...(plan.uncertainty ?? []),
      "No pack-approved action IDs remained after validation.",
    ];
  }

  let shareCardUrl: string | null = null;
  let shareCardPath: string | undefined;
  try {
    const card = await generateShareCard({
      prompt: `Create a friendly youth cleanup invite card for Iklim PAL. City: ${opts.session.city}. Goal: ${plan.goal}. Non-political community litter cleanup. Bold readable text, hopeful outdoor vibe, no logos of political parties.`,
      referenceImageDataUrl: opts.imageUrl,
    });
    if (card.dataUrl) {
      shareCardPath = `${opts.session.id}/share-${Date.now()}.png`;
      let buf: Buffer;
      if (card.dataUrl.startsWith("data:")) {
        buf = Buffer.from(card.dataUrl.split(",")[1] ?? "", "base64");
      } else {
        const imgRes = await fetch(card.dataUrl);
        buf = Buffer.from(await imgRes.arrayBuffer());
      }
      await uploadBlob("shareCards", shareCardPath, buf, "image/png");
      shareCardUrl = await signedUrl(BUCKETS.shareCards, shareCardPath);
      plan.shareCardPath = shareCardPath;
    }
  } catch {
    // Image is P0 but demo continues without card if API fails
  }

  await saveActionPlan(opts.session.id, plan, shareCardPath ?? null);

  await insertEvidence({
    session_id: opts.session.id,
    kind: "model_observation",
    part_id: null,
    question_id: null,
    action_id: null,
    payload: { planGoal: plan.goal, recommendation: plan.recommendation },
    source: "muse-wonder-1.0",
  });

  const status =
    plan.recommendation === "stop_and_escalate" ? "escalated" : "summarizing";
  await setStatus(opts.session.id, status);

  return { plan, shareCardUrl };
}
