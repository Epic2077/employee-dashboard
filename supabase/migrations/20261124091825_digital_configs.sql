-- Digital services: V2Ray subscriptions provisioned on the 3x-ui panel.
-- One config per employee by default; managers can raise a teammate's quota and
-- the owner is unlimited and may attach a config to any (or all) inbounds.

-- ---------------------------------------------------------------------------
-- 1. capability
-- ---------------------------------------------------------------------------
alter table public.role_permissions
  drop constraint if exists role_permissions_capability_check;

alter table public.role_permissions
  add constraint role_permissions_capability_check
  check (capability in (
    'reports.lunch',
    'reports.services',
    'users.view',
    'menu.manage',
    'lunch.manage',
    'services.manage',
    'users.manage',
    'permissions.manage',
    'teams.manage',
    'digital.manage'
  ));

insert into public.role_permissions (role, capability, scope) values
  ('manager', 'digital.manage', 'team'),
  ('admin', 'digital.manage', 'all'),
  ('owner', 'digital.manage', 'all')
on conflict (role, capability) do nothing;

-- ---------------------------------------------------------------------------
-- 2. settings + quotas
-- ---------------------------------------------------------------------------
create table if not exists public.digital_settings (
  id smallint primary key default 1 check (id = 1),
  self_service_enabled boolean not null default true,
  default_inbound_ids integer[] not null default '{}',
  manager_quota_cap smallint not null default 5
    check (manager_quota_cap between 1 and 99),
  sub_base_url text,
  updated_at timestamptz not null default now()
);

comment on table public.digital_settings is
  'Panel defaults for digital services: default nodes, self-service flag, quota cap.';

insert into public.digital_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.v2ray_quotas (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  max_configs smallint not null default 1 check (max_configs between 1 and 99),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.v2ray_quotas is
  'How many V2Ray configs a user may own (default 1, managers can raise it).';

-- ---------------------------------------------------------------------------
-- 3. configs
-- ---------------------------------------------------------------------------
create table if not exists public.v2ray_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null,
  client_id text not null,
  sub_id text not null,
  email text not null,
  inbound_ids integer[] not null default '{}',
  status text not null default 'active'
    check (status in ('active', 'revoked', 'error')),
  traffic_limit_gb integer
    check (traffic_limit_gb is null or traffic_limit_gb > 0),
  expires_on date,
  error_message text,
  created_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, email)
);

create index if not exists v2ray_configs_user_idx
  on public.v2ray_configs (user_id, status);
create index if not exists v2ray_configs_status_idx
  on public.v2ray_configs (status);

comment on table public.v2ray_configs is
  'One row per panel client. Multiple rows per user when their quota allows.';

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
alter table public.digital_settings enable row level security;
alter table public.v2ray_quotas enable row level security;
alter table public.v2ray_configs enable row level security;

revoke all on table public.digital_settings from anon;
revoke all on table public.v2ray_quotas from anon;
revoke all on table public.v2ray_configs from anon;

grant select, insert, update, delete on table public.digital_settings
  to authenticated;
grant select, insert, update, delete on table public.v2ray_quotas
  to authenticated;
-- Writes to configs always go through the server (panel secrets), so only
-- SELECT is granted here.
grant select on table public.v2ray_configs to authenticated;

drop policy if exists "digital_settings_select_authenticated" on public.digital_settings;
create policy "digital_settings_select_authenticated"
on public.digital_settings for select to authenticated using (true);

drop policy if exists "digital_settings_write_manager" on public.digital_settings;
create policy "digital_settings_write_manager"
on public.digital_settings for all to authenticated
using (public.has_full_capability('digital.manage'))
with check (public.has_full_capability('digital.manage'));

drop policy if exists "v2ray_quotas_select_scoped" on public.v2ray_quotas;
create policy "v2ray_quotas_select_scoped"
on public.v2ray_quotas for select to authenticated
using (
  user_id = (select auth.uid())
  or public.can_view_user(user_id, 'digital.manage')
);

drop policy if exists "v2ray_quotas_write_scoped" on public.v2ray_quotas;
create policy "v2ray_quotas_write_scoped"
on public.v2ray_quotas for all to authenticated
using (public.can_view_user(user_id, 'digital.manage'))
with check (public.can_view_user(user_id, 'digital.manage'));

drop policy if exists "v2ray_configs_select_scoped" on public.v2ray_configs;
create policy "v2ray_configs_select_scoped"
on public.v2ray_configs for select to authenticated
using (
  user_id = (select auth.uid())
  or public.can_view_user(user_id, 'digital.manage')
);

-- ---------------------------------------------------------------------------
-- 5. triggers
-- ---------------------------------------------------------------------------
drop trigger if exists digital_settings_touch_updated_at on public.digital_settings;
create trigger digital_settings_touch_updated_at
before update on public.digital_settings
for each row execute function public.touch_updated_at();

drop trigger if exists v2ray_quotas_touch_updated_at on public.v2ray_quotas;
create trigger v2ray_quotas_touch_updated_at
before update on public.v2ray_quotas
for each row execute function public.touch_updated_at();

drop trigger if exists v2ray_configs_touch_updated_at on public.v2ray_configs;
create trigger v2ray_configs_touch_updated_at
before update on public.v2ray_configs
for each row execute function public.touch_updated_at();
