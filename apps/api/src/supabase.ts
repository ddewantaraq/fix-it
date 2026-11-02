import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabase } from "./env.js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const { url, serviceRoleKey } = requireSupabase();
    client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export const BUCKETS = {
  photos: "session-photos",
  masks: "session-masks",
  shareCards: "session-share-cards",
  voice: "session-voice",
} as const;
