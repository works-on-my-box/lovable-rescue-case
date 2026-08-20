-- TaskFlow schema (run in the Supabase SQL editor). Matches src/lib/backend.supabase.ts.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  done boolean not null default false,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists tasks_created_at_idx on public.tasks (created_at desc);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- Create a profile row automatically for every new auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security: the whole team (any signed-in user) can read and write; anonymous users get nothing.
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.comments enable row level security;

create policy "team can read profiles" on public.profiles for select to authenticated using (true);
create policy "team can read tasks" on public.tasks for select to authenticated using (true);
create policy "team can insert own tasks" on public.tasks for insert to authenticated with check (created_by = auth.uid());
create policy "team can update tasks" on public.tasks for update to authenticated using (true);
create policy "team can read comments" on public.comments for select to authenticated using (true);
create policy "team can insert comments" on public.comments for insert to authenticated with check (true);
