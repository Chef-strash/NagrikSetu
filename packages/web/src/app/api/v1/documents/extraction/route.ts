import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { handleExtractionSave } from "@/lib/documents/storage";

export const dynamic = "force-dynamic";

// POST /api/v1/documents/extraction  (Bearer user token)
// Stores the MASKED extraction metadata (service-role only table). Best effort.
export async function POST(request: Request) {
  const admin = getAdminClient();
  if (!admin) return new NextResponse(null, { status: 204 });
  const result = await handleExtractionSave(request, {
    getUser: async (token) => {
      const { data, error } = await admin.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    insert: async (table, row) => admin.from(table).insert(row)
  });
  return NextResponse.json(result.body ?? {}, { status: result.status });
}
