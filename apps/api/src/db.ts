/**
 * Persistence layer: prefers Supabase tables when migrated; otherwise local JSON.
 * File blobs prefer Supabase Storage buckets; fall back to .data/ files.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { env, requireSupabase } from "./env.js";
import { localPhotoDir, localStore } from "./local-store.js";

export const BUCKETS = {
  photos: "session-photos",
  masks: "session-masks",
  shareCards: "session-share-cards",
  voice: "session-voice",
} as const;

let mode: "supabase" | "local" | null = null;
let sb: SupabaseClient | null = null;

export function getStoreMode(): "supabase" | "local" {
  if (!mode) throw new Error("db not initialized — call initDb() first");
  return mode;
}

function client(): SupabaseClient {
  if (!sb) {
    const { url, serviceRoleKey } = requireSupabase();
    sb = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return sb;
}

/** Probe remote schema once at boot. */
export async function initDb(): Promise<"supabase" | "local"> {
  if (mode) return mode;
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      mode = "local";
      console.warn("[db] Supabase env missing — using local JSON store");
      return mode;
    }
    const c = client();
    const { error } = await c.from("action_packs").select("id").limit(1);
    if (error) {
      mode = "local";
      console.warn(
        "[db] Remote tables missing (apply supabase/migrations/001_iklim_pal.sql). Using local JSON store + Storage when possible.",
        error.message,
      );
    } else {
      mode = "supabase";
      console.log("[db] Using Supabase tables");
    }
  } catch (err) {
    mode = "local";
    console.warn("[db] Falling back to local store:", err);
  }
  return mode;
}

export async function upsertActionPack(pack: unknown) {
  const row = {
    id: "plastic_litter_id_v1",
    version: "1",
    json: pack,
    updated_at: new Date().toISOString(),
  };
  if (getStoreMode() === "local") {
    localStore.upsertActionPack(row);
    return;
  }
  const { error } = await client().from("action_packs").upsert(row);
  if (error) throw new Error(error.message);
}

