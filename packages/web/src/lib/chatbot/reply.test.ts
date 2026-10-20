import test from "node:test";
import assert from "node:assert/strict";
import { replyText } from "./reply.ts";
import type { ChatMessageResponse } from "./api.ts";

function response(partial: Partial<ChatMessageResponse> = {}): ChatMessageResponse {
  return {
    sessionId: "s1",
    selectedSlug: "pmc-azad-class10",
    forcedIntent: true,
    kind: "faq_answer",
    message: "Answered from the selected scheme's maintained information.",
    faq: null,
    answerSource: "none",
    reviews: [],
    eligibility: null,
    ...partial
  };
}

test("returns the grounded FAQ answer with the guidance caveat", () => {
  const text = replyText(
    response({
      faq: {
        answered: true,
        answer: "Bring an attested Class 10 marksheet.",
        references: [{ id: "faq-1", question: "Which documents are required?" }],
        officialUrl: "https://dbt.pmc.gov.in/forms/maulana_azad_ssc.pdf",
        guidance: "This is guidance from maintained scheme information, not an official decision."
      },
      answerSource: "faq"
    })
  );

  assert.match(text, /Bring an attested Class 10 marksheet\./);
  assert.match(text, /Official form: https:\/\/dbt\.pmc\.gov\.in/);
  assert.match(text, /not an official decision/);
});

test("adds a location-matched citizen report when one was used", () => {
  const text = replyText(
    response({
      faq: {
        answered: true,
        answer: "Carry two passport photos.",
        references: [],
        officialUrl: null,
        guidance: "Guidance, not a decision."
      },
      reviews: [
        { id: "r1", text: "Clerk asked for photos with a paperclip.", counter: "Kothrud Ward 14", helpfulCount: 4 }
      ],
      answerSource: "faq"
    })
  );

  assert.match(text, /Reported at the counter \(Kothrud Ward 14\): Clerk asked for photos with a paperclip\./);
});

test("falls back to the backend message when no FAQ covers the question", () => {
  const text = replyText(
    response({
      message: "That is not covered by the selected scheme's maintained FAQs.",
      faq: {
        answered: false,
        answer: "",
        references: [],
        officialUrl: null,
        guidance: "Guidance, not a decision."
      }
    })
  );

  assert.equal(text, "That is not covered by the selected scheme's maintained FAQs.");
});

test("handles a null faq payload", () => {
  const text = replyText(response({ message: "Tell me your situation." }));
  assert.equal(text, "Tell me your situation.");
});
