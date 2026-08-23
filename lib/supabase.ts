import { createClient } from "@supabase/supabase-js";

// Server-only client. Uses the service_role key because the `fitness` schema
// has RLS enabled with no policies -- only the service role can read/write it.
// Never import this file from a client component.
export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars. Set them in Vercel project settings."
    );
  }
  return createClient(url, key, {
    db: { schema: "fitness" },
    auth: { persistSession: false },
  });
}
