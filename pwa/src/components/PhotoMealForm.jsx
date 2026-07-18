import { useState } from "react";
import { supabase } from "../supabaseClient.js";
import { intakeDate } from "../lib/intakeDate.js";
import { resizeImage } from "../lib/resizeImage.js";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/estimate-meal`;

export default function PhotoMealForm({ onSaved }) {
  const [status, setStatus] = useState("idle"); // idle | estimating | confirm | error
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("estimating");
    try {
      const image = await resizeImage(file);
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ image }),
      });
      if (!resp.ok) { setStatus("error"); return; }
      const est = await resp.json();
      setName(est.items?.map((i) => i.name).join(", ") || "Meal");
      setCalories(String(est.total_calories ?? ""));
      setStatus("confirm");
    } catch {
      setStatus("error");
    }
  }

  async function confirm(e) {
    e.preventDefault();
    const { error } = await supabase.from("meals").insert({
      name,
      calories: Number(calories),
      source: "photo",
      eaten_at: new Date().toISOString(),
      intake_date: intakeDate(),
    });
    if (error) { setStatus("error"); return; }
    setStatus("idle");
    setName("");
    setCalories("");
    onSaved();
  }

  if (status === "confirm") {
    return (
      <form onSubmit={confirm} style={{ display: "flex", gap: 8, margin: "1rem 0", flexWrap: "wrap" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} required
          style={{ flex: 2, minWidth: 120, padding: 8 }} />
        <input type="number" value={calories} onChange={(e) => setCalories(e.target.value)} required
          style={{ flex: 1, minWidth: 90, padding: 8 }} />
        <button type="submit" style={{ padding: 8 }}>Save</button>
        <button type="button" onClick={() => setStatus("idle")} style={{ padding: 8 }}>Cancel</button>
      </form>
    );
  }

  return (
    <div style={{ margin: "1rem 0" }}>
      <label style={{ padding: 8, border: "1px solid #cbd5e1", borderRadius: 4, cursor: "pointer" }}>
        {status === "estimating" ? "Estimating…" : "📷 Photo a meal"}
        <input type="file" accept="image/*" capture="environment" onChange={onPick}
          disabled={status === "estimating"} style={{ display: "none" }} />
      </label>
      {status === "error" && <span style={{ color: "crimson", marginLeft: 8 }}>Estimate failed</span>}
    </div>
  );
}
