import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

const EnvSchema = z.object({
  MODEL_API_KEY: z.string().optional(),
  META_API_BASE_URL: z.string().default("https://api.meta.ai/v1"),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  API_PORT: z.coerce.number().default(3001),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
});

export const env = EnvSchema.parse(process.env);

export function requireMetaKey(): string {
  if (!env.MODEL_API_KEY) {
    throw new Error(
      "MODEL_API_KEY is missing. Copy .env.example to .env and set MODEL_API_KEY.",
    );
  }
  return env.MODEL_API_KEY;
}

export function requireSupabase() {
  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "Supabase env missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env",
    );
  }
  return {
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: env.SUPABASE_ANON_KEY,
  };
}
