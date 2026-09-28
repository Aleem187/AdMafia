-- Products the user can catalog for reference when creating campaign runs.
-- Standalone for now: not yet wired into generate-ads or NewRunPage.
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text default '',
  image_url text,
  created_at timestamptz default now()
);

alter table products enable row level security;

drop policy if exists "select_own_products" on products;
create policy "select_own_products" on products for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists "insert_own_products" on products;
create policy "insert_own_products" on products for insert
  to authenticated with check (auth.uid() = user_id);

drop policy if exists "update_own_products" on products;
create policy "update_own_products" on products for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_products" on products;
create policy "delete_own_products" on products for delete
  to authenticated using (auth.uid() = user_id);

create index if not exists idx_products_user on products(user_id);

-- Public bucket for product photos, mirroring generated-creatives: public
-- read so images display and could later be referenced by ad platforms,
-- but writes/deletes are scoped to the uploading user's own folder.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "authenticated_upload_own_product_images" on storage.objects;
create policy "authenticated_upload_own_product_images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "authenticated_delete_own_product_images" on storage.objects;
create policy "authenticated_delete_own_product_images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);
