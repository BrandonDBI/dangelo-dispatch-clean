-- CLEAN SERVER-SIDE VERSION
-- Run this entire script in Supabase SQL Editor.
-- It preserves the existing crew/jobs structure but replaces application login.

create extension if not exists pgcrypto;

drop table if exists public.app_users cascade;

create table public.app_users (
  id bigint generated always as identity primary key,
  email text not null unique,
  password_hash text not null,
  role text not null default 'viewer' check (role in ('supervisor','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Temporary first login:
-- Email: brandon@dangelo-brothers.com
-- Password: ChangeMeNow2026!
insert into public.app_users (email, password_hash, role)
values (
  'brandon@dangelo-brothers.com',
  crypt('ChangeMeNow2026!', gen_salt('bf')),
  'supervisor'
);

-- Recreate schedule tables only if they do not already exist.
create table if not exists public.crew (
  id bigint generated always as identity primary key,
  name text not null unique,
  sort_order integer not null
);

create table if not exists public.jobs (
  id bigint generated always as identity primary key,
  job_name text not null,
  location text,
  customer text,
  notes text,
  start_date date not null,
  end_date date not null,
  color text not null default '#2563eb',
  created_at timestamptz not null default now(),
  constraint valid_date_range check (end_date >= start_date)
);

create table if not exists public.assignments (
  id bigint generated always as identity primary key,
  job_id bigint not null references public.jobs(id) on delete cascade,
  crew_id bigint not null references public.crew(id) on delete cascade,
  unique(job_id, crew_id)
);

insert into public.crew (name, sort_order) values
('Chad',1), ('Nick',2), ('Bernie',3), ('Chava',4), ('Gasper',5),
('Pablo',6), ('Sammy',7), ('Jon',8), ('Remington',9), ('Vactor',10)
on conflict (name) do update set sort_order = excluded.sort_order;

-- Browser access is no longer used. Vercel server routes use the service-role key.
alter table public.app_users enable row level security;
alter table public.crew enable row level security;
alter table public.jobs enable row level security;
alter table public.assignments enable row level security;
