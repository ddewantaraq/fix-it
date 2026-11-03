/**
 * Quality gates: pack validation + banned claim patterns.
 */
import { ActionPackSchema } from "@iklim-pal/shared";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadActionPack } from "../src/pack.js";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const pack = loadActionPack();
ActionPackSchema.parse(pack);

const banned = [
  /guaranteed\s+co2/i,
  /tons?\s+of\s+co2/i,
  /solved\s+climate/i,
  /vote\s+for/i,
  /lobby(ing)?\s+(the\s+)?(parliament|congress|dpr)/i,
  /join\s+(a\s+)?protest/i,
];

const packBlob = JSON.stringify(pack);
for (const re of banned) {
  assert(!re.test(packBlob), `pack must not match ${re}`);
}

const expectedS2 = JSON.parse(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/litter/S2_riverbank_bags/expected-plan.json"),
    "utf8",
  ),
);
assert(
  expectedS2.expectRecommendation ||
    expectedS2.recommendation ||
    expectedS2.goal ||
    expectedS2.mustUsePackActionIds,
  "S2 expected-plan present",
);

const expectedS4 = JSON.parse(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/litter/S4_hazard_escalate/expected-plan.json"),
    "utf8",
  ),
);
assert(
  expectedS4.expectRecommendation === "stop_and_escalate" ||
    expectedS4.expectEscalated === true ||
    expectedS4.recommendation === "stop_and_escalate" ||
    expectedS4.escalate === true ||
    /escalat/i.test(JSON.stringify(expectedS4)),
  "S4 expected plan should escalate",
);

console.log("Quality gate OK");
