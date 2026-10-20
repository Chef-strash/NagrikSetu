// Turns a chatbot `/message` response into the single string shown in the chat
// thread. Pure, so the shape is directly unit-testable.

import type { ChatMessageResponse } from "./api";

export function replyText(response: ChatMessageResponse): string {
  const faq = response.faq;

  // Not covered by the maintained FAQs: the backend still returns a guidance reply.
  if (!faq || !faq.answered) {
    return response.message;
  }

  const paragraphs = [faq.answer];

  // Practical, on-the-ground experience reported at the citizen's own counter.
  if (response.reviews.length > 0) {
    const first = response.reviews[0];
    paragraphs.push(
      `Reported at the counter${first.counter ? ` (${first.counter})` : ""}: ${first.text}`
    );
  }

  if (faq.officialUrl) {
    paragraphs.push(`Official form: ${faq.officialUrl}`);
  }

  // Guidance, never a binding decision.
  paragraphs.push(faq.guidance);

  return paragraphs.join("\n\n");
}