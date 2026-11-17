-- The resolved access deadline must survive asynchronous artifact publication.
-- NULL fences attempts prepared by a binary that did not capture this evidence.
ALTER TABLE ship_render_requests ADD COLUMN publication_valid_until bigint;
