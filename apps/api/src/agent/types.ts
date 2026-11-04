import type { ActionPlan } from "@iklim-pal/shared";

export type SessionRow = {
  id: string;
  action_pack_id: string;
  concern_text: string;
  city: string;
  status: string;
  owner_key?: string | null;
  photo_path: string | null;
  voice_path: string | null;
  created_at: string;
  updated_at: string;
};

export type EvidenceRow = {
  id: string;
  session_id: string;
  kind: string;
  part_id: string | null;
  question_id: string | null;
  action_id: string | null;
  payload: Record<string, unknown>;
  source: string;
  created_at: string;
};

export const CONCERN_QUESTION_IDS = [
  "q_concern_confirm",
  "q_concern",
  "q_plan_match",
] as const;

export function parseProgress(raw: unknown): { completedStepOrders: number[] } {
  if (!raw || typeof raw !== "object") return { completedStepOrders: [] };
  const orders = (raw as { completedStepOrders?: unknown }).completedStepOrders;
  if (!Array.isArray(orders)) return { completedStepOrders: [] };
  return {
    completedStepOrders: orders.filter((n): n is number => typeof n === "number"),
  };
}

export function progressPct(
  plan: ActionPlan | null,
  progress: { completedStepOrders: number[] },
) {
  const total = plan?.steps?.length ?? 0;
  if (total === 0) return 0;
  const done = new Set(progress.completedStepOrders).size;
  return Math.min(100, Math.round((done / total) * 100));
}
