-- CreateEnum
CREATE TYPE "AbcClass" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "DisposalAction" AS ENUM ('PRICE_CUT', 'BUNDLE', 'RETURN_TO_SUPPLIER', 'WHOLESALE', 'DONATION', 'WRITE_OFF');

-- CreateEnum
CREATE TYPE "DeadStockStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "WriteDownStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "abcClass" "AbcClass";

-- CreateTable
CREATE TABLE "DeadStockFlag" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "ageDays" INTEGER NOT NULL,
    "qtyOnHand" INTEGER NOT NULL,
    "unitCost" DECIMAL(18,2) NOT NULL,
    "deadCost" DECIMAL(18,2) NOT NULL,
    "carryingCost" DECIMAL(18,2) NOT NULL,
    "opportunityCost" DECIMAL(18,2) NOT NULL,
    "totalLoss" DECIMAL(18,2) NOT NULL,
    "carryingRate" DECIMAL(6,4) NOT NULL,
    "expectedROI" DECIMAL(6,4) NOT NULL,
    "thresholdDays" INTEGER NOT NULL,
    "status" "DeadStockStatus" NOT NULL DEFAULT 'OPEN',
    "suggestedAction" "DisposalAction",
    "suggestedDiscount" DECIMAL(6,4),
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeadStockFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WriteDown" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitCost" DECIMAL(18,2) NOT NULL,
    "amountUZS" DECIMAL(18,2) NOT NULL,
    "action" "DisposalAction" NOT NULL DEFAULT 'WRITE_OFF',
    "reason" TEXT NOT NULL,
    "status" "WriteDownStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WriteDown_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeadStockFlag_productId_key" ON "DeadStockFlag"("productId");

-- CreateIndex
CREATE INDEX "DeadStockFlag_status_idx" ON "DeadStockFlag"("status");

-- CreateIndex
CREATE INDEX "DeadStockFlag_scannedAt_idx" ON "DeadStockFlag"("scannedAt");

-- CreateIndex
CREATE INDEX "WriteDown_productId_idx" ON "WriteDown"("productId");

-- CreateIndex
CREATE INDEX "WriteDown_status_idx" ON "WriteDown"("status");

-- AddForeignKey
ALTER TABLE "DeadStockFlag" ADD CONSTRAINT "DeadStockFlag_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriteDown" ADD CONSTRAINT "WriteDown_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriteDown" ADD CONSTRAINT "WriteDown_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriteDown" ADD CONSTRAINT "WriteDown_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
