-- MATINEX GAMING - Supabase schema
-- Run this once in Supabase Dashboard > SQL Editor.
-- Edge Functions must use the SERVICE ROLE key only on the server.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  price_toman bigint not null default 0 check (price_toman >= 0),
  delivery_note text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null default '',
  customer_email text not null default '',
  order_items jsonb not null default '[]'::jsonb,
  total_toman bigint not null default 0 check (total_toman >= 0),
  status text not null default 'pending'
    check (status in ('pending','paid','cancelled','fulfilled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null default '',
  customer_email text not null default '',
  subject text not null,
  message text not null,
  status text not null default 'open'
    check (status in ('open','in_progress','answered','closed')),
  admin_reply text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_active_idx on public.products (is_active);
create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);
create index if not exists tickets_user_created_idx on public.support_tickets (user_id, created_at desc);

create or replace function public.is_matinex_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_matinex_admin() from public;
grant execute on function public.is_matinex_admin() to anon, authenticated;

alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.support_tickets enable row level security;

drop policy if exists "admins can read admin list" on public.admin_users;
create policy "admins can read admin list" on public.admin_users
for select to authenticated using (public.is_matinex_admin());

drop policy if exists "public can read active products" on public.products;
create policy "public can read active products" on public.products
for select to anon, authenticated using (is_active = true or public.is_matinex_admin());

drop policy if exists "users can read own orders" on public.orders;
create policy "users can read own orders" on public.orders
for select to authenticated using (user_id = (select auth.uid()) or public.is_matinex_admin());

drop policy if exists "users can read own tickets" on public.support_tickets;
create policy "users can read own tickets" on public.support_tickets
for select to authenticated using (user_id = (select auth.uid()) or public.is_matinex_admin());

-- Writes to products, orders and tickets are intentionally performed by
-- authenticated Edge Functions using server-side validation and the service role.
-- Do not add a service-role key to index.html or the browser.
