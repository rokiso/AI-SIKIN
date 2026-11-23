-- CreateEnum
CREATE TYPE "MilestoneType" AS ENUM ('STREAK_3_DAYS', 'STREAK_7_DAYS');

-- CreateTable
CREATE TABLE "snapshot_milestone_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "milestone_type" "MilestoneType" NOT NULL,
    "achieved_streak_days" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "achieved_date" DATE NOT NULL,
    "start_snapshot_id" TEXT NOT NULL,
    "achieved_snapshot_id" TEXT NOT NULL,
    "summary_comment" TEXT NOT NULL,
    "initial_hydration" "SkinConditionLevel",
    "current_hydration" "SkinConditionLevel",
    "initial_soothing" "SkinConditionLevel",
    "current_soothing" "SkinConditionLevel",
    "initial_sebum" "SkinConditionLevel",
    "current_sebum" "SkinConditionLevel",
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snapshot_milestone_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "snapshot_milestone_reports_user_id_achieved_date_id_idx" ON "snapshot_milestone_reports"("user_id", "achieved_date", "id");

-- CreateIndex
CREATE INDEX "snapshot_milestone_reports_start_snapshot_id_idx" ON "snapshot_milestone_reports"("start_snapshot_id");

-- CreateIndex
CREATE INDEX "snapshot_milestone_reports_achieved_snapshot_id_idx" ON "snapshot_milestone_reports"("achieved_snapshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "snapshot_milestone_reports_user_id_milestone_type_achieved__key" ON "snapshot_milestone_reports"("user_id", "milestone_type", "achieved_date");

-- AddForeignKey
ALTER TABLE "snapshot_milestone_reports" ADD CONSTRAINT "snapshot_milestone_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshot_milestone_reports" ADD CONSTRAINT "snapshot_milestone_reports_start_snapshot_id_fkey" FOREIGN KEY ("start_snapshot_id") REFERENCES "daily_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshot_milestone_reports" ADD CONSTRAINT "snapshot_milestone_reports_achieved_snapshot_id_fkey" FOREIGN KEY ("achieved_snapshot_id") REFERENCES "daily_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

