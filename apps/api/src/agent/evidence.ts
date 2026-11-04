import type { EvidenceRow, SessionRow } from "./types.js";

export function hasSamEvidence(evidence: EvidenceRow[]): boolean {
  return evidence.some((e) => e.kind === "sam_mask");
}

export function answerFor(evidence: EvidenceRow[], questionId: string): unknown {
  const row = [...evidence]
    .reverse()
    .find((e) => e.kind === "user_answer" && e.question_id === questionId);
  return row?.payload.value;
}

export function concernHypothesis(evidence: EvidenceRow[]): string | null {
  const row = [...evidence]
    .reverse()
    .find(
      (e) =>
        e.kind === "model_observation" &&
        typeof e.payload.concernHypothesis === "string",
    );
  return row ? String(row.payload.concernHypothesis) : null;
}

export function concernSettled(session: SessionRow): boolean {
  return Boolean(session.concern_text?.trim());
}

export function truthyAnswer(value: unknown): boolean {
  return value === true || value === "yes" || value === "Yes" || value === "true";
}

export function answeredIds(evidence: EvidenceRow[]): Set<string> {
  return new Set(
    evidence.filter((e) => e.kind === "user_answer" && e.question_id).map((e) => e.question_id!),
  );
}

export function planMatchAnswered(evidence: EvidenceRow[]): boolean {
  return answeredIds(evidence).has("q_plan_match");
}

export function planMatchAccepted(evidence: EvidenceRow[]): boolean {
  return truthyAnswer(answerFor(evidence, "q_plan_match"));
}

export function hazardTriggered(evidence: EvidenceRow[]): boolean {
  return evidence.some(
    (e) =>
      e.kind === "user_answer" &&
      e.question_id === "q_hazard" &&
      truthyAnswer(e.payload.value),
  );
}

export function acceptedActionIds(evidence: EvidenceRow[]): Set<string> {
  return new Set(
    evidence
      .filter((e) => e.kind === "action_accepted" && e.action_id)
      .map((e) => e.action_id!),
  );
}
