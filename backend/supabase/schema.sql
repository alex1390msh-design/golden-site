-- MATINEX GAMING backend starter
-- Run this in a NEW Supabase project's SQL Editor.
-- Amounts are stored as whole Iranian toman. No payment is processed here.

create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  price_toman bigint not null check (price_toman >= 0),
  is_active boolean not null default true,
  delivery_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled', 'fulfilled', 'refunded')),
  total_toman bigint not null check (total_toman >= 0),
  payment_reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity between 1 and 5),
  unit_price_toman bigint not null check (unit_price_toman >= 0),
  line_total_toman bigint not null check (line_total_toman >= 0)
);

create index if not exists orders_user_created_idx
  on public.orders(user_id, created_at desc);
create index if not exists order_items_order_idx
  on public.order_items(order_id);

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Active products are publicly readable" on public.products;
create policy "Active products are publicly readable"
  on public.products for select
  using (is_active = true);

drop policy if exists "Customers can read their own orders" on public.orders;
create policy "Customers can read their own orders"
  on public.orders for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Customers can read their own order items" on public.order_items;
create policy "Customers can read their own order items"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  );

-- No public/client insert or update policies are intentionally provided.
-- Orders must be created by the authenticated Edge Function.
-- Payment status must only be changed by a verified payment callback.
