begin;
-- From now on old envelopes (including the quarantined partial copy) and
-- accepted consolidation decisions are audit evidence, never update targets.
do $$ declare t text; begin
 foreach t in array array['source_backups','identity_aliases','canonical_imports'] loop
  execute format('create trigger evidence_immutable before update or delete on financeapp_private.%I for each row execute function financeapp_private.reject_preservation_mutation()',t);
  execute format('create trigger evidence_no_truncate before truncate on financeapp_private.%I for each statement execute function financeapp_private.reject_preservation_mutation()',t);
 end loop;
end $$;
commit;
