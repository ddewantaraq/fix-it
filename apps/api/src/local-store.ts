/**
 * File-backed store used when remote Supabase tables are not migrated yet.
 * Storage buckets still use Supabase when configured.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../.data");

type Db = {
  action_packs: Record<string, Record<string, unknown>>;
  sessions: Record<string, Record<string, unknown>>;
  evidence_items: Record<string, Record<string, unknown>>;
  action_plans: Record<string, Record<string, unknown>>;
};

function dbPath() {
  return join(root, "db.json");
}

function load(): Db {
  mkdirSync(root, { recursive: true });
  if (!existsSync(dbPath())) {
    const empty: Db = {
      action_packs: {},
      sessions: {},
      evidence_items: {},
      action_plans: {},
    };
    writeFileSync(dbPath(), JSON.stringify(empty, null, 2));
    return empty;
  }
  return JSON.parse(readFileSync(dbPath(), "utf8")) as Db;
}

function save(db: Db) {
  mkdirSync(root, { recursive: true });
  writeFileSync(dbPath(), JSON.stringify(db, null, 2));
}

export const localStore = {
  upsertActionPack(row: { id: string; version: string; json: unknown; updated_at: string }) {
    const db = load();
    db.action_packs[row.id] = row;
    save(db);
  },

  insertSession(row: {
    action_pack_id: string;
    concern_text: string;
    city: string;
    status: string;
  }) {
    const db = load();
    const id = randomUUID();
    const now = new Date().toISOString();
    const full = {
      id,
      ...row,
      photo_path: null,
      voice_path: null,
      created_at: now,
      updated_at: now,
    };
    db.sessions[id] = full;
    save(db);
    return full;
  },

  getSession(id: string) {
    return load().sessions[id] ?? null;
  },

  updateSession(id: string, patch: Record<string, unknown>) {
    const db = load();
    const cur = db.sessions[id];
    if (!cur) throw new Error(`session ${id} not found`);
    db.sessions[id] = { ...cur, ...patch, updated_at: new Date().toISOString() };
    save(db);
    return db.sessions[id];
  },

  insertEvidence(row: {
    session_id: string;
    kind: string;
    part_id?: string | null;
    question_id?: string | null;
    action_id?: string | null;
    payload: Record<string, unknown>;
    source: string;
  }) {
    const db = load();
    const id = randomUUID();
    const full = {
      id,
      part_id: row.part_id ?? null,
      question_id: row.question_id ?? null,
      action_id: row.action_id ?? null,
      ...row,
      created_at: new Date().toISOString(),
    };
    db.evidence_items[id] = full;
    save(db);
    return full;
  },

  listEvidence(sessionId: string) {
    const db = load();
    return Object.values(db.evidence_items)
      .filter((e) => e.session_id === sessionId)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  },

  upsertPlan(sessionId: string, plan: unknown, share_card_path: string | null) {
    const db = load();
    const existing = Object.values(db.action_plans).find((p) => p.session_id === sessionId);
    const id = existing ? String(existing.id) : randomUUID();
    db.action_plans[id] = {
      id,
      session_id: sessionId,
      plan,
      share_card_path,
      created_at: existing?.created_at ?? new Date().toISOString(),
    };
    save(db);
    return db.action_plans[id];
  },

  getPlan(sessionId: string) {
    const db = load();
    return Object.values(db.action_plans).find((p) => p.session_id === sessionId) ?? null;
  },
};

export function localPhotoDir(sessionId: string) {
  const dir = join(root, "photos", sessionId);
  mkdirSync(dir, { recursive: true });
  return dir;
}
