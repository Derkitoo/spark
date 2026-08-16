create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  content text not null default '',
  category text not null default 'Personnel',
  status text not null default 'Capturée',
  problem text not null default '',
  audience text not null default '',
  potential text not null default '',
  next_action text not null default '',
  tags text[] not null default '{}'::text[],
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ideas_user_updated_idx
on public.ideas (user_id, updated_at desc);

alter table public.ideas enable row level security;

create policy "Users can read their own ideas"
on public.ideas for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own ideas"
on public.ideas for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own ideas"
on public.ideas for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own ideas"
on public.ideas for delete
to authenticated
using ((select auth.uid()) = user_id);
