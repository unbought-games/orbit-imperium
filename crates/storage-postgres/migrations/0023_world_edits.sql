-- Requires servers with the shared world-edit transaction gate before online CLI editing.
CREATE TABLE world_edit_receipts (
  universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  applied_at bigint NOT NULL,
  PRIMARY KEY(universe,operation_id)
);

ALTER TABLE manufacturing_batches DROP CONSTRAINT manufacturing_status_valid;
ALTER TABLE manufacturing_batches ADD CONSTRAINT manufacturing_status_valid CHECK (((data->>'status') IN ('Active','Completed','Cancelled')) IS TRUE);
