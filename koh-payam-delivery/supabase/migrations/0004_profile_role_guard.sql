-- A team member must not be able to change their own role (self privilege-escalation).
-- Phase 1 has no self-service profile editing; managers/service-role manage profiles.
drop policy if exists self_update_profile on public.profiles;
