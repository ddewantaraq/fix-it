import cors from "cors";
import express from "express";
import { env } from "./env.js";
import { router } from "./routes.js";

const app = express();
app.use(
  cors({
    origin: env.WEB_ORIGIN,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(router);

app.listen(env.API_PORT, () => {
  console.log(`Iklim PAL API listening on http://localhost:${env.API_PORT}`);
});
