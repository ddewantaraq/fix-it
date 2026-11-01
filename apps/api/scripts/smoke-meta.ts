/**
 * Smoke Meta Model API: SAM 3.1 + Muse Spark.
 * Requires MODEL_API_KEY in repo-root .env
 *
 * Usage: npm run smoke:meta
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { sparkRespond, segmentWithSam } from "../src/meta/client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

/** Tiny 1x1 PNG so the call exercises the image path without a fixture. */
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
    userText:
      'Return {"ok":true,"note":"smoke"} as JSON. Do not invent a repair diagnosis.',
    jsonSchemaHint: "object",
  });
  console.log("Spark text:", spark.text.slice(0, 500));

  console.log("Calling sam-3.1…");
  const sam = await segmentWithSam({
    imageDataUrl: TINY_PNG_DATA_URL,
    phrase: "power switch",
  });
  console.log("SAM text (truncated):", sam.text.slice(0, 500));

  const out = resolve(__dirname, "smoke-meta-last.json");
  writeFileSync(
    out,
    JSON.stringify({ spark: spark.raw, sam: sam.raw }, null, 2),
  );
  console.log("Wrote", out);
  console.log("Smoke OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
