CREATE TABLE "custom_email_templates" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'INDIA',
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "subject" TEXT NOT NULL,
    "structured" TEXT,
    "html" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    CONSTRAINT "custom_email_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "custom_email_templates_country_code_key" ON "custom_email_templates"("country", "code");
CREATE INDEX "custom_email_templates_country_idx" ON "custom_email_templates"("country");
CREATE INDEX "custom_email_templates_trigger_idx" ON "custom_email_templates"("trigger");
