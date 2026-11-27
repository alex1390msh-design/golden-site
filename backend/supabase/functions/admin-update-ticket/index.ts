import { createClient } from "npm:@supabase/supabase-js@2";

const origin = Deno.env.get("SITE_URL") ?? "https://alex1390msh-design.github.io";
const corsHeaders = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "ابتدا وارد حساب مدیر شو." }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) return json({ error: "تنظیمات سرور کامل نیست." }, 500);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user) return json({ error: "نشست معتبر نیست." }, 401);

  // The service-role client is used only after verifying the caller and checking the admin allow-list.
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: membership, error: membershipError } = await admin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (membershipError) return json({ error: "بررسی سطح دسترسی انجام نشد." }, 500);
  if (!membership) return json({ error: "دسترسی مدیر ندارید." }, 403);

  let body: { ticketId?: unknown; status?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "درخواست نامعتبر است." }, 400);
  }

  if (typeof body.ticketId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.ticketId)) {
    return json({ error: "شناسه تیکت معتبر نیست." }, 400);
  }
  const allowed = ["open", "in_progress", "answered", "closed"];
  if (typeof body.status !== "string" || !allowed.includes(body.status)) {
    return json({ error: "وضعیت انتخاب‌شده معتبر نیست." }, 400);
  }

  const { data: ticket, error } = await admin
    .from("support_tickets")
    .update({ status: body.status })
    .eq("id", body.ticketId)
    .select("id, subject, status, created_at")
    .maybeSingle();

  if (error) return json({ error: "به‌روزرسانی تیکت انجام نشد." }, 500);
  if (!ticket) return json({ error: "تیکت پیدا نشد." }, 404);
  return json({ ticket, message: "وضعیت تیکت به‌روزرسانی شد." });
});
