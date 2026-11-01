import { Router } from "express";
import multer from "multer";
import {
  AnswerBodySchema,
  CheckBodySchema,
  CreateSessionBodySchema,
} from "@fix-it/shared";
import {
  getSessionDetail,
  recordAnswer,
  recordCheck,
  runAgentStep,
} from "./agent.js";
import { loadFanPack } from "./pack.js";
import { BUCKETS, getSupabase } from "./supabase.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "fix-it-api" });
});

router.get("/packs/household_fan_v1", (_req, res) => {
  res.json(loadFanPack());
});

router.post("/sessions", async (req, res) => {
  try {
    const body = CreateSessionBodySchema.parse(req.body ?? {});
    const sb = getSupabase();

    // Ensure FK row exists
    await sb.from("device_packs").upsert({
      id: "household_fan_v1",
      version: "1",
      json: loadFanPack(),
      updated_at: new Date().toISOString(),
    });

    const { data, error } = await sb
      .from("sessions")
      .insert({
        device_pack_id: body.devicePackId,
        symptom: body.symptom,
        status: "collecting",
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    res.status(201).json({
      id: data.id,
      devicePackId: data.device_pack_id,
      symptom: data.symptom,
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

    const sb = getSupabase();
    const ext =
      req.file.mimetype === "image/png"
        ? "png"
        : req.file.mimetype === "image/webp"
          ? "webp"
          : "jpg";
    const path = `${sessionId}/original.${ext}`;

    const { error: upErr } = await sb.storage
      .from(BUCKETS.photos)
      .upload(path, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
    if (upErr) throw new Error(upErr.message);

    const { data, error } = await sb
      .from("sessions")
      .update({
        photo_path: path,
        status: "inspecting",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    res.json({
      id: data.id,
      photoPath: data.photo_path,
      status: data.status,
    });
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
    const body = AnswerBodySchema.parse(req.body);
    await recordAnswer(req.params.id, body.questionId, body.value);
    const step = await runAgentStep(req.params.id);
    res.json(step);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/sessions/:id/checks/:checkId", async (req, res) => {
  try {
    const body = CheckBodySchema.parse(req.body);
    await recordCheck(
      req.params.id,
      req.params.checkId,
      body.outcome,
      body.notes,
      body.unpluggedAcknowledged,
    );
    const step = await runAgentStep(req.params.id);
    res.json(step);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/sessions/:id/finalize", async (req, res) => {
  try {
    // Force finalize by calling step until done — for D1, one finalize path via planner fallback
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
