// Express router for the citizen feedback API.
//   GET  /api/v1/schemes/:slug/faqs
//   GET  /api/v1/schemes/:slug/reviews
//   POST /api/v1/schemes/:slug/reviews      (submit a review; service-role write)
//   POST /api/v1/schemes/:slug/faq-answer

import { Router, type Request, type Response } from "express";
import {
  getFaqAnswer,
  getFaqs,
  getReviews,
  SchemeNotFoundError,
  submitReview
} from "./service.ts";

export const feedbackRouter: Router = Router();

feedbackRouter.get("/schemes/:slug/faqs", async (req: Request, res: Response) => {
  const lang = typeof req.query.lang === "string" ? req.query.lang : "en";
  const body = await getFaqs(req.params.slug, lang);
  res.json(body);
});

feedbackRouter.get("/schemes/:slug/reviews", async (req: Request, res: Response) => {
  const parsed = Number.parseInt(String(req.query.limit ?? "20"), 10);
  const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 50) : 20;
  const body = await getReviews(req.params.slug, limit);
  res.json(body);
});

feedbackRouter.post("/schemes/:slug/faq-answer", async (req: Request, res: Response) => {
  const raw = (req.body ?? {}) as {
    question?: unknown;
    lang?: unknown;
    ward?: unknown;
    location?: unknown;
  };
  const question = typeof raw.question === "string" ? raw.question.trim() : "";
  const lang = typeof raw.lang === "string" ? raw.lang : null;
  const location =
    typeof raw.location === "string"
      ? raw.location
      : typeof raw.ward === "string"
        ? raw.ward
        : null;

  if (question.length < 3) {
    res.status(400).json({ error: "Please enter a question of at least 3 characters." });
    return;
  }
  if (question.length > 300) {
    res.status(400).json({ error: "Question is too long. Keep it under 300 characters." });
    return;
  }

  try {
    const body = await getFaqAnswer(req.params.slug, question, lang, { location });
    res.json(body);
  } catch (error) {
    if (error instanceof SchemeNotFoundError) {
      res.status(404).json({ error: "Scheme not found." });
      return;
    }
    throw error;
  }
});

// Submit a citizen review (validated; written with the service role).
feedbackRouter.post("/schemes/:slug/reviews", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  try {
    const result = await submitReview(req.params.slug, body);
    if (result.unavailable) {
      res.status(503).json({ error: "Review submission is unavailable (no database)." });
      return;
    }
    if (!result.ok) {
      res.status(400).json({ errors: result.errors });
      return;
    }
    res.status(201).json({ review: result.review });
  } catch (error) {
    if (error instanceof SchemeNotFoundError) {
      res.status(404).json({ error: "Scheme not found." });
      return;
    }
    throw error;
  }
});