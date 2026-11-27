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

  let body: { id?: unknown; slug?: unknown; name?: unknown; price_toman?: unknown; is_active?: unknown; delivery_note?: unknown };
  try { body = await req.json(); } catch { return json({ error: "درخواست نامعتبر است." }, 400); }

  if (typeof body.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug) || body.slug.length > 80) {
    return json({ error: "شناسه محصول باید انگلیسی و با خط تیره باشد." }, 400);
  }
  if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 120) {
    return json({ error: "نام محصول باید بین ۲ تا ۱۲۰ نویسه باشد." }, 400);
  }
  const price = Number(body.price_toman);
  if (!Number.isSafeInteger(price) || price < 0 || price > 100000000000) {
    return json({ error: "قیمت به تومان معتبر نیست." }, 400);
  }
  if (body.is_active !== undefined && typeof body.is_active !== "boolean") {
    return json({ error: "وضعیت فعال/غیرفعال معتبر نیست." }, 400);
  }
  if (body.delivery_note !== undefined && (typeof body.delivery_note !== "string" || body.delivery_note.length > 1000)) {
    return json({ error: "یادداشت تحویل حداکثر ۱۰۰۰ نویسه است." }, 400);
  }

  const record = {
    slug: body.slug,
    name: body.name.trim(),
    price_toman: price,
    is_active: body.is_active ?? true,
    delivery_note: typeof body.delivery_note === "string" ? body.delivery_note.trim() : null,
  };

  let query;
  if (typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id)) {
    query = await admin.from("products").update(record).eq("id", body.id)
      .select("id, slug, name, price_toman, is_active, delivery_note").maybeSingle();
  } else if (body.id !== undefined) {
    return json({ error: "شناسه محصول معتبر نیست." }, 400);
  } else {
    query = await admin.from("products").insert(record)
      .select("id, slug, name, price_toman, is_active, delivery_note").single();
  }
  if (query.error) return json({ error: "ذخیره محصول انجام نشد؛ شناسه تکراری یا خطای پایگاه داده را بررسی کن." }, 400);
  if (!query.data) return json({ error: "محصول پیدا نشد." }, 404);
  return json({ product: query.data, message: "محصول ذخیره شد." });
});
