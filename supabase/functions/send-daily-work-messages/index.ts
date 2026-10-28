// Supabase Edge Function: send-daily-work-messages
// Required secrets: CRON_SECRET, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
// WHATSAPP_API_VERSION, WHATSAPP_DAILY_TEMPLATE_NAME, WHATSAPP_EVENING_TEMPLATE_NAME.
// Each approved Meta template must contain one body placeholder ({{1}}).
import { createClient } from "npm:@supabase/supabase-js@2";

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function indiaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day");
}
function clip(text: string, max = 900) { return text.length <= max ? text : text.slice(0, max - 1) + "…"; }
type DigestRow = {
  company_id: string; company_name: string; user_id: string; employee_name: string;
  phone_e164: string;
  work_items: Array<{ project?: string; stage?: string; task?: string; start_date?: string | null; due_date?: string | null; status?: string }>;
};
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return response(405, { error: "Use POST." });
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected || request.headers.get("x-cron-secret") !== expected) return response(401, { error: "Unauthorized scheduled work message request." });
  const body = await request.json().catch(() => ({})) as { mode?: string };
  const mode = body.mode === "evening_reminder" ? "evening_reminder" : "daily_digest";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION");
  const language = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") || "en";
  const templateName = Deno.env.get(mode === "daily_digest" ? "WHATSAPP_DAILY_TEMPLATE_NAME" : "WHATSAPP_EVENING_TEMPLATE_NAME");
  if (!supabaseUrl || !serviceKey || !token || !phoneNumberId || !apiVersion || !templateName) {
    return response(503, { error: "Configure Supabase, WhatsApp credentials, and the approved template name for this message mode." });
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const date = indiaDate();
  const { data, error } = await admin.rpc("get_company_daily_work_digest", { p_date: date });
  if (error) return response(500, { error: "Could not load assigned work: " + error.message });
  const rows = (data ?? []) as DigestRow[];
  let sent = 0, failed = 0, skipped = 0;
  const results: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const recipient = String(row.phone_e164 ?? "").replace(/\D/g, "");
    if (!recipient) { skipped++; continue; }
    let message: string;
    if (mode === "evening_reminder") {
      message = "Hello " + row.employee_name + ". Please update today's work schedule in Project Hub before signing off. Mark each assigned item as completed, ongoing, or not started. Unfinished work carries forward to tomorrow.";
    } else {
      const items = Array.isArray(row.work_items) ? row.work_items : [];
      const lines = items.length ? items.map((item, index) =>
        String(index + 1) + ". " + (item.project ?? "Project") + " — " + (item.task ?? "Task") + " (" + (item.stage ?? "Stage") + ")" +
        (item.due_date ? " · due " + item.due_date : "") +
        (item.due_date && item.due_date < date ? " · OVERDUE" : "")
      ) : ["No assigned tasks are scheduled or overdue today."];
      message = "Good morning " + row.employee_name + ". Your work list for " + date + ":\n" + lines.join("\n") + "\nPlease update progress in Project Hub as you work.";
    }
    const payload = {
      messaging_product: "whatsapp", recipient_type: "individual", to: recipient, type: "template",
      template: { name: templateName, language: { code: language }, components: [{ type: "body", parameters: [{ type: "text", text: clip(message) }] }] },
    };
    try {
      const sentResponse = await fetch("https://graph.facebook.com/" + apiVersion + "/" + phoneNumberId + "/messages", {
        method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await sentResponse.json().catch(() => ({}));
      if (!sentResponse.ok) { failed++; results.push({ company_id: row.company_id, user_id: row.user_id, status: "error", error: result }); }
      else { sent++; results.push({ company_id: row.company_id, user_id: row.user_id, status: "sent", provider_message_id: result?.messages?.[0]?.id ?? null }); }
    } catch (err) {
      failed++; results.push({ company_id: row.company_id, user_id: row.user_id, status: "error", error: String(err) });
    }
  }
  return response(failed ? 207 : 200, { mode, date, eligible_recipients: rows.length, sent, failed, skipped, results });
});
