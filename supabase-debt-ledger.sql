-- Private choir debt ledger. Run in the Supabase SQL Editor before using the ledger.
create extension if not exists pgcrypto;

create table if not exists public.debt_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  source_import_key text unique,
  source_row_number integer check (source_row_number is null or source_row_number > 0),
  source_serial integer,
  source_member_name text not null,
  source_other_name text,
  member_name text not null,
  other_name text,
  source_debt_2025 text,
  source_debt_2026 text,
  source_debt_amount text,
  source_year smallint,
  source_month smallint,
  source_category text,
  source_file_name text,
  source_total text,
  source_notes text,
  review_status text not null default 'needs_review'
    check (review_status in ('needs_review', 'reviewed')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(member_name)) between 1 and 160)
);

create index if not exists debt_ledger_entries_member_name_idx
  on public.debt_ledger_entries (lower(member_name));

create table if not exists public.debt_ledger_obligations (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.debt_ledger_entries(id) on delete restrict,
  title text not null,
  category text not null
    check (category in ('choir_monthly_dues', 'burial_levy', 'wedding_levy', 'other')),
  amount_ngn numeric(12, 2) not null check (amount_ngn > 0),
  period_year smallint check (period_year is null or period_year between 1900 and 2200),
  period_month smallint check (period_month is null or period_month between 1 and 12),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (length(trim(title)) between 1 and 160)
);

alter table public.debt_ledger_obligations
  drop constraint if exists debt_ledger_obligations_category_check,
  add constraint debt_ledger_obligations_category_check
    check (category in ('choir_monthly_dues', 'burial_levy', 'wedding_levy', 'child_dedication_levy', 'other'));

alter table public.debt_ledger_entries
  add column if not exists source_row_number integer check (source_row_number is null or source_row_number > 0),
  add column if not exists source_debt_amount text,
  add column if not exists source_year smallint,
  add column if not exists source_month smallint,
  add column if not exists source_category text,
  add column if not exists source_file_name text;

alter table public.debt_ledger_entries
  drop constraint if exists debt_ledger_entries_source_year_check,
  add constraint debt_ledger_entries_source_year_check
    check (source_year is null or source_year between 1900 and 2200),
  drop constraint if exists debt_ledger_entries_source_month_check,
  add constraint debt_ledger_entries_source_month_check
    check (source_month is null or source_month between 1 and 12);

alter table public.debt_ledger_obligations
  add column if not exists period_year smallint,
  add column if not exists period_month smallint;

alter table public.debt_ledger_obligations
  drop constraint if exists debt_ledger_obligations_period_year_check,
  add constraint debt_ledger_obligations_period_year_check
    check (period_year is null or period_year between 1900 and 2200),
  drop constraint if exists debt_ledger_obligations_period_month_check,
  add constraint debt_ledger_obligations_period_month_check
    check (period_month is null or period_month between 1 and 12);

create index if not exists debt_ledger_obligations_entry_idx
  on public.debt_ledger_obligations (entry_id, created_at);

create table if not exists public.debt_ledger_payments (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.debt_ledger_obligations(id) on delete restrict,
  amount_ngn numeric(12, 2) not null check (amount_ngn > 0),
  reference text,
  paid_at timestamptz not null default now(),
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (reference is null or length(reference) <= 120)
);

create index if not exists debt_ledger_payments_obligation_idx
  on public.debt_ledger_payments (obligation_id, paid_at desc);

create or replace function public.set_debt_ledger_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists debt_ledger_entries_updated_at on public.debt_ledger_entries;
create trigger debt_ledger_entries_updated_at
  before update on public.debt_ledger_entries
  for each row execute function public.set_debt_ledger_updated_at();

