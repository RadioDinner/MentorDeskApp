-- Block 14 of the Journeys feature: pending-assignment flag.
--
-- When a mentee_journey advances into an offering node AND the owning
-- organization has journey_auto_assign_offerings = false, the journey
-- advances to the offering node but we do NOT auto-create the
-- mentee_offerings row. Instead we set pending_assignment_node_id to
-- the target node's client-generated id so:
--   1. JourneyCard can render a "Pending assignment" callout with a
--      Confirm button that manually creates the mentee_offerings row.
--   2. MenteesListPage can show a badge next to any mentee row whose
--      journey is waiting on manual confirmation.
--
-- The column is plain text because node ids live inside the
-- mentee_journeys.content jsonb (they are client-generated, not FKs).
-- When the pending assignment is resolved (or the advance is moved
-- past the offering node), the column is set back to null.
--
-- Migration number 948 per CLAUDE.md rule #6 — numbers count DOWN;
-- previous lowest was 949_journey_auto_assign.sql.

alter table public.mentee_journeys
  add column if not exists pending_assignment_node_id text;

comment on column public.mentee_journeys.pending_assignment_node_id is
  'Client-generated node id (inside content.nodes) of an offering node awaiting manual confirm. Only set when journey_auto_assign_offerings is off and the journey advances into an offering node. Cleared when the offering is confirmed or the journey advances past it.';

notify pgrst, 'reload schema';
