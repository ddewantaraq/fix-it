import type { AgentStepResponse, SessionDetail, SessionSummary } from "@iklim-pal/shared";

const base = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

const OWNER_KEY_STORAGE = "iklim-pal-owner-key";

export function getOwnerKey(): string {
  const existing = localStorage.getItem(OWNER_KEY_STORAGE);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(OWNER_KEY_STORAGE, next);
  return next;
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? res.statusText);
  }
  return body as T;
}

export async function createSession(opts?: {
  city?: string;
  concernText?: string;
  ownerKey?: string;
}) {
  const res = await fetch(`${base}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actionPackId: "plastic_litter_id_v1",
      city: opts?.city ?? "",
      concernText: opts?.concernText ?? "",
      ownerKey: opts?.ownerKey ?? getOwnerKey(),
    }),
  });
  return json<{ id: string }>(res);
}

export async function listSessions(ownerKey = getOwnerKey()) {
  const res = await fetch(
    `${base}/sessions?ownerKey=${encodeURIComponent(ownerKey)}`,
  );
  return json<{ sessions: SessionSummary[] }>(res);
}

export async function updateProgress(
  sessionId: string,
  completedStepOrders: number[],
) {
  const res = await fetch(`${base}/sessions/${sessionId}/progress`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completedStepOrders }),
  });
  return json<SessionDetail>(res);
}

export async function uploadPhoto(sessionId: string, file: File) {
  const fd = new FormData();
  fd.append("photo", file);
  const res = await fetch(`${base}/sessions/${sessionId}/photo`, {
    method: "POST",
    body: fd,
  });
  return json<{ ok: boolean; photoPath: string }>(res);
}

export async function uploadVoice(sessionId: string, file: File) {
  const fd = new FormData();
  fd.append("audio", file);
  const res = await fetch(`${base}/sessions/${sessionId}/voice`, {
    method: "POST",
    body: fd,
  });
  return json<{ ok: boolean; transcript: string }>(res);
}

export async function runStep(sessionId: string) {
  const res = await fetch(`${base}/sessions/${sessionId}/step`, { method: "POST" });
  return json<AgentStepResponse>(res);
}

export async function submitAnswer(
  sessionId: string,
  questionId: string,
  value: string | boolean,
) {
  const res = await fetch(`${base}/sessions/${sessionId}/answers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, value }),
  });
  return json<AgentStepResponse>(res);
}

export async function acceptAction(sessionId: string, actionId: string) {
  const res = await fetch(`${base}/sessions/${sessionId}/actions/${actionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accept: true }),
  });
  return json<AgentStepResponse>(res);
}

export async function getSession(sessionId: string) {
  const res = await fetch(`${base}/sessions/${sessionId}`);
  return json<SessionDetail>(res);
}
