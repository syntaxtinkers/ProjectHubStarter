// Leave request WhatsApp notification handler.
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Use POST", { status: 405 });
  return new Response(JSON.stringify({ ok: false, message: "Notification handler requires WhatsApp configuration." }), { headers: { "Content-Type": "application/json" } });
});
