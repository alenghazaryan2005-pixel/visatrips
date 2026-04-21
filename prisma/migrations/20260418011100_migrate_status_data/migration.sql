-- Migrate existing data to new status values
-- PENDING       → UNFINISHED (customer hasn't completed finish page)
-- UNDER_REVIEW  → PROCESSING (we review before submitting)
-- APPROVED      → COMPLETED  (visa delivered)
UPDATE "orders" SET "status" = 'UNFINISHED' WHERE "status" = 'PENDING';
UPDATE "orders" SET "status" = 'PROCESSING' WHERE "status" = 'UNDER_REVIEW';
UPDATE "orders" SET "status" = 'COMPLETED' WHERE "status" = 'APPROVED';

-- Update the column default
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'UNFINISHED';
