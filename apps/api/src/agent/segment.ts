import type { ActionPack } from "@iklim-pal/shared";
import { BUCKETS, signedUrl, uploadBlob } from "../db.js";
import { segmentWithSam } from "../meta/client.js";
import { assertPackPart } from "../pack.js";
import { insertEvidence, setStatus } from "./io.js";
import type { EvidenceRow, SessionRow } from "./types.js";

export async function collectMasksUi(evidence: EvidenceRow[]) {
  const masks: { partId: string; url: string }[] = [];
  for (const e of evidence.filter((x) => x.kind === "sam_mask")) {
    const path = typeof e.payload.maskPath === "string" ? e.payload.maskPath : null;
    const partId = e.part_id ?? "unknown";
    if (path) {
      const url = await signedUrl(BUCKETS.masks, path);
      if (url) masks.push({ partId, url });
    }
  }
  return masks;
}

export async function runSegment(
  session: SessionRow,
  pack: ActionPack,
  partIds: string[],
  imageUrl: string,
): Promise<void> {
  const ids = partIds.length
    ? partIds
    : pack.parts.filter((p) => p.requiredForDemo).map((p) => p.id);
  for (const partId of ids) {
    assertPackPart(pack, partId);
    const part = pack.parts.find((p) => p.id === partId)!;
    const sam = await segmentWithSam({
      imageDataUrl: imageUrl,
      phrase: part.samPhrase,
    });
    const maskPath = `${session.id}/${partId}-${Date.now()}.json`;
    await uploadBlob(
      "masks",
      maskPath,
      Buffer.from(JSON.stringify({ phrase: part.samPhrase, sam: sam.text })),
      "application/json",
    );
    await insertEvidence({
      session_id: session.id,
      kind: "sam_mask",
      part_id: partId,
      question_id: null,
      action_id: null,
      payload: { maskPath, samText: sam.text.slice(0, 2000), samPhrase: part.samPhrase },
      source: "sam-3.1",
    });
  }
  await setStatus(session.id, "inspecting");
}
