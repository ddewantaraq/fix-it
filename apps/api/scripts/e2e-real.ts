/**
 * Real-agent E2E using fixture litter photos (no tiny placeholders).
 * Usage: npx tsx scripts/e2e-real.ts
 * Requires API running on VITE_API_BASE_URL / localhost:API_PORT
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

const API = process.env.VITE_API_BASE_URL || `http://localhost:${process.env.API_PORT || 3001}`;
const root = resolve(__dirname, "../../..");

const answers: Record<string, string | boolean> = {
  q_concern_confirm: true,
  q_concern: "Plastic bags and bottles along the riverbank.",
  q_city: "Bandung — Cikapundung riverside",
  q_hours: "1_to_2h",
  q_friends: true,
  q_gloves: true,
  q_near_water: true,
  q_hazard: false,
  q_plan_match: true,
};

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, init);
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${init?.method || "GET"} ${path} → ${res.status}: ${text.slice(0, 1500)}`);
  }
  return body as Record<string, unknown>;
}

async function runScenario(opts: {
  name: string;
  photo: string;
  cityHint?: string;
  forceHazard?: boolean;
}) {
  console.log(`\n=== ${opts.name} ===`);
  const session = await api("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actionPackId: "plastic_litter_id_v1",
      city: opts.cityHint ?? "",
      concernText: "",
    }),
  });
  const sessionId = String(session.id);
  console.log("session", sessionId);

  const buf = readFileSync(opts.photo);
  console.log("upload bytes", buf.byteLength, opts.photo);
  const form = new FormData();
  form.append("photo", new Blob([buf], { type: "image/png" }), "photo.png");
  await api(`/sessions/${sessionId}/photo`, { method: "POST", body: form });

  let step: Record<string, unknown> | null = null;
  for (let i = 0; i < 24; i++) {
    step = await api(`/sessions/${sessionId}/step`, { method: "POST" });
    const status = step.status;
    const escalated = step.escalated;
    const ui = step.ui as {
      question?: { id: string } | null;
      proposedAction?: { id: string } | null;
      plan?: unknown;
      masks?: unknown[];
    };
    console.log(
      `step ${i}: status=${status} escalated=${escalated} masks=${ui.masks?.length ?? 0} q=${ui.question?.id ?? "-"} action=${ui.proposedAction?.id ?? "-"} plan=${ui.plan ? "yes" : "no"}`,
    );
    console.log("  msg:", String(step.assistantMessage).slice(0, 160));

    if (
      (escalated || status === "done" || status === "active" || status === "escalated") &&
      !ui.question?.id
    ) {
      break;
    }

    if (ui.question?.id) {
      let value: string | boolean = answers[ui.question.id] ?? "yes";
      if (opts.forceHazard && ui.question.id === "q_hazard") value = true;
      if (!opts.forceHazard && ui.question.id === "q_hazard") value = false;
      step = await api(`/sessions/${sessionId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: ui.question.id, value }),
      });
      console.log(
        `  answered ${ui.question.id}=${String(value)} → status=${step.status} escalated=${step.escalated}`,
      );
      const nextUi = step.ui as { question?: { id: string } | null };
      if (
        (step.escalated ||
          step.status === "done" ||
          step.status === "active" ||
          step.status === "escalated") &&
        !nextUi.question?.id
      ) {
        break;
      }
      continue;
    }

    if (ui.proposedAction?.id) {
      step = await api(`/sessions/${sessionId}/actions/${ui.proposedAction.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept: true }),
      });
      console.log(`  accepted action → status=${step.status}`);
      const nextUi = step.ui as { question?: { id: string } | null };
      if (
        (step.escalated ||
          step.status === "done" ||
          step.status === "active" ||
          step.status === "escalated") &&
        !nextUi.question?.id
      ) {
        break;
      }
    }
  }

  return { sessionId, step };
}

async function main() {
  const health = await api("/health");
  console.log("health", health);

  const s2 = await runScenario({
    name: "S2_riverbank_bags",
    photo: resolve(root, "fixtures/litter/S2_riverbank_bags/photo.png"),
    cityHint: "Bandung",
  });

  const s4 = await runScenario({
    name: "S4_hazard_escalate",
    photo: resolve(root, "fixtures/litter/S4_hazard_escalate/photo.png"),
    cityHint: "Bandung",
    forceHazard: true,
  });

  const out = {
    s2: { sessionId: s2.sessionId, status: s2.step?.status, escalated: s2.step?.escalated, hasPlan: Boolean((s2.step?.ui as { plan?: unknown })?.plan) },
    s4: {
      sessionId: s4.sessionId,
      status: s4.step?.status,
      escalated: s4.step?.escalated,
      hasPlan: Boolean((s4.step?.ui as { plan?: unknown })?.plan),
    },
  };
  writeFileSync(resolve(__dirname, "e2e-last.json"), JSON.stringify({ out, s2, s4 }, null, 2));
  console.log("\nSUMMARY", out);

  // S2: plan + plan-match Yes → status active (executing); escalate path separate
  const s2pass =
    Boolean(out.s2.hasPlan) ||
    out.s2.status === "active" ||
    out.s2.status === "done";
  const s4pass =
    (Boolean(out.s4.escalated) || out.s4.status === "escalated") &&
    Boolean(out.s4.hasPlan);

  if (!s2pass) {
    console.error("FAIL S2: expected Action Plan from real Muse path");
    process.exit(1);
  }
  if (!s4pass) {
    console.error("FAIL S4: expected escalate with authority-contact plan");
    process.exit(1);
  }
  console.log("E2E OK (real fixtures + real agent)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
