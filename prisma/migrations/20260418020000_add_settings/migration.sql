CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "settings_category_idx" ON "settings"("category");
