import type { AgentStepResponse } from "@fix-it/shared";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : `HTTP ${res.status}`,
    );
  }
  return data as T;
}

export async function createSession() {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      devicePackId: "household_fan_v1",
      symptom: "wont_turn_on",
    }),
  });
  return parseJson<{ id: string; status: string }>(res);
}

export async function uploadPhoto(sessionId: string, file: File) {
  const form = new FormData();
  form.append("photo", file);
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/photo`, {
    method: "POST",
    body: form,
  });
  return parseJson<{ id: string; photoPath: string; status: string }>(res);
}

export async function runStep(sessionId: string) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/step`, {
    method: "POST",
  });
  return parseJson<AgentStepResponse>(res);
}

export async function submitAnswer(
  sessionId: string,
  questionId: string,
  value: string | boolean,
) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/answers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, value }),
  });
  return parseJson<AgentStepResponse>(res);
}

export async function submitCheck(
  sessionId: string,
  checkId: string,
  outcome: "pass" | "fail" | "unclear" | "skipped",
  unpluggedAcknowledged: boolean,
) {
  const res = await fetch(
    `${API_BASE}/sessions/${sessionId}/checks/${checkId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, unpluggedAcknowledged }),
    },
  );
  return parseJson<AgentStepResponse>(res);
}

export async function getSession(sessionId: string) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`);
  return parseJson<{
    session: { photoUrl?: string | null; status: string };
    brief?: unknown;
    evidence: unknown[];
  }>(res);
}
