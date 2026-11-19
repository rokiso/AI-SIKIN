-- FDA safety communication (2025-10-15), limited to certain RF microneedling uses.
-- Append only: preserve curated text, prices, questions and all other procedures.
-- Both updates are one atomic statement. Repeat application adds no duplicate.
WITH note AS (
  SELECT 'RF 미세침 방식의 일부 사용에서는 흉터·지방 손실·신경 손상 등 중대한 합병증이 보고되었습니다. 비침습 RF와 구분해 사용할 장비·방식의 위험을 의료진에게 확인하세요.'::text AS content
), updated_procedure AS (
  UPDATE "medical_procedures" AS procedure
  SET "side_effects" = array_append(COALESCE(procedure."side_effects", ARRAY[]::text[]), note.content),
      "updated_at" = CURRENT_TIMESTAMP
  FROM note
  WHERE procedure."code" = 'P-RF'
    AND NOT (note.content = ANY(COALESCE(procedure."side_effects", ARRAY[]::text[])))
  RETURNING procedure."id"
)
UPDATE "procedure_safety_guides" AS guide
SET "rare_risks" = array_append(COALESCE(guide."rare_risks", ARRAY[]::text[]), note.content),
    "updated_at" = CURRENT_TIMESTAMP
FROM "medical_procedures" AS procedure, note
WHERE guide."procedure_id" = procedure."id"
  AND procedure."code" = 'P-RF'
  AND guide."slug" = 'rf-tightening'
  AND NOT (note.content = ANY(COALESCE(guide."rare_risks", ARRAY[]::text[])));
