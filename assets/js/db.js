import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const isConfigured = () =>
  SUPABASE_URL.includes("YOUR_PROJECT") === false &&
  SUPABASE_ANON_KEY.includes("YOUR_ANON") === false;
