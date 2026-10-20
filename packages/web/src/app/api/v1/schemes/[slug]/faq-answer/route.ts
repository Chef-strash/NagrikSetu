import { NextResponse } from "next/server";
import { answerFaqQuestion, resolveScheme } from "@/lib/feedback/server";
import { normalizeLang } from "@/lib/feedback/answer";

export const dynamic = "force-dynamic";

// POST /api/v1/schemes/:slug/faq-answer
// Body: { question: string, lang?: string }
// Retrieves matching maintained FAQs and returns a grounded answer + references.
// The question is a retrieval query only; it is never stored as an FAQ.
export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const raw = (body ?? {}) as { question?: unknown; lang?: unknown };
  const question = typeof raw.question === "string" ? raw.question.trim() : "";
  const lang = normalizeLang(typeof raw.lang === "string" ? raw.lang : null);

  if (question.length < 3) {
    return NextResponse.json(
      { error: "Please enter a question of at least 3 characters." },
      { status: 400 }
    );
  }
  if (question.length > 300) {
    return NextResponse.json(
      { error: "Question is too long. Keep it under 300 characters." },
      { status: 400 }
    );
  }

  const scheme = await resolveScheme(slug);
  if (!scheme) {
    return NextResponse.json({ error: "Scheme not found." }, { status: 404 });
  }

  const result = await answerFaqQuestion(slug, question, lang);
  return NextResponse.json({ scheme: { slug: scheme.slug, name: scheme.name }, language: lang, ...result });
}
