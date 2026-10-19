// Server entrypoint.
// Run:  npm run dev   (watch)  |  npm start  (once)
// The app itself lives in app.ts so tests can import it without listening.

import { createApp } from "./app.ts";
import { getSettings, hasAdminAccess, hasAnonAccess } from "./core/config.ts";

const settings = getSettings();
const app = createApp();

app.listen(settings.port, () => {
  const source = hasAnonAccess(settings)
    ? "Supabase (anon, RLS)"
    : hasAdminAccess(settings)
      ? "Supabase (service role)"
      : "offline fixtures";
  console.log(`NagrikSetu backend listening on http://127.0.0.1:${settings.port}`);
  console.log(`Data source: ${source}`);
});