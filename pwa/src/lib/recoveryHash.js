// True when the URL hash is Supabase's password-recovery redirect.
//
// Must be read before createClient(): supabase-js strips the hash while it
// processes the session, and it emits PASSWORD_RECOVERY from a setTimeout
// scheduled during construction - early enough that App's onAuthStateChange
// listener can subscribe too late to catch it. Reading the URL doesn't race.
export function isRecoveryHash(hash) {
  return new URLSearchParams(hash.replace(/^#/, "")).get("type") === "recovery";
}
