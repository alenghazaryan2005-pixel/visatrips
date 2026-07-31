-- AddManualLinkedOrders
-- Stores order IDs the agent manually attached to a ticket via the
-- "Link Order" button on the ticket detail sidebar, in addition to
-- whatever we auto-link by email match. Nullable, comma-separated
-- Order.id values (opaque cuids) — a lightweight alternative to a
-- proper join table since manual links are low-cardinality per ticket.
ALTER TABLE "tickets" ADD COLUMN "manualLinkedOrderIds" TEXT;
