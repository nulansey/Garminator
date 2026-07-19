import { useState } from "react";
import { supabase } from "../supabaseClient.js";
import { input, buttonPrimary } from "../styles/ui.js";

export default function WeightForm({ onSaved }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setError(false);
    setSaving(true);
    const { error } = await supabase
      .from("weights")
      .insert({ weight: Number(value), measured_at: new Date().toISOString() });
    setSaving(false);
    if (error) {
      setError(true); // keep the typed value so it isn't re-entered
    } else {
      setValue("");
      onSaved();
    }
  }

  return (
    <form onSubmit={save} style={{ display: "flex", gap: 8, margin: "1rem 0" }}>
      <input
        type="number"
        step="0.1"
        required
        placeholder="Weight (lb)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ ...input, flex: 1 }}
      />
      <button type="submit" disabled={saving} style={buttonPrimary}>
        {saving ? "Saving…" : "Log weight"}
      </button>
      {error && <span style={{ color: "var(--state-over-fg)" }}>Save failed</span>}
    </form>
  );
}
