import {
  BUCKETS,
  downloadPhoto,
  getSession,
  insertEvidence as dbInsertEvidence,
  listEvidence,
  signedUrl,
  updateSession,
} from "../db.js";
import type { EvidenceRow, SessionRow } from "./types.js";

export async function downloadPhotoDataUrl(photoPath: string): Promise<string> {
  const buf = await downloadPhoto(photoPath);
  const mime = photoPath.includes(".png") ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/** Prefer Supabase signed URL for Muse; fall back to base64 only if signing fails. */
export async function photoUrlForMuse(photoPath: string): Promise<string> {
  const url = await signedUrl(BUCKETS.photos, photoPath);
  if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
    return url;
  }
  if (url?.startsWith("data:")) return url;
  return downloadPhotoDataUrl(photoPath);
}

export async function insertEvidence(
  row: Omit<EvidenceRow, "id" | "created_at"> & { id?: string },
): Promise<EvidenceRow> {
  const data = await dbInsertEvidence({
    session_id: row.session_id,
    kind: row.kind,
    part_id: row.part_id ?? null,
    question_id: row.question_id ?? null,
    action_id: row.action_id ?? null,
    payload: row.payload,
    source: row.source,
  });
  return data as EvidenceRow;
}

export async function loadSession(sessionId: string): Promise<SessionRow> {
  return (await getSession(sessionId)) as SessionRow;
}

export async function loadEvidence(sessionId: string): Promise<EvidenceRow[]> {
  return (await listEvidence(sessionId)) as EvidenceRow[];
}

export async function setStatus(sessionId: string, status: string) {
  await updateSession(sessionId, { status });
}
