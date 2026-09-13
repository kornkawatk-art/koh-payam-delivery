-- 0019_claim_closing.sql
-- Claim "closed" status + link resend backorders back to the claim that
-- queued them (feature/claim-closing-status).
--   `claim_status` already has a 'closed' value (0001_core_tables.sql) but no
--   code path ever wrote it -- this feature starts writing it: immediately
--   for an approved refund (nothing left to track), and automatically once
--   every resend-compensation backorder a claim queued has been delivered
--   (markBackorderFulfilled in backorders.ts checks this on each fulfillment).
--   That check needs to walk from a fulfilled backorder back to its claim, so
--   backorders gets a nullable claim_id column. It is nullable and set-once
--   at insert time because only createResendBackorder (reason =
--   'claim_resend') ever populates it -- shortage backorders from
--   syncShortageBackorders never originate from a claim and keep it null
--   forever. `on delete set null` mirrors this table's other order_id-style
--   FKs (target_order_id) so a deleted claim never blocks a backorder row.
alter table backorders
  add column if not exists claim_id uuid references claims(id) on delete set null;

create index on backorders (claim_id) where claim_id is not null;
