CREATE TYPE "CautionLevel" AS ENUM ('INFO', 'CAUTION', 'WARNING');
CREATE TYPE "BaumannAxisTarget" AS ENUM ('ALL', 'OILY', 'DRY', 'SENSITIVE', 'RESISTANT', 'PIGMENTED', 'NON_PIGMENTED', 'WRINKLED', 'TIGHT');
CREATE TABLE "ingredient_caution_rules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "standard_name" TEXT NOT NULL,
  "inci_name" TEXT,
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "target_axis" "BaumannAxisTarget" NOT NULL,
  "caution_level" "CautionLevel" NOT NULL DEFAULT 'CAUTION',
  "reason_ko" TEXT NOT NULL,
  "description_ko" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ingredient_caution_rules_standard_name_key" ON "ingredient_caution_rules"("standard_name");
CREATE INDEX "ingredient_caution_rules_target_axis_idx" ON "ingredient_caution_rules"("target_axis");
INSERT INTO "ingredient_caution_rules" ("id","standard_name","inci_name","aliases","target_axis","caution_level","reason_ko","description_ko") VALUES ('30000000-0000-4000-8000-000000000001','변성알코올','Alcohol Denat.',ARRAY['에탄올','Ethanol','Alcohol','알코올'],'SENSITIVE','CAUTION','휘발성 알코올이 포함되어 있습니다. 민감하게 느껴지는 피부에서는 건조감이나 따가움이 생길 수 있어 사용 반응을 확인해 주세요.','용매로 사용되며 가벼운 사용감을 만드는 데 쓰입니다.');
INSERT INTO "ingredient_caution_rules" ("id","standard_name","inci_name","aliases","target_axis","caution_level","reason_ko","description_ko") VALUES ('30000000-0000-4000-8000-000000000002','향료','Fragrance',ARRAY['Parfum','Perfume','합성향료'],'SENSITIVE','CAUTION','향료가 포함되어 있습니다. 향 성분에 민감하거나 알레르기 경험이 있다면 상세 표기와 사용 반응을 확인해 주세요.','제품에 향을 부여하는 데 사용됩니다.');
INSERT INTO "ingredient_caution_rules" ("id","standard_name","inci_name","aliases","target_axis","caution_level","reason_ko","description_ko") VALUES ('30000000-0000-4000-8000-000000000003','소듐라우릴설페이트','Sodium Lauryl Sulfate',ARRAY['SLS'],'DRY','CAUTION','세정 성분이 포함되어 있습니다. 건조하게 느껴지는 피부에서는 세정 후 당김이 생길 수 있습니다. 제품 용도와 사용 시간을 확인해 주세요.','기름 성분과 물이 섞이도록 돕고 세정에 사용됩니다.');
INSERT INTO "ingredient_caution_rules" ("id","standard_name","inci_name","aliases","target_axis","caution_level","reason_ko","description_ko") VALUES ('30000000-0000-4000-8000-000000000004','소듐라우레스설페이트','Sodium Laureth Sulfate',ARRAY['SLES'],'DRY','CAUTION','세정 성분이 포함되어 있습니다. 건조한 피부에서는 세정 후 느낌과 사용 빈도를 확인해 주세요.','세정과 거품 형성에 사용되는 계면활성제입니다.');
INSERT INTO "ingredient_caution_rules" ("id","standard_name","inci_name","aliases","target_axis","caution_level","reason_ko","description_ko") VALUES ('30000000-0000-4000-8000-000000000005','살리실릭애씨드','Salicylic Acid',ARRAY['살리실산'],'SENSITIVE','CAUTION','각질 정돈 성분이 포함되어 있습니다. 전성분만으로 함량·pH를 알 수 없으므로 민감한 피부에서는 사용 빈도와 다른 각질 관리 제품의 병용을 확인해 주세요.','피부 표면의 각질을 정돈하는 용도로 사용됩니다.');
INSERT INTO "ingredient_caution_rules" ("id","standard_name","inci_name","aliases","target_axis","caution_level","reason_ko","description_ko") VALUES ('30000000-0000-4000-8000-000000000006','글라이콜릭애씨드','Glycolic Acid',ARRAY['글리콜릭애씨드','글리콜산'],'SENSITIVE','CAUTION','각질 정돈 성분이 포함되어 있습니다. 전성분만으로 농도를 판단할 수 없습니다. 민감한 피부에서는 사용 반응과 제품 사용법을 확인해 주세요.','피부 표면의 각질을 정돈하는 용도로 사용됩니다.');
INSERT INTO "ingredient_caution_rules" ("id","standard_name","inci_name","aliases","target_axis","caution_level","reason_ko","description_ko") VALUES ('30000000-0000-4000-8000-000000000007','페퍼민트오일','Mentha Piperita Oil',ARRAY['Peppermint Oil'],'SENSITIVE','CAUTION','향을 부여하는 오일이 포함되어 있습니다. 향 성분에 민감한 피부에서는 사용 반응을 확인해 주세요.','제품의 향과 사용감을 위해 사용됩니다.');
