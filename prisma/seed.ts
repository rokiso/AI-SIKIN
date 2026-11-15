import { sampleCatalogProducts } from "../lib/catalog/sample-data";
import type { PrismaClient } from "../generated/prisma/client";

export const SAMPLE_PROCEDURE_IDS = Array.from(
  { length: 10 },
  (_, index) => `00000000-0000-4000-8000-${String(index + 101).padStart(12, "0")}`,
);

export const SAMPLE_PRODUCT_IDS = sampleCatalogProducts.map((p) => p.id);

const procedureNames = [
  "레이저 토닝",
  "피코레이저",
  "LDM 물방울 리프팅",
  "슈링크 유니버스",
  "고주파 리프팅",
  "IPL",
  "프락셔널 레이저",
  "스킨 스케일링",
  "케미컬 필링",
  "광선 관리",
];

/**
 * Development fixtures only. Prices are zero placeholders, never market data.
 * Every entry is inactive and fictional products use a reserved invalid host.
 * Existing records are left unchanged when the deterministic ID already exists.
 */
export async function seedSampleCatalog(client: PrismaClient) {
  return client.$transaction(async (transaction) => {
    for (const [index, name] of procedureNames.entries()) {
      await transaction.medicalProcedure.upsert({
        where: { id: SAMPLE_PROCEDURE_IDS[index] },
        update: {},
        create: {
          id: SAMPLE_PROCEDURE_IDS[index],
          nameKo: `[개발 샘플] ${name}`,
          principleText:
            "개발 환경의 스키마 검증용 표본입니다. 실제 시술 원리나 의료 정보를 제공하지 않습니다.",
          recommendedInterval: "미확인: 공개 전 전문 검토 필요",
          sideEffects: [],
          minPriceKrw: 0,
          maxPriceKrw: 0,
          isActive: false,
        },
      });
    }

    for (const product of sampleCatalogProducts) {
      await transaction.product.upsert({ where: { id: product.id }, update: {}, create: product });
    }

    return { products: sampleCatalogProducts.length, procedures: procedureNames.length };
  });
}
