-- F16 — Template Importer: structured HPD sections on report templates.
--
-- report_templates already holds findings_template (→ RÉSULTATS) and
-- impression_template (→ CONCLUSION). Doctors' models (e.g. Dr ABIBOU BA's normal
-- templates) also carry INDICATION and TECHNIQUE, and we want to link a template
-- to its exam in the catalog and record where it came from.

alter table public.report_templates
  add column if not exists indication_template text not null default '',
  add column if not exists technique_template  text not null default '',
  add column if not exists exam_type           text,
  add column if not exists source              text;

comment on column public.report_templates.indication_template is 'HPD INDICATION section (default/boilerplate).';
comment on column public.report_templates.technique_template  is 'HPD TECHNIQUE section (default/boilerplate).';
comment on column public.report_templates.exam_type           is 'Optional link to exam_catalog.exam_type (slug).';
comment on column public.report_templates.source              is 'Provenance: manual | import:docx | import:paste | seed:dr-ba.';

-- Lookups by exam within a clinic (template suggestions for a given exam).
create index if not exists report_templates_clinic_exam_idx
  on public.report_templates (clinic_id, exam_type)
  where exam_type is not null;
