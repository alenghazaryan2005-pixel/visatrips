-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'NEEDS_CORRECTION';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "flaggedFields" TEXT,
ADD COLUMN     "specialistNotes" TEXT;
