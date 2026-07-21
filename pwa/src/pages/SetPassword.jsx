import { useState } from "react";
import { supabase } from "../supabaseClient.js";
import { input, buttonPrimary, button, textSecondary } from "../styles/ui.js";

// Sets a password on the current session via updateUser. Used in two places:
// App's recovery screen (when it catches PASSWORD_RECOVERY), and Settings.
// The Settings copy is the reliable path - PASSWORD_RECOVERY fires from a
// setTimeout scheduled at client construction, so App's listener can miss it
// and drop you on the dashboard with a recovery session and no way to set a
// password. Any signed-in session can set one from Settings instead.
// onDone is optional; without it the "Continue" link is omitted.
export default function SetPassword({ onDone }) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(null); // null | "error" | "saved"
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    setStatus(error ? "error" : "saved");
  }

  return (
    <form onSubmit={save} style={{ maxWidth: 320, margin: "4rem auto" }}>
      <h1>Set a password</h1>
      <input
        type="password" required minLength={8} autoComplete="new-password"
        placeholder="New password (8+ characters)"
        value={password} onChange={(e) => setPassword(e.target.value)}
        style={{ ...input, width: "100%", marginBottom: 8, boxSizing: "border-box" }}
      />
      <button type="submit" disabled={busy} style={{ ...buttonPrimary, width: "100%" }}>
        {busy ? "Saving…" : "Save password"}
      </button>
      {status === "saved" && (
        <p style={textSecondary}>
          Password saved.{" "}
          {onDone && (
            <button type="button" onClick={onDone}
              style={{ ...button, background: "none", border: "none", color: "var(--accent)", padding: 0 }}>
              Continue
            </button>
          )}
        </p>
      )}
      {status === "error" && <p style={{ color: "var(--state-over-fg)" }}>Couldn’t save — try again.</p>}
    </form>
  );
}
