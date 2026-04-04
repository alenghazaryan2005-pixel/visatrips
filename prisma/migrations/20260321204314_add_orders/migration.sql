/*
  Warnings:

  - You are about to drop the `applications` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- DropTable
DROP TABLE "applications";

-- DropEnum
DROP TYPE "ApplicationStatus";

-- DropEnum
DROP TYPE "VisaType";

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "destination" TEXT NOT NULL,
    "visaType" TEXT NOT NULL,
    "totalUSD" DOUBLE PRECISION NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "travelers" TEXT NOT NULL,
    "billingEmail" TEXT NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");
