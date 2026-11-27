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
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "برای مشاهده سفارش‌ها ابتدا وارد حساب شو." }, 401);
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

  // RLS restricts both orders and nested order_items to this authenticated customer.
  const { data: orders, error } = await client
    .from("orders")
    .select("id, order_number, status, total_toman, created_at, order_items(id, product_name, quantity, unit_price_toman, line_total_toman)")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return json({ error: "دریافت سفارش‌ها انجام نشد." }, 500);
  return json({ orders: orders ?? [] });
});
