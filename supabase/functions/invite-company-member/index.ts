// Required Edge Function secrets:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (provided by Supabase)
//   RESEND_API_KEY, INVITE_FROM_EMAIL (a verified sender), APP_URL (e.g. https://project-hub-starter.vercel.app)
// Deploy with: supabase functions deploy invite-company-member
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char] ?? char));
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond(405, { error: "Use POST." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("INVITE_FROM_EMAIL");
  const appUrl = Deno.env.get("APP_URL");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return respond(500, { error: "Supabase function environment is incomplete." });
  if (!resendKey || !fromEmail || !appUrl) return respond(500, { error: "Configure RESEND_API_KEY, INVITE_FROM_EMAIL, and APP_URL in Edge Function secrets before sending company invitations." });

  const authorization = request.headers.get("Authorization");
  if (!authorization) return respond(401, { error: "Sign in as a company admin to send an invitation." });
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData.user) return respond(401, { error: "Your session is not valid. Sign in again." });

  let payload: { company_id?: string; email?: string; role?: string };
  try { payload = await request.json(); } catch { return respond(400, { error: "Invalid JSON body." }); }
  const companyId = String(payload.company_id ?? "");
  const email = String(payload.email ?? "").trim().toLowerCase();
  const role = payload.role === "admin" ? "admin" : payload.role === "employee" ? "employee" : "";
  if (!companyId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !role) return respond(400, { error: "Provide a company, valid email, and Admin or Employee role." });

  const { data: membership, error: memberError } = await adminClient
    .from("company_members").select("role").eq("company_id", companyId).eq("user_id", authData.user.id).maybeSingle();
  if (memberError || membership?.role !== "admin") return respond(403, { error: "Only company admins can send invitations." });

  const { data: company, error: companyError } = await adminClient
    .from("companies").select("id,name,slug").eq("id", companyId).single();
  if (companyError || !company) return respond(404, { error: "Company not found." });

  const configuredApp = new URL(appUrl);
  const redirectTo = new URL("/", configuredApp.origin);
  redirectTo.searchParams.set("company", company.slug);
  const invitationEmail = escapeHtml(email);
  const companyName = escapeHtml(company.name);
  const roleName = role === "admin" ? "company admin" : "employee";

  const { error: invitationError } = await adminClient.from("company_invitations").upsert({
    company_id: company.id, email, role, invited_by: authData.user.id, accepted_by: null, accepted_at: null, created_at: new Date().toISOString()
  }, { onConflict: "company_id,email" });
  if (invitationError) return respond(500, { error: "Could not save invitation: " + invitationError.message });

  let actionLink = "";
  let linkType: "invite" | "magiclink" = "invite";
  const invitation = await adminClient.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: redirectTo.toString(), data: { company_id: company.id, company_role: role } },
  });
  if (!invitation.error && invitation.data.properties?.action_link) {
    actionLink = invitation.data.properties.action_link;
  } else {
    // Existing accounts cannot be re-invited as new users; email a secure sign-in link instead.
    const magic = await adminClient.auth.admin.generateLink({
      type: "magiclink", email, options: { redirectTo: redirectTo.toString() },
    });
    if (magic.error || !magic.data.properties?.action_link) {
      await adminClient.from("company_invitations").delete().eq("company_id", company.id).eq("email", email).eq("invited_by", authData.user.id);
      return respond(400, { error: magic.error?.message ?? invitation.error?.message ?? "Could not generate a secure invitation link." });
    }
    actionLink = magic.data.properties.action_link;
    linkType = "magiclink";
  }

  const subject = `Invitation to ${company.name} Project Hub`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#202938"><h1>${companyName} Project Hub</h1><p>You have been invited to join <strong>${companyName}</strong> as a ${roleName}.</p><p>The company profile includes project names, stage schedules and deadlines, team assignments, and company information. Your access to individual project details remains controlled separately by project membership.</p><p style="margin:28px 0"><a href="${escapeHtml(actionLink)}" style="background:#e77727;color:#fff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700">Accept invitation</a></p><p>If the button does not work, paste this link into your browser:</p><p style="word-break:break-all">${escapeHtml(actionLink)}</p><p style="color:#687385;font-size:12px">This invitation is for ${invitationEmail}. If you were not expecting it, you can ignore this email.</p></div>`;

  const mail = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromEmail, to: [email], subject, html }),
  });
  if (!mail.ok) {
    const details = await mail.text();
    return respond(502, { error: "Invitation record was saved but email delivery failed. Check Resend sender/domain configuration. " + details.slice(0, 300) });
  }

  return respond(200, {
    success: true,
    link_type: linkType,
    message: `Invitation email sent to ${email} as ${roleName}.`,
  });
});