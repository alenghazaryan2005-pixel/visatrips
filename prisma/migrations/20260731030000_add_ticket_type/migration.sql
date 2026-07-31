-- AddTicketType
-- Adds a per-ticket `type` classification (General / Question / Refund /
-- Status Check / Payment Issue / Application Help / Document Issue /
-- Call Request). Free-form text with a default so existing tickets get
-- 'General' and the ALTER doesn't need a follow-up backfill.
ALTER TABLE "tickets" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'General';
