-- ContenedorApp: tabla `pallets` para guardar trabajos del Armador de pallets.
-- Mirror de `shipments` (Container Loader) pero específico para pallets.
-- Aplicar desde el SQL editor de Supabase.

create table if not exists public.pallets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  name        text not null,
  payload     jsonb not null,            -- { v, palletType, maxHeight, products, results, notes }
  status      text not null default 'preparacion',
  tracking_url text,                     -- link de seguimiento externo (opcional)
  notes       text default '',
  is_public   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists pallets_user_id_idx       on public.pallets(user_id);
create index if not exists pallets_created_at_idx    on public.pallets(created_at desc);
create index if not exists pallets_user_name_lower_idx on public.pallets(user_id, lower(name));

-- RLS: cada usuario ve y maneja sólo sus pallets.
alter table public.pallets enable row level security;

drop policy if exists "pallets owner all" on public.pallets;
create policy "pallets owner all" on public.pallets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Lectura pública para pallets compartidos (is_public = true).
drop policy if exists "pallets public read" on public.pallets;
create policy "pallets public read" on public.pallets
  for select
  using (is_public = true);

-- Trigger para updated_at.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists pallets_set_updated_at on public.pallets;
create trigger pallets_set_updated_at
  before update on public.pallets
  for each row execute function public.set_updated_at();
