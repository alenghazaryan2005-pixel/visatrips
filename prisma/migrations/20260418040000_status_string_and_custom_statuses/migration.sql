-- Migrate Order.status from OrderStatus enum to String, and add CustomStatus model.

-- 1) Drop the default so we can alter the column type.
ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;

-- 2) Change column type enum → VARCHAR, casting existing enum values to text.
ALTER TABLE "orders" ALTER COLUMN "status" TYPE VARCHAR(64) USING "status"::text;

-- 3) Reinstate the default as a string literal.
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'UNFINISHED';

-- 4) Drop the now-unused enum type.
DROP TYPE IF EXISTS "OrderStatus";

-- 5) New table for admin-defined custom statuses.
CREATE TABLE "custom_statuses" (
    "id"          TEXT NOT NULL,
    "country"     TEXT NOT NULL DEFAULT 'INDIA',
    "code"        TEXT NOT NULL,
    "label"       TEXT NOT NULL,
    "color"       TEXT NOT NULL DEFAULT 'slate',
    "description" TEXT,
    "sortOrder"   INTEGER NOT NULL DEFAULT 50,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    "createdBy"   TEXT,

    CONSTRAINT "custom_statuses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "custom_statuses_country_code_key" ON "custom_statuses"("country", "code");
CREATE INDEX "custom_statuses_country_idx" ON "custom_statuses"("country");
