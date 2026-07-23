-- AlterTable
ALTER TABLE "Title" ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "searchVector" tsvector;

-- CreateIndex
CREATE INDEX "Title_entityId_idx" ON "Title"("entityId");

-- CreateIndex
CREATE INDEX "Title_searchVector_idx" ON "Title" USING GIN ("searchVector");

-- AddForeignKey
ALTER TABLE "Title" ADD CONSTRAINT "Title_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Full-text search vector, maintained by a trigger (⌘K search).
CREATE OR REPLACE FUNCTION title_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('simple', coalesce(NEW."workTitle", '')), 'A') ||
    setweight(to_tsvector('simple', array_to_string(coalesce(NEW."keywords", ARRAY[]::text[]), ' ')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS title_search_vector_trigger ON "Title";
CREATE TRIGGER title_search_vector_trigger
  BEFORE INSERT OR UPDATE OF "workTitle", "keywords" ON "Title"
  FOR EACH ROW EXECUTE FUNCTION title_search_vector_update();

-- Backfill any existing rows.
UPDATE "Title" SET "workTitle" = "workTitle";
