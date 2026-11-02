import type { AgentStepResponse, SessionDetail } from "@iklim-pal/shared";

const base = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

async function json<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? res.statusText);
  }
  return body as T;
}

export async function createSession(city: string, concernText: string) {
  const res = await fetch(`${base}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actionPackId: "plastic_litter_id_v1",
      city,
      concernText,
    }),
  });
  return json<{ id: string }>(res);
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
