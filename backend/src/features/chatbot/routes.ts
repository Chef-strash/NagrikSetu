// Express router for the chatbot feature (session-based).
//   POST /api/v1/chatbot/session            { query, lang?, profile?, profileWard?, ulbCode? }
//   GET  /api/v1/chatbot/session/:id
//   POST /api/v1/chatbot/session/:id/select { schemeSlug, lang? }
//   POST /api/v1/chatbot/session/:id/ask    { question, lang? }
//   POST /api/v1/chatbot/session/:id/message { text, lang?, profile? }
//   POST /api/v1/chatbot/session/:id/audit  { documents[], summary? }
//   POST /api/v1/chatbot/audit-summary      { schemeName, documents[], fields[], ... }

import { Router, type Request, type Response } from "express";
import { SchemeNotFoundError } from "../feedback/service.ts";
import { normaliseAuditSummaryRequest, writeAuditSummary } from "./audit-summary-llm.ts";
import {
  askChatQuestion,
  ChatSessionNotFoundError,
  getChatSession,
  InvalidAuditError,
  NoSchemeSelectedError,
  saveChatAudit,
  selectChatScheme,
  sendSessionMessage,
  startChatSession
} from "./service.ts";

export const chatbotRouter: Router = Router();

function langOf(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

chatbotRouter.post("/chatbot/session", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    query?: unknown;
    lang?: unknown;
    profile?: unknown;
    profileWard?: unknown;
    ulbCode?: unknown;
  };

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (query.length < 3) {
    res.status(400).json({ error: "Please enter a question of at least 3 characters." });
    return;
  }
  if (query.length > 500) {
    res.status(400).json({ error: "Query is too long. Keep it under 500 characters." });
    return;
  }

  const view = await startChatSession({
    query,
    lang: langOf(body.lang),
    profile:
      typeof body.profile === "object" && body.profile !== null ? (body.profile as never) : undefined,
    profileWard: langOf(body.profileWard),
    ulbCode: langOf(body.ulbCode)
  });
  res.status(201).json(view);
});

chatbotRouter.get("/chatbot/session/:id", async (req: Request, res: Response) => {
  const view = await getChatSession(req.params.id);
  if (!view) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  res.json(view);
});

chatbotRouter.post("/chatbot/session/:id/select", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { schemeSlug?: unknown; lang?: unknown };
  const slug = typeof body.schemeSlug === "string" ? body.schemeSlug.trim() : "";
  if (!slug) {
    res.status(400).json({ error: "schemeSlug is required." });
    return;
  }

  try {
    const view = await selectChatScheme(req.params.id, slug, langOf(body.lang));
    res.json(view);
  } catch (error) {
    if (error instanceof ChatSessionNotFoundError) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    if (error instanceof SchemeNotFoundError) {
      res.status(404).json({ error: "Scheme not found." });
      return;
    }
    throw error;
  }
});

chatbotRouter.post("/chatbot/session/:id/ask", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { question?: unknown; lang?: unknown };
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 3) {
    res.status(400).json({ error: "Please enter a question of at least 3 characters." });
    return;
  }
  if (question.length > 300) {
    res.status(400).json({ error: "Question is too long. Keep it under 300 characters." });
    return;
  }

  try {
    const view = await askChatQuestion(req.params.id, question, langOf(body.lang));
    res.json(view);
  } catch (error) {
    if (error instanceof ChatSessionNotFoundError) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    if (error instanceof NoSchemeSelectedError) {
      res.status(409).json({ error: "Select a scheme before asking a question." });
      return;
    }
    throw error;
  }
});

// Unified message endpoint. After a scheme is selected, EVERY message is answered
// as scheme-info about that scheme (the selected-scheme rule).
chatbotRouter.post("/chatbot/session/:id/message", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { text?: unknown; lang?: unknown; profile?: unknown; profileWard?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 3) {
    res.status(400).json({ error: "Please enter a message of at least 3 characters." });
    return;
  }
  if (text.length > 1000) {
    res.status(400).json({ error: "Message is too long. Keep it under 1000 characters." });
    return;
  }

  try {
    const view = await sendSessionMessage(req.params.id, text, langOf(body.lang), {
      profile: body.profile,
      profileWard: langOf(body.profileWard)
    });
    res.json(view);
  } catch (error) {
    if (error instanceof ChatSessionNotFoundError) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    throw error;
  }
});

// Save a completed document audit (labels and statuses only, no field values) so the
// assistant can answer document questions; returns review tips for the scheme.
chatbotRouter.post("/chatbot/session/:id/audit", async (req: Request, res: Response) => {
  try {
    res.json(await saveChatAudit(req.params.id, req.body ?? {}));
  } catch (error) {
    if (error instanceof ChatSessionNotFoundError) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    if (error instanceof InvalidAuditError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
});

// Summarise a COMPLETED document audit for the chat thread. The audit result itself
// is computed deterministically in the web app; this endpoint only phrases it in
// plain language. It carries no field VALUES (see audit-summary-llm.ts), and with no
// LLM configured it returns { summary: null } so the caller keeps its own report.
chatbotRouter.post("/chatbot/audit-summary", async (req: Request, res: Response) => {
  const input = normaliseAuditSummaryRequest(req.body ?? {});
  if (!input) {
    res.status(400).json({ error: "A non-empty documents or fields list is required." });
    return;
  }

  const summary = await writeAuditSummary(input);
  res.json({ summary, source: summary ? "llm" : "unavailable" });
});