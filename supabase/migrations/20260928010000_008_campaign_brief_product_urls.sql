-- Lets a campaign run reference the actual product page(s) being advertised,
-- pasted directly on the New Run page instead of managed on a separate page.
alter table campaign_briefs add column if not exists product_urls text[] default '{}';