create or replace function public.record_debt_ledger_payment(
  p_obligation_id uuid,
  p_amount_ngn numeric,
  p_reference text,
  p_recorded_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_obligation public.debt_ledger_obligations%rowtype;
  existing_paid numeric(12, 2);
  new_total numeric(12, 2);
  payment_id uuid;
begin
  if p_amount_ngn is null or p_amount_ngn <= 0 or p_amount_ngn > 9999999999.99 then
    raise exception using errcode = '22023', message = 'invalid payment amount';
  end if;

  if p_reference is not null and length(p_reference) > 120 then
    raise exception using errcode = '22023', message = 'payment reference is too long';
  end if;

  select *
    into locked_obligation
    from public.debt_ledger_obligations
    where id = p_obligation_id
    for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'obligation not found';
  end if;

  select coalesce(sum(amount_ngn), 0)
    into existing_paid
    from public.debt_ledger_payments
    where obligation_id = p_obligation_id;

  new_total := existing_paid + p_amount_ngn;
  if new_total > locked_obligation.amount_ngn then
    raise exception using errcode = '22023', message = 'payment exceeds outstanding balance';
  end if;

  insert into public.debt_ledger_payments (
    obligation_id,
    amount_ngn,
    reference,
    recorded_by
  )
  values (
    p_obligation_id,
    p_amount_ngn,
    nullif(trim(p_reference), ''),
    p_recorded_by
  )
  returning id into payment_id;

  return jsonb_build_object(
    'payment_id', payment_id,
    'total_paid_ngn', new_total,
    'remaining_ngn', locked_obligation.amount_ngn - new_total
  );
end;
$$;

create or replace function public.create_debt_ledger_record(
  p_member_name text,
  p_other_name text,
  p_title text,
  p_category text,
  p_amount_ngn numeric,
  p_period_year smallint,
  p_period_month smallint,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_entry_id uuid;
begin
  if p_member_name is null or length(trim(p_member_name)) not between 1 and 160
     or p_other_name is not null and length(p_other_name) > 160
     or p_title is null or length(trim(p_title)) not between 1 and 160
     or p_category is null or p_category not in ('choir_monthly_dues', 'burial_levy', 'wedding_levy', 'child_dedication_levy', 'other')
     or p_amount_ngn is null or p_amount_ngn <= 0 or p_amount_ngn > 9999999999.99
     or p_period_year is not null and p_period_year not between 1900 and 2200
     or p_period_month is not null and p_period_month not between 1 and 12 then
    raise exception using errcode = '22023', message = 'invalid debt ledger details';
  end if;

  insert into public.debt_ledger_entries (
    source_member_name,
    source_other_name,
    member_name,
    other_name,
    review_status,
    created_by
  )
  values (
    trim(p_member_name),
    nullif(trim(p_other_name), ''),
    trim(p_member_name),
    nullif(trim(p_other_name), ''),
    'reviewed',
    p_created_by
  )
  returning id into new_entry_id;

  insert into public.debt_ledger_obligations (
    entry_id,
    title,
    category,
    amount_ngn,
    period_year,
    period_month,
    created_by
  )
  values (
    new_entry_id,
    trim(p_title),
    p_category,
    p_amount_ngn,
    p_period_year,
    p_period_month,
    p_created_by
  );

  return new_entry_id;
end;
$$;

create or replace function public.clear_debt_ledger_records()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_payments integer;
  deleted_obligations integer;
  deleted_entries integer;
begin
  delete from public.debt_ledger_payments;
  get diagnostics deleted_payments = row_count;

  delete from public.debt_ledger_obligations;
  get diagnostics deleted_obligations = row_count;

  delete from public.debt_ledger_entries;
  get diagnostics deleted_entries = row_count;

  return jsonb_build_object(
    'payments', deleted_payments,
    'dues_and_levies', deleted_obligations,
    'member_records', deleted_entries
  );
end;
$$;

alter table public.debt_ledger_entries enable row level security;
alter table public.debt_ledger_obligations enable row level security;
alter table public.debt_ledger_payments enable row level security;

revoke all on public.debt_ledger_entries, public.debt_ledger_obligations, public.debt_ledger_payments
  from public, anon, authenticated;
grant select, insert, update on public.debt_ledger_entries to service_role;
grant select, insert on public.debt_ledger_obligations to service_role;
grant select on public.debt_ledger_payments to service_role;
revoke all on function public.record_debt_ledger_payment(uuid, numeric, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_debt_ledger_payment(uuid, numeric, text, uuid)
  to service_role;
revoke all on function public.create_debt_ledger_record(text, text, text, text, numeric, smallint, smallint, uuid)
  from public, anon, authenticated;
grant execute on function public.create_debt_ledger_record(text, text, text, text, numeric, smallint, smallint, uuid)
  to service_role;
revoke all on function public.clear_debt_ledger_records()
  from public, anon, authenticated;
grant execute on function public.clear_debt_ledger_records()
  to service_role;
