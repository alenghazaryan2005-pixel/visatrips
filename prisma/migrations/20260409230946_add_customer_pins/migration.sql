-- CreateTable
CREATE TABLE "customer_pins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_pins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_pins_email_key" ON "customer_pins"("email");

-- CreateIndex
CREATE INDEX "customer_pins_email_idx" ON "customer_pins"("email");
