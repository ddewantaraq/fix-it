import { Router } from "express";
import multer from "multer";
import {
  ActionAcceptBodySchema,
  AnswerBodySchema,
  CreateSessionBodySchema,
} from "@iklim-pal/shared";
import {
  getSessionDetail,
  recordActionAccept,
  recordAnswer,
  runAgentStep,
} from "./agent.js";
import {
  createSession,
  getStoreMode,
  insertEvidence,
  updateSession,
  uploadBlob,
  upsertActionPack,
} from "./db.js";
import { transcribeVoice } from "./meta/client.js";
import { loadActionPack } from "./pack.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "iklim-pal-api", store: getStoreMode() });
});

router.get("/packs/plastic_litter_id_v1", (_req, res) => {
  res.json(loadActionPack());
});

router.post("/sessions", async (req, res) => {
  try {
    const body = CreateSessionBodySchema.parse(req.body ?? {});
    const pack = loadActionPack();
    await upsertActionPack(pack);

    const data = await createSession({
      action_pack_id: body.actionPackId,
      concern_text: body.concernText,
      city: body.city,
      status: "collecting",
    });

    res.status(201).json({
      id: data.id,
      actionPackId: data.action_pack_id,
      concernText: data.concern_text,
      city: data.city,
      status: data.status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/sessions/:id/photo", upload.single("photo"), async (req, res) => {
  try {
    const sessionId = req.params.id;
    if (!req.file) throw new Error("photo file required (multipart field: photo)");

    const ext =
      req.file.mimetype === "image/png"
        ? "png"
        : req.file.mimetype === "image/webp"
          ? "webp"
          : "jpg";
    const path = `${sessionId}/photo.${ext}`;
    await uploadBlob("photos", path, req.file.buffer, req.file.mimetype);

    await updateSession(sessionId, {
      photo_path: path,
      status: "inspecting",
    });

    res.json({ ok: true, photoPath: path });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/sessions/:id/voice", upload.single("audio"), async (req, res) => {
  try {
    const sessionId = req.params.id;
    if (!req.file) throw new Error("audio file required (multipart field: audio)");

    const path = `${sessionId}/concern.wav`;
    await uploadBlob(
      "voice",
      path,
      req.file.buffer,
      req.file.mimetype || "audio/wav",
    );

    const { text } = await transcribeVoice({
      audio: req.file.buffer,
      filename: req.file.originalname || "concern.wav",
      mime: req.file.mimetype || "audio/wav",
    });

    await updateSession(sessionId, {
      voice_path: path,
      concern_text: text,
    });

    await insertEvidence({
      session_id: sessionId,
      kind: "voice_transcript",
      payload: { text },
      source: "muse-voice-transcribe-1.0",
    });

    res.json({ ok: true, transcript: text, voicePath: path });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/sessions/:id/step", async (req, res) => {
  try {
    const step = await runAgentStep(req.params.id);
    res.json(step);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/sessions/:id/answers", async (req, res) => {
  try {
    const body = AnswerBodySchema.parse(req.body ?? {});
    const step = await recordAnswer(req.params.id, body.questionId, body.value);
    res.json(step);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/sessions/:id/actions/:actionId", async (req, res) => {
  try {
    const body = ActionAcceptBodySchema.parse(req.body ?? {});
    const step = await recordActionAccept(
      req.params.id,
      req.params.actionId,
      body.accept,
      body.notes,
    );
    res.json(step);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/sessions/:id/finalize", async (req, res) => {
  try {
    const step = await runAgentStep(req.params.id);
    res.json(step);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/sessions/:id", async (req, res) => {
  try {
    const detail = await getSessionDetail(req.params.id);
    res.json(detail);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
