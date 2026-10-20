import { NextResponse } from "next/server";
import { getApprovedReviews, resolveScheme } from "@/lib/feedback/server";
import { validateReview, type ReviewSubmission } from "@/lib/feedback/review-input";
import { getAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/v1/schemes/:slug/reviews?limit=20
// Returns approved, scheme-linked reviews. Never location-filtered.
export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug;
  const requested = Number(new URL(request.url).searchParams.get("limit") || "20");
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 50) : 20;

  const [scheme, reviews] = await Promise.all([
    resolveScheme(slug),
    getApprovedReviews(slug, limit)
  ]);

  return NextResponse.json({
    scheme: scheme ? { slug: scheme.slug, name: scheme.name } : null,
    count: reviews.length,
    reviews
  });
}

// POST /api/v1/schemes/:slug/reviews  { text, author?, role?, counter?, frictionTag?, severityLevel? }
// Validates (length, no PII or links), then saves and publishes the review.
export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  let input: ReviewSubmission;
  try {
    input = (await request.json()) as ReviewSubmission;
  } catch {
    return NextResponse.json({ errors: ["Invalid request."] }, { status: 400 });
  }

  const validation = validateReview(input);
  if (!validation.ok || !validation.value) {
    return NextResponse.json({ errors: validation.errors }, { status: 400 });
  }

  const admin = getAdminClient();
  const scheme = await resolveScheme(params.slug);
  if (!scheme) {
    return NextResponse.json({ errors: ["Scheme not found."] }, { status: 404 });
  }
  if (!admin || !UUID_RE.test(scheme.id)) {
    return NextResponse.json({ errors: ["Reviews can't be saved right now."] }, { status: 503 });
  }

  const v = validation.value;
  const autoPublish = process.env.REVIEWS_AUTO_PUBLISH !== "false";
  const { data, error } = await admin
    .from("peer_intel_reviews")
    .insert({
      scheme_id: scheme.id,
      author: v.author,
      role: v.role,
      counter: v.counter,
      tip: v.text,
      friction_tag: v.frictionTag,
      severity_level: v.severityLevel,
      helpful_count: 0,
      verified_by_moderator: autoPublish
    })
    .select("id, scheme_id, tip, friction_tag, severity_level, helpful_count, created_at")
    .single();

  if (error || !data) {
    console.error(`[reviews] insert failed: ${error?.code ?? "unknown"}`);
    return NextResponse.json({ errors: ["Couldn't save your review. Try again."] }, { status: 502 });
  }

  return NextResponse.json(
    {
      review: {
        id: data.id,
        schemeId: data.scheme_id,
        text: data.tip,
        frictionTag: data.friction_tag,
        severityLevel: data.severity_level,
        helpfulCount: data.helpful_count ?? 0,
        createdAt: data.created_at
      },
      published: autoPublish
    },
    { status: 201 }
  );
}
