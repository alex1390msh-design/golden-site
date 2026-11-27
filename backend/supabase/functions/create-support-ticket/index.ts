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
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "برای ثبت درخواست ابتدا وارد حساب شو." }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return json({ error: "تنظیمات سرور کامل نیست." }, 500);

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return json({ error: "نشست معتبر نیست؛ دوباره وارد شو." }, 401);

  let body: { subject?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "بدنه درخواست معتبر نیست." }, 400);
  }

  if (typeof body.subject !== "string" || typeof body.message !== "string") {
    return json({ error: "عنوان و متن پیام الزامی است." }, 400);
  }

  const subject = body.subject.trim().replace(/\s+/g, " ");
  const message = body.message.trim();
  if (subject.length < 2 || subject.length > 100) {
    return json({ error: "عنوان باید بین ۲ تا ۱۰۰ نویسه باشد." }, 400);
  }
  if (message.length < 5 || message.length > 2000) {
    return json({ error: "متن پیام باید بین ۵ تا ۲۰۰۰ نویسه باشد." }, 400);
  }

  // RLS ensures the authenticated customer can create a ticket only for their own user ID.
  const { data: ticket, error } = await client
    .from("support_tickets")
    .insert({ user_id: auth.user.id, subject, message })
    .select("id, subject, status, created_at")
    .single();

  if (error || !ticket) return json({ error: "ثبت درخواست پشتیبانی انجام نشد." }, 500);
  return json({ ticket, message: "درخواست پشتیبانی ثبت شد." }, 201);
});
