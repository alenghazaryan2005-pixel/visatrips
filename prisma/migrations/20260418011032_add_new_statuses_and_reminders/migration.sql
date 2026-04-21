-- Step 1: Add new enum values (must commit before they can be used as default or in data)
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'UNFINISHED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

-- Step 2: Add the new columns for reminder tracking
ALTER TABLE "orders" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "reminderCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "submittedAt" TIMESTAMP(3);
