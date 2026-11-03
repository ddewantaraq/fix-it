/**
 * SafetyGate unit checks (no Meta calls).
 */
import { loadActionPack } from "../src/pack.js";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const pack = loadActionPack();

const hazardStop = pack.stopConditions.find((s) => s.id === "stop_hazard");
assert(hazardStop?.escalate === true, "stop_hazard must escalate");
assert(
  /needle|syringe|chemical|drum|medical/i.test(hazardStop!.userMessage),
  "hazard message must warn about medical/chemical waste",
);

const outOfScope = pack.stopConditions.find((s) => s.id === "stop_out_of_scope");
assert(outOfScope?.escalate === true, "stop_out_of_scope must escalate");

const buddy = pack.actions.find((a) => a.id === "act_buddy_cleanup");
assert(buddy?.forbiddenIf?.includes("hazard_seen"), "buddy cleanup forbidden if hazard");

const denyPolitics = [
  "vote for",
  "lobby parliament",
  "join protest",
  "political party",
];
for (const a of pack.actions) {
  const blob = `${a.title} ${a.steps.join(" ")}`.toLowerCase();
  for (const bad of denyPolitics) {
    assert(!blob.includes(bad), `action ${a.id} must not contain "${bad}"`);
  }
}

assert(pack.questions.some((q) => q.id === "q_hazard"), "q_hazard required");

console.log("SafetyGate OK");
