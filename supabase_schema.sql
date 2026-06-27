-- Deka Electronics — Store Manager
-- Run this once in your Supabase project's SQL editor (Database > SQL Editor > New query).
-- Safe to re-run: every statement is "create if not exists" / "or replace".

-- ───────────────────────── PRODUCTS ─────────────────────────
create table if not exists products (
  id            text primary key,
  brand         text not null,
  category      text not null,
  model         text,
  stars         text,
  "mfgYear"     text,
  name          text not null,
  "purchasePrice" numeric not null default 0,
  "sellingPrice"  numeric not null default 0,
  quantity      numeric not null default 0,
  unit          text default 'pcs',
  "minStock"    numeric default 0,
  "dateAdded"   timestamptz default now()
);

-- ───────────────────────── SALES (append-only) ─────────────────────────
create table if not exists sales (
  id              text primary key,
  "invoiceNo"     text not null,
  date            timestamptz not null default now(),
  "customerName"  text,
  "customerPhone" text,
  items           jsonb not null default '[]',
  subtotal        numeric not null default 0,
  discount        numeric not null default 0,
  total           numeric not null default 0,
  "paymentMode"   text
);

-- ───────────────────── STOCK / PURCHASE LOG (append-only) ─────────────────────
create table if not exists stock_log (
  id                      text primary key,
  date                    timestamptz not null default now(),
  "productId"             text,
  "productName"           text,
  category                text,
  brand                   text,
  "qtyAdded"              numeric,
  "qtyBefore"             numeric,
  "qtyAfter"              numeric,
  "purchasePriceBefore"   numeric,
  "purchasePriceAfter"    numeric,
  "sellingPriceBefore"    numeric,
  "sellingPriceAfter"     numeric,
  "supplierName"          text,
  "supplierPhone"         text,
  "invoiceNo"             text,
  note                    text
);

-- ───────────────────── ATOMIC INVOICE NUMBERING ─────────────────────
-- A single-row counter plus a function that increments it inside one
-- transaction, so two staff billing at the exact same moment never get
-- the same invoice number.
create table if not exists invoice_counter (
  id  int primary key default 1,
  seq int not null default 0
);
insert into invoice_counter (id, seq) values (1, 0) on conflict (id) do nothing;

create or replace function next_invoice_seq()
returns int
language plpgsql
as $$
declare
  next_val int;
begin
  update invoice_counter set seq = seq + 1 where id = 1 returning seq into next_val;
  return next_val;
end;
$$;

-- ───────────────────── ROW LEVEL SECURITY ─────────────────────
-- Only logged-in staff (any account you create in Authentication > Users)
-- can read or write. Anonymous / public access is blocked entirely.
alter table products        enable row level security;
alter table sales           enable row level security;
alter table stock_log       enable row level security;
alter table invoice_counter enable row level security;

drop policy if exists "staff full access" on products;
create policy "staff full access" on products
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "staff full access" on sales;
create policy "staff full access" on sales
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "staff full access" on stock_log;
create policy "staff full access" on stock_log
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "staff full access" on invoice_counter;
create policy "staff full access" on invoice_counter
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant execute on function next_invoice_seq to authenticated;

-- ───────────────────── REALTIME (optional but recommended) ─────────────────────
-- Lets every staff device see changes from other devices live, without a refresh.
-- After running this file, also go to Database > Replication in the dashboard
-- and make sure products / sales / stock_log are toggled ON for Realtime —
-- the UI for this has moved around between Supabase versions, so if you don't
-- see a toggle there, search the dashboard for "Realtime" and enable these
-- three tables from wherever it's listed.
