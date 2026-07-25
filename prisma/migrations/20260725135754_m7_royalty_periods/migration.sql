-- AlterTable
ALTER TABLE "RoyaltyRun" ADD COLUMN     "periodEnd" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "periodStart" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "sealedAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RoyaltyStatement" ADD COLUMN     "advanceOutstanding" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cumulativeBefore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "netUnits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reserveReleased" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "returnedUnits" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "RoyaltyRun_periodStart_periodEnd_idx" ON "RoyaltyRun"("periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "RoyaltyStatement_runId_contractId_key" ON "RoyaltyStatement"("runId", "contractId");

