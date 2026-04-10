-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "lastViewedAt" TIMESTAMP(3),
ADD COLUMN     "lastViewedBy" TEXT,
ADD COLUMN     "tags" TEXT;
