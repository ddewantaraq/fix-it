import { requireMetaKey, env } from "../env.js";

type ContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string };

async function responsesCreate(body: Record<string, unknown>) {
  const key = requireMetaKey();
  const res = await fetch(`${env.META_API_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Meta API ${res.status}: ${text.slice(0, 2000)}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function extractOutputText(response: Record<string, unknown>): string {
  if (typeof response.output_text === "string") return response.output_text;
  const output = response.output;
  if (!Array.isArray(output)) return JSON.stringify(response);
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as { type?: string; text?: string };
      if (p.type === "output_text" && typeof p.text === "string") {
        chunks.push(p.text);
      }
    }
  }
  return chunks.join("\n") || JSON.stringify(response);
}

/** Segment objects with SAM 3.1 via Responses API. */
export async function segmentWithSam(opts: {
  imageDataUrl: string;
  phrase: string;
}): Promise<{ raw: Record<string, unknown>; text: string }> {
  const raw = await responsesCreate({
    model: "sam-3.1",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: opts.phrase },
          { type: "input_image", image_url: opts.imageDataUrl },
        ] satisfies ContentPart[],
      },
    ],
  });
  return { raw, text: extractOutputText(raw) };
}

/** Muse Spark multimodal / structured planner. */
export async function sparkRespond(opts: {
  system: string;
  userText: string;
  imageDataUrl?: string;
  jsonSchemaHint?: string;
}): Promise<{ raw: Record<string, unknown>; text: string }> {
  const content: ContentPart[] = [{ type: "input_text", text: opts.userText }];
  if (opts.imageDataUrl) {
    content.push({ type: "input_image", image_url: opts.imageDataUrl });
  }

  const raw = await responsesCreate({
    model: "muse-spark-1.3",
    input: [
      { role: "system", content: opts.system },
      { role: "user", content },
    ],
    ...(opts.jsonSchemaHint
      ? {
          text: {
            format: {
              type: "json_object",
            },
          },
        }
      : {}),
  });
  return { raw, text: extractOutputText(raw) };
}

export function parseJsonFromModel(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Model did not return JSON: ${trimmed.slice(0, 400)}`);
    return JSON.parse(match[0]);
  }
}
