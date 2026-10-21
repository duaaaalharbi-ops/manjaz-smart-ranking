-- M-Fair 1.0: Independent database schema for Manjaz Smart Ranking.
-- Applies ONLY to Supabase project ayinxhdmojmtgycwqmah.
-- No tables or functions from the existing Manjaz production project are referenced.

create table if not exists public.mfair_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.mfair_teachers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 180),
  employee_rank text not null default 'غير محدد',
  original_weekly_load smallint not null default 0 check (original_weekly_load between 0 and 40),
  active boolean not null default true,
  source_tag text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mfair_teacher_active_name_uidx
on public.mfair_teachers (full_name) where active = true;

create table if not exists public.mfair_schedules (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.mfair_teachers(id) on delete cascade,
  day_key text not null check (day_key in ('sun','mon','tue','wed','thu')),
  period smallint not null check (period between 1 and 7),
  class_name text not null default '',
  activity boolean not null default false,
  created_at timestamptz not null default now(),
  unique (teacher_id,day_key,period)
);

create table if not exists public.mfair_exclusions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.mfair_teachers(id) on delete cascade,
  rule_type text not null check (rule_type in ('hard','conditional','priority')),
  rule_code text not null check (length(btrim(rule_code)) between 2 and 80),
  reason text not null default '',
  rule_details jsonb not null default '{}'::jsonb check (jsonb_typeof(rule_details)='object'),
  start_date date,
  end_date date,
  active boolean not null default true,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists mfair_exclusions_teacher_idx on public.mfair_exclusions(teacher_id,active);

create table if not exists public.mfair_absences (
  id uuid primary key default gen_random_uuid(),
  absent_teacher_id uuid not null references public.mfair_teachers(id) on delete restrict,
  absence_date date not null,
  status text not null default 'active' check (status in ('active','cancelled')),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (absent_teacher_id,absence_date)
);

create table if not exists public.mfair_assignments (
  id uuid primary key default gen_random_uuid(),
  assignment_date date not null,
  period smallint not null check (period between 1 and 7),
  class_name text not null check (char_length(btrim(class_name)) between 1 and 80),
  absent_teacher_id uuid not null references public.mfair_teachers(id) on delete restrict,
  assigned_teacher_id uuid references public.mfair_teachers(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','approved','cancelled')),
  source text not null default 'manual' check (source in ('manual','smart','import')),
  rationale jsonb not null default '{}'::jsonb check (jsonb_typeof(rationale)='object'),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (assigned_teacher_id is distinct from absent_teacher_id),
  check (status <> 'approved' or (assigned_teacher_id is not null and approved_by is not null and approved_at is not null))
);

create unique index if not exists mfair_unique_class_period_active
on public.mfair_assignments (assignment_date,period,class_name)
where status in ('draft','approved');

create unique index if not exists mfair_unique_teacher_period_active
on public.mfair_assignments (assignment_date,period,assigned_teacher_id)
where status in ('draft','approved') and assigned_teacher_id is not null;

create index if not exists mfair_assignments_date_idx on public.mfair_assignments (assignment_date,status);

create table if not exists public.mfair_settings (
  setting_key text primary key check (char_length(btrim(setting_key)) between 2 and 100),
  setting_value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.mfair_simulations (
  id uuid primary key default gen_random_uuid(),
  simulation_date date not null,
  input_data jsonb not null default '{}'::jsonb,
  result_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.mfair_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict default auth.uid(),
  event_type text not null check (char_length(btrim(event_type)) between 3 and 100),
  entity_type text not null default '',
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Defense in depth: RLS on every exposed table. Nobody receives access via a
-- public/anonymous API key. Membership is provisioned explicitly by an owner.
alter table public.mfair_members enable row level security;
alter table public.mfair_teachers enable row level security;
alter table public.mfair_schedules enable row level security;
alter table public.mfair_exclusions enable row level security;
alter table public.mfair_absences enable row level security;
alter table public.mfair_assignments enable row level security;
alter table public.mfair_settings enable row level security;
alter table public.mfair_simulations enable row level security;
alter table public.mfair_audit_logs enable row level security;

create policy mfair_members_self_read on public.mfair_members
for select to authenticated using (user_id = (select auth.uid()));

-- Admin predicate is evaluated through the member's own readable row.
create policy mfair_teachers_admin on public.mfair_teachers for all to authenticated
using (exists(select 1 from public.mfair_members m where m.user_id=(select auth.uid()) and m.role='admin'))
with check (exists(select 1 from public.mfair_members m where m.user_id=(select auth.uid()) and m.role='admin'));
create policy mfair_schedules_admin on public.mfair_schedules for all to authenticated
using (exists(select 1 from public.mfair_members m where m.user_id=(select auth.uid()) and m.role='admin'))
with check (exists(select 1 from public.mfair_members m where m.user_id=(select auth.uid()) and m.role='admin'));
create policy mfair_exclusions_admin on public.mfair_exclusions for all to authenticated
using (exists(select 1 from public.mfair_members m where m.user_id=(select auth.uid()) and m.role='admin'))
with check (exists(select 1 from public.mfair_members m where m.user_id=(select auth.uid()) and m.role='admin'));
create policy mfair_absences_admin on public.mfair_absences for all to authenticated
using (exists(select 1 from public.mfair_members m where m.user_id=(select auth.uid()) and m.role='admin'))
with check (exists(select 1 from public.mfair_members m where m.user_id=(select auth.uid()) and m.role='admin'));
create policy mfair_assignments_admin on public.mfair_assignments for all to authenticated
using (exists(select 1 from public.mfair_members m where m.user_id=(select auth.uid()) and m.role='admin'))
with check (exists(select 1 from public.mfair_members m where m.user_id=(select auth.uid()) and m.role='admin'));
create policy mfair_settings_admin on public.mfair_settings for all to authenticated
using (exists(select 1 from public.mfair_members m where m.user_id=(select auth.uid()) and m.role='admin'))
with check (exists(select 1 from public.mfair_members m where m.user_id=(select auth.uid()) and m.role='admin'));
create policy mfair_simulations_admin on public.mfair_simulations for all to authenticated
using (exists(select 1 from public.mfair_members m where m.user_id=(select auth.uid()) and m.role='admin'))
with check (exists(select 1 from public.mfair_members m where m.user_id=(select auth.uid()) and m.role='admin'));

-- Audit trail is append-only through the application.
create policy mfair_audit_admin_read on public.mfair_audit_logs for select to authenticated
using (exists(select 1 from public.mfair_members m where m.user_id=(select auth.uid()) and m.role='admin'));
create policy mfair_audit_admin_insert on public.mfair_audit_logs for insert to authenticated
with check (actor_id=(select auth.uid()) and exists(select 1 from public.mfair_members m where m.user_id=(select auth.uid()) and m.role='admin'));

revoke all on table public.mfair_members,public.mfair_teachers,public.mfair_schedules,
 public.mfair_exclusions,public.mfair_absences,public.mfair_assignments,
 public.mfair_settings,public.mfair_simulations,public.mfair_audit_logs
 from public,anon,authenticated;
grant select on public.mfair_members to authenticated;
grant select,insert,update,delete on public.mfair_teachers,public.mfair_schedules,
 public.mfair_exclusions,public.mfair_absences,public.mfair_assignments,
 public.mfair_settings,public.mfair_simulations to authenticated;
grant select,insert on public.mfair_audit_logs to authenticated;

comment on table public.mfair_members is 'M-Fair: admin access is granted only by explicitly inserting an existing auth user ID.';
comment on table public.mfair_assignments is 'M-Fair: independent assignments; never linked to Manjaz production reserve.';
