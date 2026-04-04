-- CreateEnum
CREATE TYPE "VisaType" AS ENUM ('TOURIST', 'BUSINESS', 'STUDENT', 'WORK');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "visaType" "VisaType" NOT NULL,
    "destination" TEXT NOT NULL,
    "travelDate" TIMESTAMP(3),
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "applications_email_idx" ON "applications"("email");

-- CreateIndex
CREATE INDEX "applications_status_idx" ON "applications"("status");
