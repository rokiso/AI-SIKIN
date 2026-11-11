-- AlterTable
ALTER TABLE "diagnostic_reports" ADD COLUMN     "caution_ingredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "recommended_ingredients" TEXT[] DEFAULT ARRAY[]::TEXT[];

