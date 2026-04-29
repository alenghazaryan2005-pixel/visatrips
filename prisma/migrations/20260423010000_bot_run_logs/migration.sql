-- Per-order bot runs + per-field entries. Used for audit trail and debugging
-- when the gov site changes a selector.

CREATE TABLE "bot_runs" (
    "id"         TEXT NOT NULL,
    "orderId"    TEXT NOT NULL,
    "startedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status"     TEXT NOT NULL DEFAULT 'running',
    "country"    TEXT NOT NULL DEFAULT 'INDIA',
    "errorMsg"   TEXT,

    CONSTRAINT "bot_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bot_runs_orderId_idx"   ON "bot_runs"("orderId");
CREATE INDEX "bot_runs_startedAt_idx" ON "bot_runs"("startedAt");

CREATE TABLE "bot_run_entries" (
    "id"        TEXT NOT NULL,
    "runId"     TEXT NOT NULL,
    "stepKey"   TEXT NOT NULL,
    "fieldKey"  TEXT NOT NULL,
    "label"     TEXT NOT NULL,
    "action"    TEXT NOT NULL,
    "source"    TEXT NOT NULL,
    "value"     TEXT,
    "success"   BOOLEAN NOT NULL DEFAULT true,
    "errorMsg"  TEXT,
    "selector"  TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_run_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bot_run_entries_runId_idx"   ON "bot_run_entries"("runId");
CREATE INDEX "bot_run_entries_stepKey_idx" ON "bot_run_entries"("stepKey");

ALTER TABLE "bot_run_entries"
  ADD CONSTRAINT "bot_run_entries_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "bot_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
