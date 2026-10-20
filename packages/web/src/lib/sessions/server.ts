import { getAdminClient } from "../supabase-admin";
import { bearerToken } from "./model";

/** Resolve the signed-in user id from the Authorization bearer token. */
export async function userFromRequest(req: Request): Promise<{ id: string } | null> {
  const admin = getAdminClient();
  const token = bearerToken(req.headers.get("authorization"));
  if (!admin || !token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
}
