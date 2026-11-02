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

export async function sparkRespond(opts: {
  system: string;
  userText: string;
  imageDataUrl?: string;
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
    text: { format: { type: "json_object" } },
  });
  return { raw, text: extractOutputText(raw) };
}

export async function wonderRespond(opts: {
  system: string;
  userText: string;
  imageDataUrl?: string;
}): Promise<{ raw: Record<string, unknown>; text: string }> {
  const content: ContentPart[] = [{ type: "input_text", text: opts.userText }];
  if (opts.imageDataUrl) {
    content.push({ type: "input_image", image_url: opts.imageDataUrl });
  }

  const raw = await responsesCreate({
    model: "muse-wonder-1.0",
    input: [
      { role: "system", content: opts.system },
      { role: "user", content },
    ],
    text: { format: { type: "json_object" } },
    reasoning: { effort: "high" },
  });
  return { raw, text: extractOutputText(raw) };
}

/** Muse Image — share / invite card. Returns data URL when possible. */
export async function generateShareCard(opts: {
  prompt: string;
  referenceImageDataUrl?: string;
}): Promise<{ dataUrl?: string; raw: Record<string, unknown> }> {
  const key = requireMetaKey();
  const body: Record<string, unknown> = {
    model: "muse-image-1.0",
    prompt: opts.prompt,
    n: 1,
  };
  if (opts.referenceImageDataUrl) {
    // Prefer edits when we have a reference crop; fall back to generations.
    const res = await fetch(`${env.META_API_BASE_URL}/images/edits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "muse-image-1.0",
        prompt: opts.prompt,
        image: opts.referenceImageDataUrl,
      }),
    });
    const text = await res.text();
    if (res.ok) {
      const raw = JSON.parse(text) as Record<string, unknown>;
      return { raw, dataUrl: extractImageDataUrl(raw) };
    }
  }

  const res = await fetch(`${env.META_API_BASE_URL}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Muse Image ${res.status}: ${text.slice(0, 2000)}`);
  }
  const raw = JSON.parse(text) as Record<string, unknown>;
  return { raw, dataUrl: extractImageDataUrl(raw) };
}

function extractImageDataUrl(raw: Record<string, unknown>): string | undefined {
  const data = raw.data;
  if (!Array.isArray(data) || !data[0] || typeof data[0] !== "object") {
    return undefined;
  }
  const first = data[0] as { b64_json?: string; url?: string };
  if (first.b64_json) return `data:image/png;base64,${first.b64_json}`;
  if (first.url) return first.url;
  return undefined;
}

/** Muse Voice Transcribe — file upload stub via multipart-compatible fetch. */
export async function transcribeVoice(opts: {
  audio: Buffer;
  filename: string;
  mime: string;
}): Promise<{ text: string; raw: Record<string, unknown> }> {
  const key = requireMetaKey();
  const form = new FormData();
  form.append("model", "muse-voice-transcribe-1.0");
  form.append(
    "file",
    new Blob([new Uint8Array(opts.audio)], { type: opts.mime }),
    opts.filename,
  );

  const res = await fetch(`${env.META_API_BASE_URL}/asr/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Voice Transcribe ${res.status}: ${text.slice(0, 2000)}`);
  }
  const raw = JSON.parse(text) as Record<string, unknown>;
  const transcript =
    typeof raw.text === "string"
      ? raw.text
      : typeof raw.transcript === "string"
        ? raw.transcript
        : extractOutputText(raw);
  return { text: transcript, raw };
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
