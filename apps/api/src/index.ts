import cors from "cors";
import express from "express";
import { initDb } from "./db.js";
import { env } from "./env.js";
import { router } from "./routes.js";

async function main() {
  const store = await initDb();
  const app = express();
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(router);

  app.listen(env.API_PORT, () => {
    console.log(
      `Iklim PAL API listening on http://localhost:${env.API_PORT} (store=${store})`,
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
