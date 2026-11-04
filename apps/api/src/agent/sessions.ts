import { ActionPlanSchema, type ActionPlan, type AgentStepResponse } from "@iklim-pal/shared";
import {
  BUCKETS,
  getActionPlan,
  listSessionsByOwner,
  signedUrl,
  updatePlanProgress,
} from "../db.js";
import { ensureEscalatePlanBackfill } from "./escalate.js";
import { loadEvidence, loadSession, setStatus } from "./io.js";
import { parseProgress, progressPct, type SessionRow } from "./types.js";

export async function getSessionDetail(sessionId: string) {
  const session = await loadSession(sessionId);
  const evidence = await loadEvidence(sessionId);
  const planRow = await getActionPlan(sessionId);

  let photoUrl: string | null = null;
  if (session.photo_path) {
    photoUrl = await signedUrl(BUCKETS.photos, session.photo_path);
  }

  let plan: ActionPlan | null = null;
  if (planRow?.plan) {
    try {
      plan = ActionPlanSchema.parse({
        ...(planRow.plan as Record<string, unknown>),
        sessionId,
      });
    } catch {
      plan = null;
    }
  }
  plan = await ensureEscalatePlanBackfill(sessionId, session.status, plan);
  const progress = parseProgress(
    plan && !planRow?.plan ? { completedStepOrders: [] } : planRow?.progress,
  );

  let shareCardUrl: string | null = null;
  const pathFromPlan =
    plan && typeof plan.shareCardPath === "string" ? plan.shareCardPath : null;
  const pathFromRow =
    typeof planRow?.share_card_path === "string" ? planRow.share_card_path : null;
  const sharePath = pathFromPlan || pathFromRow;
  if (sharePath) {
    shareCardUrl = await signedUrl(BUCKETS.shareCards, sharePath);
  }

  return {
    session: {
      id: session.id,
      actionPackId: "plastic_litter_id_v1" as const,
      concernText: session.concern_text,
      city: session.city,
      status: session.status as AgentStepResponse["status"],
      ownerKey: session.owner_key ?? null,
      photoPath: session.photo_path,
      photoUrl,
      voicePath: session.voice_path,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    },
    evidence,
    plan,
    shareCardUrl,
    progress,
    lastStep: null,
  };
}

export async function listOwnerSessions(ownerKey: string) {
  const rows = (await listSessionsByOwner(ownerKey)) as SessionRow[];
  const out = [];
  for (const session of rows) {
    const planRow = await getActionPlan(session.id);
    let plan: ActionPlan | null = null;
    if (planRow?.plan) {
      try {
        plan = ActionPlanSchema.parse({
          ...(planRow.plan as Record<string, unknown>),
          sessionId: session.id,
        });
      } catch {
        plan = null;
      }
    }
    plan = await ensureEscalatePlanBackfill(session.id, session.status, plan);
    const progress = parseProgress(
      plan && !planRow?.plan ? { completedStepOrders: [] } : planRow?.progress,
    );
    out.push({
      id: session.id,
      city: session.city,
      concernText: session.concern_text,
      status: session.status,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      hasPlan: Boolean(plan),
      progressPct: progressPct(plan, progress),
      goal: plan?.goal ?? null,
    });
  }
  return out;
}

export async function setSessionProgress(
  sessionId: string,
  completedStepOrders: number[],
) {
  const session = await loadSession(sessionId);
  const planRow = await getActionPlan(sessionId);
  if (!planRow?.plan) throw new Error("No action plan for this session");
  const plan = ActionPlanSchema.parse({
    ...(planRow.plan as Record<string, unknown>),
    sessionId,
  });
  const unique = [...new Set(completedStepOrders)].filter((n) =>
    plan.steps.some((s) => s.order === n),
  );
  const progress = { completedStepOrders: unique };
  await updatePlanProgress(sessionId, progress);
  const pct = progressPct(plan, progress);
  if (session.status === "escalated") {
    if (pct >= 100) await setStatus(sessionId, "done");
  } else if (session.status === "active" || session.status === "done" || pct >= 100) {
    await setStatus(sessionId, pct >= 100 ? "done" : "active");
  }
  return getSessionDetail(sessionId);
}
