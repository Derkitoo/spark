import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://nwjiiuyefxbvpyytnhah.supabase.co",
  "sb_publishable_KFUNLb1SlBwtXmmc0K2Tyg_AQmQqge6",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
