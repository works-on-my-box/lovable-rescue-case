-- TaskFlow, the demo app from this repo, the way an AI app builder tends to grow it
-- once "one team" becomes "many projects". RLS is switched on everywhere: that part
-- the builders get right. The policies are the problem.
-- Policy names are the ones you will recognise from the Supabase dashboard templates.

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.projects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'member')),
  primary key (project_id, user_id)
);

create table public.tasks (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title      text not null check (length(trim(title)) > 0),
  done       boolean not null default false,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index tasks_created_at_idx on public.tasks (created_at desc);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  author_id  uuid not null references public.profiles (id),
  body       text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks           enable row level security;
alter table public.comments        enable row level security;

create policy "Enable read access for all users"
  on public.profiles for select using (true);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Enable read access for all users"
  on public.projects for select using (true);
create policy "Enable insert for authenticated users only"
  on public.projects for insert to authenticated with check (true);
create policy "Owners can update projects"
  on public.projects for update using (auth.uid() = owner_id);

create policy "Enable read access for all users"
  on public.project_members for select using (true);
create policy "Enable insert for authenticated users only"
  on public.project_members for insert to authenticated with check (true);

create policy "Team can read tasks"
  on public.tasks for select to authenticated using (true);
create policy "Team can insert own tasks"
  on public.tasks for insert to authenticated with check (created_by = auth.uid());
create policy "Team can update tasks"
  on public.tasks for update to authenticated using (true);
create policy "Team can delete own tasks"
  on public.tasks for delete to authenticated using (created_by = auth.uid());

create policy "Enable all for authenticated users"
  on public.comments for all to authenticated using (true) with check (true);
