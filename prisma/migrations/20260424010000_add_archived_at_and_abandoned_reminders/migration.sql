-- Archive lifecycle for Completed orders: non-null = hidden from default
-- Completed view, surfaces in the Archive tab, detail view shows redacted card.
ALTER TABLE "orders" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "orders_archivedAt_idx" ON "orders"("archivedAt");

-- Abandoned-application reminders: daily cron sends up to 3 reminders every 2
-- days (days 2/4/6) to rows with a non-null email, then hard-deletes on day 7.
ALTER TABLE "abandoned_applications" ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "abandoned_applications" ADD COLUMN "lastReminderAt" TIMESTAMP(3);
