import { createClient } from "npm:@supabase/supabase-js@2";

const origin = Deno.env.get("SITE_URL") ?? "https://alex1390msh-design.github.io";
const corsHeaders = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "ابتدا وارد حساب مدیر شو." }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "تنظیمات سرور کامل نیست." }, 500);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user) return json({ error: "نشست معتبر نیست." }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: membership, error: membershipError } = await admin
    .from("admin_users").select("user_id").eq("user_id", auth.user.id).maybeSingle();
  if (membershipError) return json({ error: "بررسی دسترسی انجام نشد." }, 500);
  if (!membership) return json({ error: "دسترسی مدیر ندارید." }, 403);

  const { data, error } = await admin.from("orders")
    .select("id, order_number, user_id, status, total_toman, payment_reference, created_at, order_items(id, product_name, quantity, unit_price_toman, line_total_toman)")
    .order("created_at", { ascending: false }).limit(100);
  if (error) return json({ error: "دریافت سفارش‌ها انجام نشد." }, 500);
  return json({ orders: data ?? [] });
});
