/**
 * Smoke Meta Model API for Iklim PAL: Spark + SAM (+ optional Wonder).
 * Requires MODEL_API_KEY in repo-root .env
 *
 * Usage: npm run smoke:meta
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { sparkRespond, segmentWithSam, wonderRespond } from "../src/meta/client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function main() {
  if (!process.env.MODEL_API_KEY) {
    console.error("MODEL_API_KEY missing. Copy .env.example → .env and set the key.");
    process.exit(1);
  }

  console.log("Calling muse-spark-1.3…");
  const spark = await sparkRespond({
    system: "Reply with compact JSON only.",
    userText: 'Return {"ok":true,"product":"iklim-pal"} as JSON.',
  });
  console.log("Spark text:", spark.text.slice(0, 500));

  console.log("Calling sam-3.1…");
  const sam = await segmentWithSam({
    imageDataUrl: TINY_PNG_DATA_URL,
    phrase: "plastic bottle",
  });
  console.log("SAM text (truncated):", sam.text.slice(0, 500));

  console.log("Calling muse-wonder-1.0…");
  const wonder = await wonderRespond({
    system: "Reply with compact JSON only.",
    userText: 'Return {"ok":true,"role":"action_plan"} as JSON.',
  });
  console.log("Wonder text:", wonder.text.slice(0, 500));

  const out = resolve(__dirname, "smoke-meta-last.json");
  writeFileSync(
    out,
    JSON.stringify({ spark: spark.raw, sam: sam.raw, wonder: wonder.raw }, null, 2),
  );
  console.log("Wrote", out);
  console.log("Smoke OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
