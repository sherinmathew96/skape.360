-- Drawing registers list the newest drawing first in each group.
-- Existing registers are re-ordered once by when each drawing was added.
UPDATE "drawings" d SET "position" = o.n FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "project_id", "group_id" ORDER BY "created_at" DESC))::int - 1 AS n FROM "drawings"
) o WHERE o."id" = d."id";
