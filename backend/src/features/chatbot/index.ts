// Chatbot feature barrel. Mounted by `app.ts`:
//
//   app.use("/api/v1", chatbotRouter);

export { chatbotRouter } from "./routes.ts";
export {
  buildAuditSummaryPrompt,
  normaliseAuditSummaryRequest,
  normaliseAuditSummaryText,
  writeAuditSummary
} from "./audit-summary-llm.ts";
export { decompose } from "./decompose.ts";
export { rankSchemes } from "./retrieve.ts";
export { assessScheme } from "./assess.ts";
export {
  askChatQuestion,
  ChatSessionNotFoundError,
  getChatSession,
  NoSchemeSelectedError,
  selectChatScheme,
  sendSessionMessage,
  startChatSession
} from "./service.ts";
export type * from "./types.ts";