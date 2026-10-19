// Express application factory. Exported separately from the listener so tests
// can mount it on an ephemeral port without starting the production server.
//
// To add a feature: create `src/features/<name>/index.ts` exporting a router,
// then mount it below. Keep feature logic inside its own folder.

import express, { type Express } from "express";
import { feedbackRouter } from "./features/feedback/index.ts";
import { chatbotRouter } from "./features/chatbot/index.ts";

export function createApp(): Express {
  const app = express();

  app.use(express.json({ limit: "16kb" }));

  // The web app runs on a different origin during local development.
  //
  // The OPTIONS preflight is answered inside this middleware rather than with an
  // `app.options("*", ...)` route. The bare "*" path is only valid on Express 4
  // (path-to-regexp 0.1.x); a fresh top-level `npm install` hoists the
  // `express@5` that `@cline/sdk` pulls in transitively, and Express 5 throws
  // "Missing parameter name at index 1: *" while mounting the route. Answering
  // the preflight here keeps the server working under either major version.
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "nagriksetu-backend", version: "0.1.0" });
  });

  // --- Feature routers -------------------------------------------------------
  app.use("/api/v1", feedbackRouter);
  app.use("/api/v1", chatbotRouter);

  return app;
}