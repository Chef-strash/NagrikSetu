import { NextResponse } from "next/server";
import { getPublishedFaqs, resolveScheme } from "@/lib/feedback/server";
import { normalizeLang } from "@/lib/feedback/answer";

export const dynamic = "force-dynamic";

// GET /api/v1/schemes/:slug/faqs?lang=en
// Returns published scheme FAQs for one scheme, preferred by language.
export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug;
  const lang = normalizeLang(new URL(request.url).searchParams.get("lang"));

  const [scheme, faqs] = await Promise.all([
    resolveScheme(slug),
    getPublishedFaqs(slug, lang)
  ]);

  return NextResponse.json({
    scheme: scheme ? { slug: scheme.slug, name: scheme.name } : null,
    language: lang,
    count: faqs.length,
    faqs
  });
}
