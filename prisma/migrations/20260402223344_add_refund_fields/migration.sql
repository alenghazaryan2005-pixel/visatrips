-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "refundAmount" DOUBLE PRECISION,
ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3);
