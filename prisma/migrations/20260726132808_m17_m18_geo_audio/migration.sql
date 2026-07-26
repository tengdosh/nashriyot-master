-- CreateEnum
CREATE TYPE "GeoStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "AudioJobStatus" AS ENUM ('BLOCKED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AudioChapterStatus" AS ENUM ('QUEUED', 'SYNTHESIZED', 'FAILED');

-- CreateTable
CREATE TABLE "GeoAnnotation" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "status" "GeoStatus" NOT NULL DEFAULT 'DRAFT',
    "metaTitle" TEXT NOT NULL,
    "metaDescription" TEXT NOT NULL,
    "keywords" TEXT[],
    "jsonLd" JSONB NOT NULL,
    "blurb" TEXT,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeoAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioJob" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'uz',
    "provider" TEXT NOT NULL DEFAULT 'none',
    "status" "AudioJobStatus" NOT NULL DEFAULT 'QUEUED',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioChapter" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "heading" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "status" "AudioChapterStatus" NOT NULL DEFAULT 'QUEUED',
    "previewUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioChapter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeoAnnotation_titleId_key" ON "GeoAnnotation"("titleId");

-- CreateIndex
CREATE INDEX "GeoAnnotation_status_idx" ON "GeoAnnotation"("status");

-- CreateIndex
CREATE INDEX "AudioJob_titleId_idx" ON "AudioJob"("titleId");

-- CreateIndex
CREATE INDEX "AudioJob_status_idx" ON "AudioJob"("status");

-- CreateIndex
CREATE INDEX "AudioChapter_jobId_idx" ON "AudioChapter"("jobId");

-- AddForeignKey
ALTER TABLE "GeoAnnotation" ADD CONSTRAINT "GeoAnnotation_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeoAnnotation" ADD CONSTRAINT "GeoAnnotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeoAnnotation" ADD CONSTRAINT "GeoAnnotation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioJob" ADD CONSTRAINT "AudioJob_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioJob" ADD CONSTRAINT "AudioJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioChapter" ADD CONSTRAINT "AudioChapter_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AudioJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

