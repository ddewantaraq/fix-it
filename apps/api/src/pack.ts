import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ActionPackSchema, type ActionPack } from "@iklim-pal/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cached: ActionPack | null = null;
let cachedMtimeMs = 0;

export function loadActionPack(): ActionPack {
  const path = resolve(
    __dirname,
    "../../../packages/action-packs/plastic_litter_id_v1.json",
  );
  const mtimeMs = statSync(path).mtimeMs;
  if (cached && cachedMtimeMs === mtimeMs) return cached;
  const raw = JSON.parse(readFileSync(path, "utf8"));
  cached = ActionPackSchema.parse(raw);
  cachedMtimeMs = mtimeMs;
  return cached;
}

export function hasPackPart(pack: ActionPack, partId: string) {
  return pack.parts.some((p) => p.id === partId);
}

export function hasPackQuestion(pack: ActionPack, questionId: string) {
  return pack.questions.some((q) => q.id === questionId);
}

export function hasPackAction(pack: ActionPack, actionId: string) {
  return pack.actions.some((a) => a.id === actionId);
}

export function assertPackPart(pack: ActionPack, partId: string) {
  if (!hasPackPart(pack, partId)) {
    throw new Error(`Unknown partId: ${partId}`);
  }
}

export function assertPackQuestion(pack: ActionPack, questionId: string) {
  if (!hasPackQuestion(pack, questionId)) {
    throw new Error(`Unknown questionId: ${questionId}`);
  }
}

export function assertPackAction(pack: ActionPack, actionId: string) {
  if (!hasPackAction(pack, actionId)) {
    throw new Error(`Unknown actionId: ${actionId}`);
  }
}

/** True when planner action references only pack IDs (or needs none). */
export function isPlannerActionInPack(
  pack: ActionPack,
  planned: {
    action: string;
    partIds?: string[];
    questionId?: string;
    actionId?: string;
  },
): boolean {
  if (planned.action === "segment_parts") {
    const ids = planned.partIds ?? [];
    if (ids.length === 0) return true; // runner will use requiredForDemo parts
    return ids.every((id) => hasPackPart(pack, id));
  }
  if (planned.action === "ask_question") {
    return !!planned.questionId && hasPackQuestion(pack, planned.questionId);
  }
  if (planned.action === "propose_action") {
    return !!planned.actionId && hasPackAction(pack, planned.actionId);
  }
  if (planned.action === "finalize_plan") return true;
  return false;
}
