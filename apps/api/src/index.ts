import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { router } from "./routes.js";
import { loadFanPack } from "./pack.js";

const app = express();
app.use(
  cors({
    origin: env.WEB_ORIGIN,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(router);

// Validate pack at boot
loadFanPack();

app.listen(env.API_PORT, () => {
  console.log(`FixIt API listening on http://localhost:${env.API_PORT}`);
  console.log(`CORS origin: ${env.WEB_ORIGIN}`);
});
