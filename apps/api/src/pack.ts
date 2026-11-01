import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DevicePackSchema, type DevicePack } from "@fix-it/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cached: DevicePack | null = null;

export function loadFanPack(): DevicePack {
  if (cached) return cached;
  const path = resolve(
    __dirname,
    "../../../packages/device-packs/household_fan_v1.json",
  );
  const raw = JSON.parse(readFileSync(path, "utf8"));
  cached = DevicePackSchema.parse(raw);
  return cached;
}

export function assertPackPart(pack: DevicePack, partId: string) {
  if (!pack.parts.some((p) => p.id === partId)) {
    throw new Error(`Unknown pack part id: ${partId}`);
  }
}

export function assertPackQuestion(pack: DevicePack, questionId: string) {
  const q = pack.questions.find((x) => x.id === questionId);
  if (!q) throw new Error(`Unknown pack question id: ${questionId}`);
  return q;
}

export function assertPackCheck(pack: DevicePack, checkId: string) {
  const c = pack.safeChecks.find((x) => x.id === checkId);
  if (!c) throw new Error(`Unknown pack check id: ${checkId}`);
  return c;
}
