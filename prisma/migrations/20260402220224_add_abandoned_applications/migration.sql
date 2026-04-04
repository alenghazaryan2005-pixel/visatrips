-- CreateTable
CREATE TABLE "abandoned_applications" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "destination" TEXT,
    "visaType" TEXT,
    "email" TEXT,
    "travelers" TEXT,
    "passportData" TEXT,
    "lastStep" TEXT NOT NULL DEFAULT 'step1',
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "abandoned_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "abandoned_applications_createdAt_idx" ON "abandoned_applications"("createdAt");

-- CreateIndex
CREATE INDEX "abandoned_applications_email_idx" ON "abandoned_applications"("email");
