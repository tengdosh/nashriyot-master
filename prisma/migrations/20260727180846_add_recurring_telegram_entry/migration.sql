-- AlterTable
ALTER TABLE "CostEntry" ADD COLUMN     "refId" TEXT,
ADD COLUMN     "refType" TEXT;

-- CreateTable
CREATE TABLE "RecurringCost" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'UZS',
    "rate" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "category" "CostCategory" NOT NULL DEFAULT 'BOSHQA',
    "scope" TEXT NOT NULL DEFAULT 'FIXED',
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "startMonth" TEXT NOT NULL,
    "endMonth" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramEntryToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'entry.write',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramEntryToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringCost_entityId_idx" ON "RecurringCost"("entityId");

-- CreateIndex
CREATE INDEX "RecurringCost_startMonth_idx" ON "RecurringCost"("startMonth");

-- CreateIndex
CREATE INDEX "RecurringCost_archivedAt_idx" ON "RecurringCost"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramEntryToken_token_key" ON "TelegramEntryToken"("token");

-- CreateIndex
CREATE INDEX "TelegramEntryToken_userId_idx" ON "TelegramEntryToken"("userId");

-- CreateIndex
CREATE INDEX "TelegramEntryToken_expiresAt_idx" ON "TelegramEntryToken"("expiresAt");

-- CreateIndex
CREATE INDEX "CostEntry_refType_refId_idx" ON "CostEntry"("refType", "refId");

-- AddForeignKey
ALTER TABLE "RecurringCost" ADD CONSTRAINT "RecurringCost_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramEntryToken" ADD CONSTRAINT "TelegramEntryToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
