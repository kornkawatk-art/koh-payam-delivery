-- 0029_broken_eggs_claim.sql
-- New claim type "ไข่แตก" (feature/broken-eggs): eggs ship by the tray or
-- bundle but break by the egg, so these claims count eggs, not Makro units.
alter type public.claim_type add value if not exists 'broken_eggs';

-- A "ส่งชดเชย" for broken eggs is owed in eggs ("7 ฟอง"), not in Makro units
-- ("x7"). NULL = the Makro unit, as before.
alter table public.backorders add column if not exists unit text;
