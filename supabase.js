import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://buvaczwcigqzprltroqi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BknahLG-zgL9EpCdE4A2jQ_Ull29Grx";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

window.ROOMHUNT_SUPABASE_URL = SUPABASE_URL;
window.ROOMHUNT_SUPABASE_KEY = SUPABASE_PUBLISHABLE_KEY;
window.supabaseClient = supabase;

// Public client only. Database/storage security must be enforced with Supabase RLS policies.
