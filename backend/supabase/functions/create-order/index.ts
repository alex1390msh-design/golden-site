import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://alex1390msh-design.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "ابتدا وارد حساب شو." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "تنظیمات سرور کامل نیست." }, 500);
  }

  // Verify the customer's JWT with Supabase Auth.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "نشست معتبر نیست؛ دوباره وارد شو." }, 401);

  let body: { items?: Array<{ productId?: string; quantity?: number }> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "درخواست نامعتبر است." }, 400);
  }

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 10) {
    return json({ error: "سبد خرید باید بین ۱ تا ۱۰ محصول داشته باشد." }, 400);
  }

  const quantities = new Map<string, number>();
  for (const item of body.items) {
    if (typeof item.productId !== "string" || !/^[0-9a-f-]{36}$/i.test(item.productId)) {
      return json({ error: "شناسه محصول نامعتبر است." }, 400);
    }
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5) {
      return json({ error: "تعداد هر محصول باید بین ۱ تا ۵ باشد." }, 400);
    }
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + quantity);
  }
  if ([...quantities.values()].some((q) => q > 5)) {
    return json({ error: "حداکثر تعداد هر محصول ۵ عدد است." }, 400);
  }

  // Service-role key stays on the server; never put it in index.html or browser code.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ids = [...quantities.keys()];
  const { data: products, error: productError } = await admin
    .from("products")
    .select("id, name, price_toman")
    .in("id", ids)
    .eq("is_active", true);

  if (productError || !products || products.length !== ids.length) {
    return json({ error: "یک یا چند محصول دیگر در دسترس نیست." }, 400);
  }

  const items = products.map((product) => {
    const quantity = quantities.get(product.id)!;
    const unitPrice = Number(product.price_toman);
    return {
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit_price_toman: unitPrice,
      line_total_toman: unitPrice * quantity,
    };
  });
  const total = items.reduce((sum, item) => sum + item.line_total_toman, 0);
  if (!Number.isSafeInteger(total) || total <= 0) {
    return json({ error: "مبلغ سفارش معتبر نیست." }, 400);
  }

  const orderNumber = "MX-" + crypto.randomUUID().slice(0, 8).toUpperCase();
  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      order_number: orderNumber,
      user_id: userData.user.id,
      total_toman: total,
      status: "pending",
    })
    .select("id, order_number, total_toman, status, created_at")
    .single();

  if (orderError || !order) return json({ error: "ثبت سفارش انجام نشد." }, 500);

  const rows = items.map((item) => ({ ...item, order_id: order.id }));
  const { error: itemsError } = await admin.from("order_items").insert(rows);
  if (itemsError) {
    await admin.from("orders").delete().eq("id", order.id);
    return json({ error: "ذخیره اقلام سفارش انجام نشد." }, 500);
  }

  return json({
    order,
    message: "سفارش با وضعیت در انتظار پرداخت ثبت شد. هنوز هیچ پولی دریافت نشده است.",
  }, 201);
});
