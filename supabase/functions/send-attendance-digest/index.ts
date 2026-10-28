// Supabase Edge Function: send-attendance-digest
// Deploy with: supabase functions deploy send-attendance-digest --no-verify-jwt
// Required Edge Function secrets:
//   CRON_SECRET, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION
// This must target a group ID created/available through Meta's WhatsApp Groups API, not an
// arbitrary pre-existing personal WhatsApp group. The business number must be eligible for Groups API.
import { createClient } from "npm:@supabase/supabase-js@2";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function dateInIndia(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find((value) => value.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function timeInIndia(timestamp: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(new Date(timestamp));
}

function employeeMessage(row: {
  employee_name: string;
  attendance_status: string;
  work_mode: string | null;
  started_at: string | null;
}) {
  const name = row.employee_name.trim() || "Employee";
  if (row.attendance_status === "on_leave") return `"${name}" on leave`;
  if (row.attendance_status === "working" && row.started_at) {
    const mode = row.work_mode === "work_from_home" ? "work from home" : "office";
    return `"${name}" has entered work mode at "${timeInIndia(row.started_at)}" - working from "${mode}"`;
  }
  return `"${name}" has not signed in yet`;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json(405, { error: "Use POST." });

  const expectedSecret = Deno.env.get("CRON_SECRET");
  const suppliedSecret = request.headers.get("x-cron-secret");
  if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
    return json(401, { error: "Unauthorized scheduled attendance request." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION");
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "Supabase Edge Function environment is incomplete." });
  if (!accessToken || !phoneNumberId || !apiVersion) {
    return json(503, { error: "Configure WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_API_VERSION before enabling scheduled delivery." });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const attendanceDate = dateInIndia();
  const { data: rows, error: readError } = await admin.rpc("get_company_attendance_notification_rows", { p_date: attendanceDate });
  if (readError) return json(500, { error: "Could not load the daily attendance snapshot: " + readError.message });

  type NotificationRow = {
    company_id: string;
    company_name: string;
    group_id: string;
    group_name: string;
    user_id: string;
    employee_name: string;
    attendance_status: string;
    work_mode: string | null;
    started_at: string | null;
  };
  const notificationRows = (rows ?? []) as NotificationRow[];
  const byCompany = new Map<string, NotificationRow[]>();
  for (const row of notificationRows) {
    const list = byCompany.get(row.company_id) ?? [];
    list.push(row);
    byCompany.set(row.company_id, list);
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const companyResults: Array<Record<string, unknown>> = [];

  for (const [companyId, companyRows] of byCompany.entries()) {
    const first = companyRows[0];
    const groupId = String(first.group_id ?? "").trim();
    if (!groupId) {
      failed += companyRows.length;
      companyResults.push({ company: first.company_name, error: "Missing WhatsApp Groups API group ID." });
      continue;
    }

    const { data: priorRuns, error: priorError } = await admin
      .from("company_attendance_notification_runs")
      .select("user_id,status")
      .eq("company_id", companyId)
      .eq("attendance_date", attendanceDate);
    if (priorError) {
      failed += companyRows.length;
      companyResults.push({ company: first.company_name, error: "Could not load send history: " + priorError.message });
      continue;
    }
    const statuses = new Map((priorRuns ?? []).map((row) => [row.user_id, row.status]));

    for (const row of companyRows) {
      if (statuses.get(row.user_id) === "sent") { skipped += 1; continue; }
      const message = employeeMessage(row);
      const logBase = { company_id: companyId, attendance_date: attendanceDate, user_id: row.user_id, updated_at: new Date().toISOString() };
      const { error: logError } = await admin.from("company_attendance_notification_runs").upsert(
        { ...logBase, status: "sending", last_error: null },
        { onConflict: "company_id,attendance_date,user_id" },
      );
      if (logError) { failed += 1; continue; }

      try {
        const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "group",
            to: groupId,
            type: "text",
            text: { body: message },
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          const errorText = result?.error?.message ?? `WhatsApp API returned HTTP ${response.status}`;
          await admin.from("company_attendance_notification_runs").update({
            status: "error", last_error: String(errorText).slice(0, 1000), updated_at: new Date().toISOString(),
          }).eq("company_id", companyId).eq("attendance_date", attendanceDate).eq("user_id", row.user_id);
          failed += 1;
          continue;
        }
        await admin.from("company_attendance_notification_runs").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: result?.messages?.[0]?.id ?? null,
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("company_id", companyId).eq("attendance_date", attendanceDate).eq("user_id", row.user_id);
        sent += 1;
      } catch (error) {
        await admin.from("company_attendance_notification_runs").update({
          status: "error",
          last_error: String(error).slice(0, 1000),
          updated_at: new Date().toISOString(),
        }).eq("company_id", companyId).eq("attendance_date", attendanceDate).eq("user_id", row.user_id);
        failed += 1;
      }
    }
    companyResults.push({ company: first.company_name, group: first.group_name, employees: companyRows.length });
  }

  return json(failed > 0 ? 207 : 200, {
    attendance_date: attendanceDate,
    timezone: "Asia/Kolkata",
    sent,
    skipped,
    failed,
    companies: companyResults,
  });
});
