-- Deploy the journal-independent bridge to every writer before this release.
-- Fail closed on contention or an unexpected external dependency.
SET LOCAL lock_timeout = '2s';
DROP TABLE public.transition_journal RESTRICT;
