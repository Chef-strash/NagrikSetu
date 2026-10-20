import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/v1/reviews/:id/helpful -> { helpfulCount }
// Adds one "helpful" vote. One vote per browser is enforced in the UI.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  // Atomic path: DB function upvote_peer_review(review_id) when it exists.
  const rpc = await admin.rpc("upvote_peer_review", { review_id: params.id });
  if (!rpc.error && rpc.data !== null && rpc.data !== undefined) {
    const count = Array.isArray(rpc.data) ? (rpc.data[0]?.helpful_count ?? rpc.data[0]) : (rpc.data as { helpful_count?: number }).helpful_count ?? rpc.data;
    if (typeof count === "number") return NextResponse.json({ helpfulCount: count });
  }

  const { data: current, error: readError } = await admin
    .from("peer_intel_reviews")
    .select("helpful_count")
    .eq("id", params.id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: "failed" }, { status: 502 });
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const next = (current.helpful_count ?? 0) + 1;
  const { error } = await admin.from("peer_intel_reviews").update({ helpful_count: next }).eq("id", params.id);
  if (error) return NextResponse.json({ error: "failed" }, { status: 502 });

  return NextResponse.json({ helpfulCount: next });
}