export async function createSession(input: {
  action_pack_id: string;
  concern_text: string;
  city: string;
  status: string;
  owner_key?: string | null;
}) {
  if (getStoreMode() === "local") {
    return localStore.insertSession(input);
  }
  const { data, error } = await client()
    .from("sessions")
    .insert(input)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listSessionsByOwner(ownerKey: string) {
  if (getStoreMode() === "local") {
    return localStore.listSessionsByOwner(ownerKey);
  }
  const { data, error } = await client()
    .from("sessions")
    .select("*")
    .eq("owner_key", ownerKey)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSession(id: string) {
  if (getStoreMode() === "local") {
    const row = localStore.getSession(id);
    if (!row) throw new Error("session not found");
    return row;
  }
  const { data, error } = await client().from("sessions").select("*").eq("id", id).single();
  if (error || !data) throw new Error(error?.message ?? "session not found");
  return data;
}

export async function updateSession(id: string, patch: Record<string, unknown>) {
  if (getStoreMode() === "local") {
    return localStore.updateSession(id, patch);
  }
  const { data, error } = await client()
    .from("sessions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function insertEvidence(row: {
  session_id: string;
  kind: string;
  part_id?: string | null;
  question_id?: string | null;
  action_id?: string | null;
  payload: Record<string, unknown>;
  source: string;
}) {
  if (getStoreMode() === "local") {
    return localStore.insertEvidence(row);
  }
  const { data, error } = await client().from("evidence_items").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listEvidence(sessionId: string) {
  if (getStoreMode() === "local") {
    return localStore.listEvidence(sessionId);
  }
  const { data, error } = await client()
    .from("evidence_items")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveActionPlan(
  sessionId: string,
  plan: unknown,
  share_card_path: string | null,
) {
  if (getStoreMode() === "local") {
    return localStore.upsertPlan(sessionId, plan, share_card_path);
  }
  const { data, error } = await client()
    .from("action_plans")
    .insert({
      session_id: sessionId,
      plan,
      share_card_path,
      progress: { completedStepOrders: [] },
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getActionPlan(sessionId: string) {
  if (getStoreMode() === "local") {
    return localStore.getPlan(sessionId);
  }
  const { data, error } = await client()
    .from("action_plans")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function updatePlanProgress(
  sessionId: string,
  progress: { completedStepOrders: number[] },
) {
  if (getStoreMode() === "local") {
    return localStore.updatePlanProgress(sessionId, progress);
  }
  const existing = await getActionPlan(sessionId);
  if (!existing?.id) throw new Error("plan not found");
  const { data, error } = await client()
    .from("action_plans")
    .update({ progress })
    .eq("id", existing.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteEvidenceMatching(
  sessionId: string,
  opts: { questionIds?: string[]; kinds?: string[] },
) {
  if (getStoreMode() === "local") {
    localStore.deleteEvidence(sessionId, opts);
    return;
  }
  const sb = client();
  if (opts.questionIds?.length) {
    const { error } = await sb
      .from("evidence_items")
      .delete()
      .eq("session_id", sessionId)
      .in("question_id", opts.questionIds);
    if (error) throw new Error(error.message);
  }
  if (opts.kinds?.length) {
    const { error } = await sb
      .from("evidence_items")
      .delete()
      .eq("session_id", sessionId)
      .in("kind", opts.kinds);
    if (error) throw new Error(error.message);
  }
}

export async function deleteEvidenceByIds(ids: string[]) {
  if (ids.length === 0) return;
  if (getStoreMode() === "local") {
    localStore.deleteEvidenceByIds(ids);
    return;
  }
  const { error } = await client().from("evidence_items").delete().in("id", ids);
  if (error) throw new Error(error.message);
}

export async function deleteActionPlans(sessionId: string) {
  if (getStoreMode() === "local") {
    localStore.deletePlans(sessionId);
    return;
  }
  const { error } = await client().from("action_plans").delete().eq("session_id", sessionId);
  if (error) throw new Error(error.message);
}

async function uploadStorage(
  bucket: string,
  path: string,
  body: Buffer,
  contentType: string,
): Promise<"supabase" | "local"> {
  try {
    const { error } = await client().storage.from(bucket).upload(path, body, {
      contentType,
      upsert: true,
    });
    if (!error) return "supabase";
    console.warn(`[storage] upload ${bucket}/${path} failed:`, error.message);
  } catch (err) {
    console.warn(`[storage] upload error:`, err);
  }
  const sessionId = path.split("/")[0] ?? "unknown";
  const dir = localPhotoDir(sessionId);
  const file = join(dir, path.replace(/\//g, "__"));
  writeFileSync(file, body);
  return "local";
}

export async function uploadBlob(
  bucket: keyof typeof BUCKETS,
  path: string,
  body: Buffer,
  contentType: string,
) {
  const where = await uploadStorage(BUCKETS[bucket], path, body, contentType);
  return { path, where };
}

export async function downloadPhoto(photoPath: string): Promise<Buffer> {
  // local file marker
  if (photoPath.startsWith("local:")) {
    const file = photoPath.slice("local:".length);
    return readFileSync(file);
  }
  try {
    const { data, error } = await client().storage.from(BUCKETS.photos).download(photoPath);
    if (!error && data) return Buffer.from(await data.arrayBuffer());
  } catch {
    /* fall through */
  }
  const sessionId = photoPath.split("/")[0] ?? "";
  const file = join(localPhotoDir(sessionId), photoPath.replace(/\//g, "__"));
  if (existsSync(file)) return readFileSync(file);
  throw new Error(`Photo not found: ${photoPath}`);
}

export async function signedUrl(bucket: string, path: string): Promise<string | null> {
  try {
    const { data, error } = await client().storage.from(bucket).createSignedUrl(path, 60 * 60);
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch {
    /* ignore */
  }
  const sessionId = path.split("/")[0] ?? "";
  const file = join(localPhotoDir(sessionId), path.replace(/\//g, "__"));
  if (existsSync(file)) {
    // Serve via API static is not wired; return data URL for small JSON masks only
    const buf = readFileSync(file);
    if (buf.byteLength < 200_000) {
      const mime = path.endsWith(".png") ? "image/png" : "application/json";
      return `data:${mime};base64,${buf.toString("base64")}`;
    }
  }
  return null;
}

export function ensureLocalDir() {
  mkdirSync(join(process.cwd(), ".data"), { recursive: true });
}
