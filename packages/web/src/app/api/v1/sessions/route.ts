import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabase-admin";
import { userFromRequest } from "../../../../lib/sessions/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "Storage not configured." }, { status: 503 });
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await admin
    .from("active_sessions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not load sessions." }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}
