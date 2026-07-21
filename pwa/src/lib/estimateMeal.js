import { supabase } from "../supabaseClient.js";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/estimate-meal`;

// Shared by the photo and manual meal forms. `body` is {image} for a first
// photo estimate, {image, items, itemIndex} to re-price one item, or {text} to
// price a written description. Throws on any non-OK response so callers can
// keep their existing estimate on screen.
export async function callEstimate(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const resp = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error("estimate failed");
  return await resp.json();
}
