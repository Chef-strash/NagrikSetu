import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../../lib/supabase-admin";
import { userFromRequest } from "../../../../../lib/sessions/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIELDS = [
  "scheme_id", "scheme_name", "beneficiary_name", "target_benefit", "counter_location",
  "counter_hours", "status", "documents_left", "last_activity", "documents",
  "conversation", "chat_session_id"
] as const;

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "Storage not configured." }, { status: 503 });
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!UUID.test(params.id)) return NextResponse.json({ error: "Invalid session id." }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  // Never let a caller overwrite someone else's row: check ownership first.
  const { data: existing } = await admin.from("active_sessions").select("user_id").eq("id", params.id).maybeSingle();
  if (existing && existing.user_id !== user.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const row: Record<string, unknown> = { id: params.id, user_id: user.id };
  for (const key of FIELDS) if (key in body) row[key] = body[key];

  const { error } = await admin.from("active_sessions").upsert(row, { onConflict: "id" });
  if (error) return NextResponse.json({ error: "Could not save session." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "Storage not configured." }, { status: 503 });
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { error } = await admin.from("active_sessions").delete().eq("id", params.id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Could not delete session." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
