-- Home Link Botswana: PostgreSQL schema for Supabase (13 tables from the ERD)
-- Run once in Supabase: SQL Editor > New query > paste > Run.

-- ========== TABLES ==========
create table public.users(
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  phone text,
  role text not null default 'tenant' check (role in ('tenant','provider','admin')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now());

create table public.locations(
  location_id int generated always as identity primary key,
  area text not null, city text not null, unique(area,city));

create table public.property_types(
  type_id int generated always as identity primary key,
  name text not null unique);

create table public.tenants(
  user_id uuid primary key references public.users(id) on delete cascade,
  preferred_location_id int references public.locations(location_id));

create table public.providers(
  user_id uuid primary key references public.users(id) on delete cascade,
  provider_type text not null default 'landlord' check (provider_type in ('landlord','agent')),
  business_name text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','pending','verified','rejected')));

create table public.properties(
  property_id bigint generated always as identity primary key,
  provider_id uuid not null references public.providers(user_id),
  type_id int not null references public.property_types(type_id),
  location_id int not null references public.locations(location_id),
  title text not null, description text, amenities text,
  bedrooms int not null default 1 check (bedrooms >= 0),
  monthly_rent numeric(10,2) not null check (monthly_rent > 0),
  listing_status text not null default 'pending' check (listing_status in ('pending','approved','rejected')),
  availability_status text not null default 'available' check (availability_status in ('available','rented','unavailable')),
  availability_confirmed_at timestamptz not null default now(),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create index on public.properties(location_id);
create index on public.properties(monthly_rent);
create index on public.properties(listing_status, availability_status);

create table public.property_photos(
  photo_id bigint generated always as identity primary key,
  property_id bigint not null references public.properties(property_id) on delete cascade,
  file_path text not null, sort_order int not null default 0);

create table public.availability_updates(
  update_id bigint generated always as identity primary key,
  property_id bigint not null references public.properties(property_id) on delete cascade,
  old_status text not null, new_status text not null,
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now());

create table public.verification_records(
  verification_id bigint generated always as identity primary key,
  provider_id uuid not null references public.providers(user_id),
  property_id bigint references public.properties(property_id) on delete cascade,
  doc_type text not null check (doc_type in ('identity','authority_to_let')),
  file_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.users(id), review_notes text,
  submitted_at timestamptz not null default now(), reviewed_at timestamptz,
  check (doc_type <> 'authority_to_let' or property_id is not null));

create table public.viewing_requests(
  request_id bigint generated always as identity primary key,
  property_id bigint not null references public.properties(property_id) on delete cascade,
  tenant_id uuid not null references public.tenants(user_id),
  preferred_at timestamptz not null, message text,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(), responded_at timestamptz);

create table public.favorites(
  tenant_id uuid references public.tenants(user_id) on delete cascade,
  property_id bigint references public.properties(property_id) on delete cascade,
  primary key (tenant_id, property_id));

create table public.notifications(
  notification_id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  message text not null, is_read boolean not null default false,
  created_at timestamptz not null default now());

create table public.listing_reports( -- phase 2
  report_id bigint generated always as identity primary key,
  property_id bigint not null references public.properties(property_id) on delete cascade,
  reporter_id uuid not null references public.users(id),
  reason text not null check (reason in ('scam','outdated','incorrect_information','other')),
  details text,
  status text not null default 'open' check (status in ('open','reviewed','dismissed')),
  reviewed_by uuid references public.users(id),
  created_at timestamptz not null default now());

-- ========== HELPER FUNCTIONS ==========
create function public.is_admin() returns boolean language sql security definer stable set search_path='' as
$$ select exists(select 1 from public.users where id = auth.uid() and role = 'admin') $$;

create function public.is_verified(pid uuid) returns boolean language sql security definer stable set search_path='' as
$$ select exists(select 1 from public.providers where user_id = pid and verification_status = 'verified') $$;

create function public.notify(uid uuid, msg text) returns void language sql security definer set search_path='' as
$$ insert into public.notifications(user_id, message) values (uid, msg) $$;
revoke execute on function public.notify(uuid, text) from public, anon, authenticated;

-- ========== TRIGGERS ==========
-- New sign-up: create profile. Only tenant or provider can be chosen; admins are set manually.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare r text := case when new.raw_user_meta_data->>'role' = 'provider' then 'provider' else 'tenant' end;
begin
  insert into public.users(id, email, full_name, role)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''), r);
  if r = 'provider' then insert into public.providers(user_id) values (new.id);
  else insert into public.tenants(user_id) values (new.id); end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Identity document submitted: provider becomes pending.
create function public.on_verification_submitted() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.doc_type = 'identity' then
    update public.providers set verification_status = 'pending'
      where user_id = new.provider_id and verification_status in ('unverified','rejected');
  end if;
  return new;
end $$;
create trigger trg_verification_submitted after insert on public.verification_records
  for each row execute function public.on_verification_submitted();

-- Availability change: write the log, cancel pending viewings, refresh confirmation date.
create function public.on_availability_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.availability_status is distinct from old.availability_status then
    insert into public.availability_updates(property_id, old_status, new_status, updated_by)
      values (new.property_id, old.availability_status, new.availability_status, auth.uid());
    if new.availability_status <> 'available' then
      update public.viewing_requests set status = 'cancelled'
        where property_id = new.property_id and status = 'pending';
    end if;
  end if;
  new.availability_confirmed_at := now(); new.updated_at := now();
  return new;
end $$;
create trigger trg_availability before update on public.properties
  for each row execute function public.on_availability_change();

create function public.on_viewing_insert() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.notify((select provider_id from public.properties where property_id = new.property_id), 'You have a new viewing request.');
  return new;
end $$;
create trigger trg_viewing_insert after insert on public.viewing_requests
  for each row execute function public.on_viewing_insert();

create function public.on_viewing_update() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status <> old.status then
    new.responded_at := now();
    perform public.notify(new.tenant_id, 'Your viewing request was ' || new.status || '.');
  end if;
  return new;
end $$;
create trigger trg_viewing_update before update on public.viewing_requests
  for each row execute function public.on_viewing_update();

-- ========== ADMIN ACTIONS (only administrators can call these successfully) ==========
create function public.review_verification(vid bigint, approve boolean, notes text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v public.verification_records;
begin
  if not public.is_admin() then raise exception 'Administrators only'; end if;
  update public.verification_records
    set status = case when approve then 'approved' else 'rejected' end,
        reviewed_by = auth.uid(), review_notes = notes, reviewed_at = now()
    where verification_id = vid and status = 'pending' returning * into v;
  if not found then raise exception 'No pending record with that id'; end if;
  if v.doc_type = 'identity' then
    update public.providers set verification_status = case when approve then 'verified' else 'rejected' end
      where user_id = v.provider_id;
  end if;
  perform public.notify(v.provider_id, 'Your ' || replace(v.doc_type,'_',' ') || ' document was '
    || case when approve then 'approved.' else 'rejected. ' || coalesce(notes,'') end);
end $$;

create function public.review_listing(pid bigint, approve boolean, notes text default null)
returns void language plpgsql security definer set search_path='' as $$
declare prov uuid;
begin
  if not public.is_admin() then raise exception 'Administrators only'; end if;
  update public.properties set listing_status = case when approve then 'approved' else 'rejected' end,
    admin_notes = notes where property_id = pid and listing_status = 'pending' returning provider_id into prov;
  if not found then raise exception 'No pending listing with that id'; end if;
  perform public.notify(prov, 'Your listing was ' || case when approve then 'approved.' else 'rejected. ' || coalesce(notes,'') end);
end $$;

-- ========== PUBLIC VIEW: verified providers' display names only ==========
create view public.provider_public as
  select p.user_id, coalesce(p.business_name, u.full_name) as name, p.provider_type
  from public.providers p join public.users u on u.id = p.user_id
  where p.verification_status = 'verified';
grant select on public.provider_public to anon, authenticated;

-- ========== ROW LEVEL SECURITY ==========
alter table public.users enable row level security;
alter table public.locations enable row level security;
alter table public.property_types enable row level security;
alter table public.tenants enable row level security;
alter table public.providers enable row level security;
alter table public.properties enable row level security;
alter table public.property_photos enable row level security;
alter table public.availability_updates enable row level security;
alter table public.verification_records enable row level security;
alter table public.viewing_requests enable row level security;
alter table public.favorites enable row level security;
alter table public.notifications enable row level security;
alter table public.listing_reports enable row level security;

create policy "own or admin" on public.users for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "read lookups" on public.locations for select using (true);
create policy "read types" on public.property_types for select using (true);

create policy "own or admin" on public.tenants for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "own update" on public.tenants for update to authenticated using (user_id = auth.uid());
create policy "own or admin" on public.providers for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Listings: public only when approved AND provider verified.
create policy "visible listings" on public.properties for select to anon, authenticated
  using ((listing_status = 'approved' and public.is_verified(provider_id)) or provider_id = auth.uid() or public.is_admin());
create policy "verified providers add" on public.properties for insert to authenticated
  with check (provider_id = auth.uid() and public.is_verified(auth.uid())
              and listing_status = 'pending' and availability_status = 'available');
create policy "owner updates availability" on public.properties for update to authenticated using (provider_id = auth.uid());

create policy "see photos of visible listings" on public.property_photos for select to anon, authenticated
  using (exists (select 1 from public.properties p where p.property_id = property_photos.property_id));
create policy "owner adds photos" on public.property_photos for insert to authenticated
  with check (exists (select 1 from public.properties p where p.property_id = property_photos.property_id and p.provider_id = auth.uid()));
create policy "owner deletes photos" on public.property_photos for delete to authenticated
  using (exists (select 1 from public.properties p where p.property_id = property_photos.property_id and p.provider_id = auth.uid()));

create policy "owner or admin" on public.availability_updates for select to authenticated
  using (public.is_admin() or exists (select 1 from public.properties p where p.property_id = availability_updates.property_id and p.provider_id = auth.uid()));

create policy "own or admin" on public.verification_records for select to authenticated using (provider_id = auth.uid() or public.is_admin());
create policy "provider submits" on public.verification_records for insert to authenticated
  with check (provider_id = auth.uid() and status = 'pending' and reviewed_by is null
    and (property_id is null or exists (select 1 from public.properties p where p.property_id = verification_records.property_id and p.provider_id = auth.uid())));

create policy "parties or admin" on public.viewing_requests for select to authenticated
  using (tenant_id = auth.uid() or public.is_admin()
    or exists (select 1 from public.properties p where p.property_id = viewing_requests.property_id and p.provider_id = auth.uid()));
create policy "tenant requests" on public.viewing_requests for insert to authenticated
  with check (tenant_id = auth.uid() and status = 'pending'
    and exists (select 1 from public.properties p where p.property_id = viewing_requests.property_id
                and p.listing_status = 'approved' and p.availability_status = 'available'));
create policy "provider responds" on public.viewing_requests for update to authenticated
  using (exists (select 1 from public.properties p where p.property_id = viewing_requests.property_id and p.provider_id = auth.uid()));

create policy "own favorites" on public.favorites for all to authenticated using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());
create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "mark read" on public.notifications for update to authenticated using (user_id = auth.uid());

create policy "report" on public.listing_reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "own or admin" on public.listing_reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy "admin reviews" on public.listing_reports for update to authenticated using (public.is_admin());

-- Column limits: users can change only these fields; everything else goes through triggers or admin functions.
revoke update on public.properties, public.viewing_requests, public.notifications, public.tenants, public.listing_reports from anon, authenticated;
grant update (availability_status) on public.properties to authenticated;
grant update (status) on public.viewing_requests to authenticated;
grant update (is_read) on public.notifications to authenticated;
grant update (preferred_location_id) on public.tenants to authenticated;
grant update (status, reviewed_by) on public.listing_reports to authenticated;
revoke all on public.users, public.providers, public.verification_records, public.availability_updates from anon;

-- ========== FILE STORAGE ==========
insert into storage.buckets (id, name, public) values
  ('verification-docs','verification-docs', false),
  ('property-photos','property-photos', true) on conflict do nothing;

create policy "upload own documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read own documents or admin" on storage.objects for select to authenticated
  using (bucket_id = 'verification-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "upload own photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ========== STARTING DATA ==========
insert into public.property_types(name) values ('Room'),('Flat'),('House'),('Cottage');
insert into public.locations(area, city) values
  ('Phakalane','Gaborone'),('Block 8','Gaborone'),('Broadhurst','Gaborone'),('Gaborone West','Gaborone'),
  ('Phase 4','Francistown'),('Central','Palapye'),('Sexaxa','Maun'),('Kasane','Kasane');

-- After you sign up your own admin account on the site, make it an administrator:
-- update public.users set role = 'admin' where email = 'YOUR_EMAIL_HERE';
