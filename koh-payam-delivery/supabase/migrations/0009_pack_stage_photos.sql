alter table evidence_photos
  add column if not exists stage text not null default 'handoff';
alter table evidence_photos
  drop constraint if exists evidence_photos_stage_check;
alter table evidence_photos
  add constraint evidence_photos_stage_check check (stage in ('pack','handoff'));
