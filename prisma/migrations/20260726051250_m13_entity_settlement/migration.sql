-- CreateTable
CREATE TABLE "EntitySettlement" (
    "id" TEXT NOT NULL,
    "fromEntityId" TEXT NOT NULL,
    "toEntityId" TEXT NOT NULL,
    "amountUZS" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntitySettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntitySettlement_fromEntityId_idx" ON "EntitySettlement"("fromEntityId");

-- CreateIndex
CREATE INDEX "EntitySettlement_toEntityId_idx" ON "EntitySettlement"("toEntityId");

-- AddForeignKey
ALTER TABLE "EntitySettlement" ADD CONSTRAINT "EntitySettlement_fromEntityId_fkey" FOREIGN KEY ("fromEntityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitySettlement" ADD CONSTRAINT "EntitySettlement_toEntityId_fkey" FOREIGN KEY ("toEntityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

