import { createClient } from "@supabase/supabase-js";
import { isRecoveryHash } from "./lib/recoveryHash.js";

// Read before createClient() below, which consumes and clears the hash.
export const startedInRecovery = isRecoveryHash(window.location.hash);

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — see pwa/.env.local.example"
  );
}

export const supabase = createClient(url, anonKey);
