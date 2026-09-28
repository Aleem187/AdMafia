-- Public storage bucket for AI-generated product images (replaces Pexels
-- stock photos in generate-ads). Public so the resulting URLs are directly
-- fetchable by ad platforms (e.g. Meta's adcreatives API fetches image_url
-- itself) and usable in plain <img> tags without signed URLs.
insert into storage.buckets (id, name, public)
values ('generated-creatives', 'generated-creatives', true)
on conflict (id) do nothing;
